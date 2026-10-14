using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Hosting;
using Adam.Flow2.Runtime;
using NativeDefinition=Adam.Flow2.Runtime.NodeDefinition;

static class GraphControlCases
{
    static readonly TypeRef Integer=new("scalar",Name:"core.Integer"), Bool=new("scalar",Name:"core.Bool"), Text=new("string");
    public static async Task Run(Action<bool,string> check)
    {
        await ListControlCases.Run(check);
        await ListJoinCases.Run(check);
        var factory=new Factory();var effects=new List<string>();
        FlowInterface Signature(FlowParameter[] inputs,FlowParameter[] outputs)=>new(inputs,outputs,new(true,true));
        FlowParameter Param(string name,TypeRef type)=>new(name,name,type);
        var scalar=Signature([Param("x",Integer)],[Param("value",Integer)]);
        var yes=factory.Leaf("yes",scalar,values=>{effects.Add("yes");return new(){{"value",(int)values["x"]+1}};});
        var no=factory.Leaf("no",scalar,values=>{effects.Add("no");return new(){{"value",(int)values["x"]-1}};});
        async Task<ExecutionSnapshot> Execute(string op,FlowInterface signature,Dictionary<string,FlowDocument> slots,Dictionary<string,object> args,string[]? cases=null)
        {
            var root=factory.Root(op,signature,slots,cases);
            var inputs=args.ToDictionary(p=>p.Key,p=>FlowValues.Encode(FlowInterfaces.Describe(root,factory.Create().Nodes.Catalog).Inputs.Single(v=>v.Name==p.Key).Type,p.Value));
            using var runtime=new Orchestrator(TimeProvider.System,factory);
            var result=runtime.Start(root,null,"owner",inputs,new(1,root.Id,[root,..slots.Values.DistinctBy(f=>f.Id)]));
            for(var i=0;i<1000&&result.State is not ("completed" or "failed");i++){await Task.Delay(5);result=runtime.Next(result.ExecutionId,null,"owner").Execution;}
            return result;
        }
        var repeatSignature=Signature([Param("index",Integer),Param("tag",Text)],[]);
        var repeatBody=factory.Leaf("repeat-body",repeatSignature,v=>{effects.Add(v["tag"]+":"+v["index"]);return new();});
        foreach(var repeatCount in new[]{0,3,-1,1001})
        {
            effects.Clear();var repeated=await Execute("repeat",repeatSignature,new(){{"body",repeatBody}},new(){{"count",repeatCount},{"in_tag","kept"}});
            check(repeated.State==(repeatCount<0||repeatCount>1000?"failed":"completed"),"Repeat bounds count");
            check(effects.SequenceEqual(Enumerable.Range(0,repeatCount<0||repeatCount>1000?0:repeatCount).Select(i=>"kept:"+i)),"Repeat sequential index and shared arguments");
        }
        effects.Clear();
        var badRepeatBody=factory.Leaf("repeat-failure",repeatSignature,v=>{effects.Add(v["index"].ToString()!);if((int)v["index"]==1)throw new InvalidOperationException("repeat body failure");return new();});
        var failedRepeat=await Execute("repeat",repeatSignature,new(){{"body",badRepeatBody}},new(){{"count",3},{"in_tag","kept"}});
        check(failedRepeat.State=="failed"&&effects.SequenceEqual(["0","1"]),"Repeat stops after body failure");
        using(var stopped=new CancellationTokenSource())
        {
            var calls=0;var repeatNode=new FlowNode("repeat","Standard.Flow.Repeat",1,"server",[],Graph:new("repeat",repeatSignature));
            try{await GraphControlRuntime.Execute(repeatNode,new Dictionary<string,object>{{"count",3},{"body",new GraphReference("body",1)}},(_,_,_,_,_,_)=>{calls++;stopped.Cancel();return Task.FromResult<IReadOnlyDictionary<string,object>>(new Dictionary<string,object>());},stopped.Token);throw new Exception("Repeat cancellation ignored");}catch(OperationCanceledException){check(calls==1,"Repeat stops when body cancels");}
        }
        var retrySignature=Signature([Param("attempt",Integer),Param("tag",Text)],[Param("value",Integer)]);
        var retryAttempts=new List<int>();
        var retryBody=factory.Leaf("retry-body",retrySignature,v=>
        {
            var attempt=(int)v["attempt"];retryAttempts.Add(attempt);
            if((string)v["tag"]!="kept")throw new Exception("Retry lost shared input");
            if(attempt<3)throw new NodeFailureException("transient","Try again");
            return new(){{"value",attempt}};
        });
        foreach(var retryCase in new[]{(Max:3,Codes:new[]{"transient"},Calls:3,Success:true),(Max:2,Codes:new[]{"transient"},Calls:2,Success:false),(Max:3,Codes:Array.Empty<string>(),Calls:1,Success:false),(Max:3,Codes:new[]{"other"},Calls:1,Success:false)})
        {
            retryAttempts.Clear();
            var retried=await Execute("retry",retrySignature,new(){{"body",retryBody}},new(){{"maxAttempts",retryCase.Max},{"retryCodes",retryCase.Codes},{"in_tag","kept"}});
            check(retried.State==(retryCase.Success?"completed":"failed"),"Native Retry follows explicit retry policy");
            check(retryAttempts.SequenceEqual(Enumerable.Range(1,retryCase.Calls)),"Native Retry uses consecutive one-based attempts");
            check(retryCase.Success?retried.Outputs["out_value"].GetInt32()==3:retried.Error?.Code=="transient"&&retried.Outputs.Count==0,"Native Retry preserves result or original failure code");
        }
        var timeoutEntered=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var timeoutCleaned=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var timeoutBody=factory.Leaf("timeout-body",scalar,_=>[]);
        factory.Async("timeout-body",async (_,token)=>
        {
            timeoutEntered.TrySetResult();
            try{await Task.Delay(30000,token);return new Dictionary<string,object>{{"value",1}};}
            finally{await Task.Delay(40);timeoutCleaned.TrySetResult();}
        });
        var timedOut=await Execute("timeout",scalar,new(){{"body",timeoutBody}},new(){{"timeoutMilliseconds",500},{"in_x",5}});
        check(timeoutEntered.Task.IsCompleted&&timeoutCleaned.Task.IsCompleted,"Native Timeout waits for body cleanup");
        check(timedOut.State=="failed"&&timedOut.Error?.Code=="timeout"&&timedOut.Outputs.Count==0,"Native Timeout preserves timeout code without partial outputs");
        check(timedOut.Invocations.All(i=>i.State=="failed"),"Native Timeout leaves no running child invocation");
        var withinDeadline=await Execute("timeout",scalar,new(){{"body",yes}},new(){{"timeoutMilliseconds",5000},{"in_x",5}});
        check(withinDeadline.State=="completed"&&withinDeadline.Outputs["out_value"].GetInt32()==6,"Native Timeout passes successful body outputs");
        effects.Clear();
        var chosen=await Execute("ifElse",scalar,new(){{"then",yes},{"else",no}},new(){{"condition",true},{"in_x",5}});
        check(chosen.State=="completed"&&chosen.Outputs["out_value"].GetInt32()==6&&effects.SequenceEqual(["yes"]),"IfElse executes only selected branch");
        effects.Clear();
        var skipped=await Execute("if",scalar,new(){{"then",yes}},new(){{"condition",false},{"in_x",5}});
        check(skipped.State=="completed"&&skipped.Outputs.Count==0&&effects.Count==0&&skipped.Invocations.Length==1,"If false leaves outputs absent without invoking body");
        var switched=await Execute("switch",scalar,new(){{"case_0",yes},{"default",no}},new(){{"selector","unknown"},{"in_x",5}},["known"]);
        check(switched.State=="completed"&&switched.Outputs["out_value"].GetInt32()==4,"Switch fallback executes");
        effects.Clear();
        var loopSignature=Signature([Param("item",Integer),Param("index",Integer)],[Param("value",Integer)]);
        var mapping=factory.Leaf("mapping",loopSignature,v=>{effects.Add(v["index"].ToString()!);return new(){{"value",(int)v["item"]*2}};});
        using(var directRuntime=new Orchestrator(TimeProvider.System,factory))
        {
            var unused=factory.WithUnusedInput(mapping);
            var direct=directRuntime.Start(unused,null,"owner",new Dictionary<string,JsonElement>{{"item",JsonSerializer.SerializeToElement(2)},{"index",JsonSerializer.SerializeToElement(99)},{"unused",JsonSerializer.SerializeToElement(10)}});
            for(var i=0;i<1000&&direct.State is not ("completed" or "failed");i++){await Task.Delay(5);direct=directRuntime.Next(direct.ExecutionId,null,"owner").Execution;}
            check(direct.State=="completed"&&direct.Outputs["value"].GetInt32()==4,"Wire inputs bind public parameters even when their input node is skipped");
            effects.Clear();
        }
        var parallelSeen=new System.Collections.Concurrent.ConcurrentBag<int>();
        var activeWorkers=0;var peakWorkers=0;
        var parallelBody=factory.Leaf("parallel-body",loopSignature,_=>[]);
        factory.Async("parallel-body",async (v,token)=>
        {
            var active=Interlocked.Increment(ref activeWorkers);
            int previous;do{previous=peakWorkers;}while(active>previous&&Interlocked.CompareExchange(ref peakWorkers,active,previous)!=previous);
            try{await Task.Delay((4-(int)v["index"])*30,token);parallelSeen.Add((int)v["index"]);return new Dictionary<string,object>{{"value",(int)v["item"]*2}};}
            finally{Interlocked.Decrement(ref activeWorkers);}
        });
        var isolatedBefore=factory.IsolatedCalls;
        var parallel=await Execute("parallelMap",loopSignature,new(){{"body",parallelBody}},new(){{"items",new[]{3,1,7,2}},{"maxConcurrency",3}});
        check(parallel.State=="completed"&&parallel.Outputs["value"].EnumerateArray().Select(v=>v.GetInt32()).SequenceEqual([6,2,14,4]),"ParallelMap keeps input order despite asynchronous completion");
        check(peakWorkers==3&&activeWorkers==0&&parallelSeen.Count==4,"ParallelMap respects concurrency and joins all workers");
        check(factory.IsolatedCalls-isolatedBefore==4,"ParallelMap requests a separate execution context for every body");
        var emptyParallel=await Execute("parallelMap",loopSignature,new(){{"body",parallelBody}},new(){{"items",Array.Empty<int>()},{"maxConcurrency",3}});
        check(emptyParallel.State=="completed"&&emptyParallel.Outputs["value"].GetArrayLength()==0&&factory.IsolatedCalls-isolatedBefore==4,"Empty ParallelMap creates no child execution");
        var parallelStarted=0;var parallelFinished=0;
        var allStarted=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var failingParallel=factory.Leaf("parallel-failure",loopSignature,_=>[]);
        factory.Async("parallel-failure",async(v,token)=>
        {
            if(Interlocked.Increment(ref parallelStarted)==3)allStarted.TrySetResult();
            try
            {
                await allStarted.Task.WaitAsync(token);
                if((int)v["index"]==1)throw new NodeFailureException("parallel_failure","Expected failure");
                await Task.Delay(30000,token);return new Dictionary<string,object>{{"value",0}};
            }
            finally{await Task.Delay(30);Interlocked.Increment(ref parallelFinished);}
        });
        var failedParallel=await Execute("parallelMap",loopSignature,new(){{"body",failingParallel}},new(){{"items",new[]{1,2,3,4,5}},{"maxConcurrency",3}});
        check(failedParallel.State=="failed"&&failedParallel.Error?.Code=="parallel_failure"&&failedParallel.Outputs.Count==0,"ParallelMap preserves first failure without partial outputs");
        check(parallelStarted==3&&parallelFinished==3&&failedParallel.Invocations.All(i=>i.State=="failed"),"ParallelMap cancels and cleans siblings without scheduling more work");
        var aggregateSignature=Signature([Param("item",Text),Param("index",Integer),Param("accumulator",Text)],[Param("accumulator",Text)]);
        var folding=factory.Leaf("folding",aggregateSignature,v=>new(){{"accumulator",(string)v["accumulator"]+((int)v["index"]==0?"":"|")+(string)v["item"]}});
        var aggregated=await Execute("aggregate",aggregateSignature,new(){{"body",folding}},new(){{"items",new[]{"A","B"}},{"seed",">"}});
        check(aggregated.State=="completed"&&aggregated.Outputs["result"].GetString()==">A|B","Aggregate passes its accumulator sequentially through the backend body");
        var emptyAggregate=await Execute("aggregate",aggregateSignature,new(){{"body",folding}},new(){{"items",Array.Empty<string>()},{"seed","empty"}});
        check(emptyAggregate.State=="completed"&&emptyAggregate.Outputs["result"].GetString()=="empty"&&emptyAggregate.Invocations.Length==1,"Empty Aggregate returns seed without invoking the body");
        var invalidAggregate=factory.Root("aggregate",aggregateSignature,new(){{"body",folding}},null).Nodes.Single(n=>n.Graph?.Operation=="aggregate");
        try{GraphControls.Definition(invalidAggregate with{Graph=invalidAggregate.Graph! with{Signature=aggregateSignature with{Outputs=[Param("accumulator",Integer)]}}});throw new Exception("Invalid accumulator accepted");}
        catch(ContractException){check(true,"Aggregate rejects mismatched accumulator types");}
        check(GraphControls.SlotForCall(invalidAggregate.Graph!,"body:0")=="body","Aggregate recognizes indexed body calls");
        try{GraphControls.SlotForCall(invalidAggregate.Graph!,"body:01");throw new Exception("Malformed key accepted");}
        catch(InvalidOperationException){check(true,"Aggregate rejects malformed iteration keys");}
        var mapped=await Execute("map",loopSignature,new(){{"body",mapping}},new(){{"items",new[]{3,1,7}}});
        check(mapped.State=="completed"&&mapped.Outputs["value"].EnumerateArray().Select(v=>v.GetInt32()).SequenceEqual([6,2,14])&&effects.SequenceEqual(["0","1","2"]),"Map invokes each element sequentially");
        check(mapped.Invocations.Length==4&&mapped.Invocations.Select(v=>v.ExecutionId).Distinct().Count()==4&&mapped.Invocations.Skip(1).All(v=>v.CallNodeId=="operation"),"Repeated calls have independent invocation IDs and owning node");
        var seenItems=new List<int>();
        var failingMap=factory.Leaf("failingMap",loopSignature,v=>
        {
            seenItems.Add((int)v["item"]);
            if((int)v["item"]==2)throw new InvalidOperationException("stop iteration");
            return new(){{"value",v["item"]}};
        });
        var stoppedMap=await Execute("map",loopSignature,new(){{"body",failingMap}},new(){{"items",new[]{1,2,3}}});
        check(stoppedMap.State=="failed"&&stoppedMap.Outputs.Count==0&&seenItems.SequenceEqual([1,2]),"Map stops at the failed element without publishing partial results");
        var empty=await Execute("map",loopSignature,new(){{"body",mapping}},new(){{"items",Array.Empty<int>()}});
        check(empty.State=="completed"&&empty.Outputs["value"].GetArrayLength()==0&&empty.Invocations.Length==1,"Empty map invokes no child");
        var filterSignature=loopSignature with{Outputs=[Param("value",Bool)]};
        var predicate=factory.Leaf("predicate",filterSignature,v=>new(){{"value",(int)v["item"]%2==0}});
        var filtered=await Execute("filter",filterSignature,new(){{"body",predicate}},new(){{"items",new[]{1,2,3,4}}});
        check(filtered.State=="completed"&&filtered.Outputs["value"].EnumerateArray().Select(v=>v.GetInt32()).SequenceEqual([2,4]),"Filter keeps matching items in order");
        var eachSignature=loopSignature with{Outputs=[]};effects.Clear();
        var each=factory.Leaf("each",eachSignature,v=>{effects.Add(v["item"].ToString()!);return [];});
        var iterated=await Execute("forEach",eachSignature,new(){{"body",each}},new(){{"items",new[]{8,9}}});
        check(iterated.State=="completed"&&effects.SequenceEqual(["8","9"]),"ForEach runs ordered side effects");
        var fail=factory.Leaf("fail",scalar,_=>throw new InvalidOperationException("expected failure"));
        var recoverSignature=GraphControls.SlotSignature(new("try",scalar),"catch");
        var recovery=factory.Leaf("recovery",recoverSignature,v=>{effects.Add("catch");if(!((string)v["error"]).Contains("expected failure"))throw new Exception("Missing error message");return new(){{"value",42}};});
        var finalSignature=GraphControls.SlotSignature(new("try",scalar),"finally");
        var final=factory.Leaf("final",finalSignature,_=>{effects.Add("finally");return [];});
        effects.Clear();
        var recovered=await Execute("try",scalar,new(){{"body",fail},{"catch",recovery},{"finally",final}},new(){{"in_x",5}});
        check(recovered.State=="completed"&&recovered.Outputs["out_value"].GetInt32()==42&&effects.SequenceEqual(["catch","finally"]),"Try catches child failure and runs Finally");
        check(recovered.Invocations.Count(v=>v.State=="failed")==1&&recovered.Events.Any(v=>v.Status=="error"),"Handled failure remains visible in invocation trace");
        effects.Clear();
        var success=await Execute("try",scalar,new(){{"body",yes},{"catch",recovery},{"finally",final}},new(){{"in_x",5}});
        check(success.State=="completed"&&effects.SequenceEqual(["yes","finally"]),"Successful Try skips Catch but runs Finally");
        var failCatch=factory.Leaf("failCatch",recoverSignature,_=>throw new InvalidOperationException("catch failed"));effects.Clear();
        var failure=await Execute("try",scalar,new(){{"body",fail},{"catch",failCatch},{"finally",final}},new(){{"in_x",5}});
        check(failure.State=="failed"&&failure.Outputs.Count==0&&effects.SequenceEqual(["finally"]),"Catch failure still runs Finally and publishes no outputs");
        var nativeType=new TypeRef("entity",Name:"test.Native@1");
        var nativeSignature=Signature([Param("item",nativeType),Param("index",Integer)],[Param("value",nativeType)]);
        var nativeNode=new FlowNode("native",GraphNodes.NodeType("native","map"),1,"server",[],Graph:new("map",nativeSignature));
        var nativeItem=new object();
        var nativeResult=await GraphControlRuntime.Execute(nativeNode,new Dictionary<string,object>{{"items",new[]{nativeItem}},{"body",new GraphReference("body",1)}},(_,_,_,values,_,_)=>Task.FromResult<IReadOnlyDictionary<string,object>>(new Dictionary<string,object>{{"value",values["item"]}}),CancellationToken.None);
        check(ReferenceEquals(((List<object>)nativeResult["value"])[0],nativeItem),"Native Map preserves object identity");
        try {GraphNodes.Definition(nativeNode with{Environment="browser"});throw new Exception("Native browser control accepted");}
        catch(ContractException){check(true,"Native graph arguments reject browser execution");}
        var entered=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var exited=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var slow=factory.Leaf("slow",scalar,_=>[]);
        factory.Async("slow",async (_,token)=>{entered.TrySetResult();try{await Task.Delay(30000,token);return new Dictionary<string,object>{{"value",1}};}finally{exited.TrySetResult();}});
        var cancelRoot=factory.Root("try",scalar,new(){{"body",slow},{"catch",recovery},{"finally",final}},null);
        effects.Clear();
        using(var runtime=new Orchestrator(TimeProvider.System,factory))
        {
            var run=runtime.Start(cancelRoot,null,"owner",new Dictionary<string,JsonElement>{{"in_x",JsonSerializer.SerializeToElement(5)}},new(1,cancelRoot.Id,[cancelRoot,slow,recovery,final]));
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            var cancelled=runtime.Cancel(run.ExecutionId,null,"owner");
            await exited.Task.WaitAsync(TimeSpan.FromSeconds(5));
            check(cancelled.State=="failed"&&cancelled.Invocations.All(i=>i.State=="failed")&&effects.Count==0,"Root cancellation stops Try body without running Catch or Finally");
        }

    }
    sealed class Factory:IFlowRuntimeFactory
    {
        public int IsolatedCalls;
        public FlowRuntimeContext CreateIsolatedExecutionForFlow(FlowDocument flow,FlowRuntimeContext parent){Interlocked.Increment(ref IsolatedCalls);return Create();}
        readonly Dictionary<string,RegisteredNode> definitions=new();
        string IO(TypeRef type,bool input)
        {
            var id="test."+(input?"input.":"output.")+GraphNodes.CodecIdentity(type);
            if(!definitions.ContainsKey(id))definitions[id]=new(new(id,1,input?new Dictionary<string,PortType>():new(){{"value",GraphNodeRuntime.Port(type)}},input?new(){{"value",GraphNodeRuntime.Port(type)}}:new Dictionary<string,PortType>(),Config:new(){{"name",new("string",JsonSerializer.SerializeToElement("value"))}},Control:input?null:new(true,false,false),FlowPort:input?"input":"output"),_=>throw new Exception("Runtime handles IO."));
            return id;
        }
        static Connection Control(string from,string to)=>new(new(from,"out"),new(to,"in"),Kind:"control");
        public FlowDocument Leaf(string id,FlowInterface signature,Func<IReadOnlyDictionary<string,object>,Dictionary<string,object>> action)
        {
            var work="test.work."+id;
            definitions[work]=new(new(work,1,signature.Inputs.ToDictionary(p=>p.Name,p=>GraphNodeRuntime.Port(p.Type)),signature.Outputs.ToDictionary(p=>p.Name,p=>GraphNodeRuntime.Port(p.Type)),Control:new(true,true,false)),v=>action(v));
            var nodes=new List<FlowNode>{new("start","test.start",1,"server",[]),new("work",work,1,"server",[])};
            var edges=new List<Connection>{Control("start","work")};
            foreach(var p in signature.Inputs){nodes.Add(new(p.NodeId,IO(p.Type,true),1,"server",new(){{"name",JsonSerializer.SerializeToElement(p.Name)}}));edges.Add(new(new(p.NodeId,"value"),new("work",p.Name)));}
            foreach(var p in signature.Outputs){var nodeId="output_"+p.NodeId;nodes.Add(new(nodeId,IO(p.Type,false),1,"server",new(){{"name",JsonSerializer.SerializeToElement(p.Name)}}));edges.Add(new(new("work",p.Name),new(nodeId,"value")));edges.Add(Control("work",nodeId));}
            return new(2,id,1,"backend",nodes.ToArray(),edges.ToArray(),Control:signature.Control);
        }
        public FlowDocument Root(string operation,FlowInterface signature,Dictionary<string,FlowDocument> slots,string[]? cases)
        {
            var binding=new GraphNodeBinding(operation,signature,Cases:cases);
            var op=new FlowNode("operation",GraphNodes.NodeType("operation",operation),1,"server",[],Graph:binding);
            var contract=GraphNodes.Definition(op);
            var nodes=new List<FlowNode>{new("start","test.start",1,"server",[]),op};
            var edges=new List<Connection>{Control("start","operation")};
            foreach(var (name,type) in contract.Inputs)
            {
                var id="source_"+name;
                if(type.Kind=="graph")nodes.Add(new(id,GraphNodes.NodeType(id,"reference"),1,"server",[],Graph:new("reference",type.Signature!,slots[name].Id)));
                else nodes.Add(new(id,IO(type,true),1,"server",new(){{"name",JsonSerializer.SerializeToElement(name)}}));
                edges.Add(new(new(id,type.Kind=="graph"?"graph":"value"),new(op.Id,name)));
            }
            foreach(var (name,type) in contract.Outputs)
            {
                var id="result_"+name;nodes.Add(new(id,IO(type,false),1,"server",new(){{"name",JsonSerializer.SerializeToElement(name)}}));edges.Add(new(new(op.Id,name),new(id,"value")));edges.Add(Control(op.Id,id));
            }
            return new(2,"root",1,"backend",nodes.ToArray(),edges.ToArray());
        }
        public FlowDocument WithUnusedInput(FlowDocument flow)=>flow with {Nodes=[..flow.Nodes,new("unused",IO(Integer,true),1,"server",new(){{"name",JsonSerializer.SerializeToElement("unused")}})]};
        public void Async(string id,Func<IReadOnlyDictionary<string,object>,CancellationToken,Task<IReadOnlyDictionary<string,object>>> action)
        {
            var key="test.work."+id;
            definitions[key]=definitions[key] with {ExecuteAsync=async (inputs,_,token)=>await action(inputs,token)};
        }
        public FlowRuntimeContext Create()
        {
            var nodes=new NodeRegistry();
            nodes.Register(new(new("test.start",1,new Dictionary<string,PortType>(),new Dictionary<string,PortType>(),Control:new(false,true,true)),_=>new Dictionary<string,object>()));
            foreach(var node in definitions.Values)nodes.Register(node);
            var codecs=new CodecRegistry(new(1,[]),"server");codecs.RegisterScalars();codecs.RegisterValues(nodes.Catalog);
            return new(nodes,codecs);
        }
    }
}
