using System.Collections;
using System.Runtime.ExceptionServices;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

public static class GraphControlRuntime
{
    public static async Task<IReadOnlyDictionary<string,object>> Execute(FlowNode node,IReadOnlyDictionary<string,object> inputs,GraphInvoker invoke,CancellationToken cancellation,Func<string,object,object,bool>? entities=null,Func<string,object,uint>? hashes=null)
    {
        if(node.Graph!.Operation=="parallelMap")return await ParallelMapRuntime.Execute(node,inputs,invoke,cancellation);
        var b=node.Graph!;
        var common=b.Signature.Inputs.Where(p=>inputs.ContainsKey(GraphNodes.InputPort(p))).ToDictionary(p=>p.Name,p=>inputs[GraphNodes.InputPort(p)]);
        async Task<IReadOnlyDictionary<string,object>> Call(string slot,string? key=null,Dictionary<string,object>? args=null)
        {
            cancellation.ThrowIfCancellationRequested();
            return await invoke(node.Id,(GraphReference)inputs[slot],GraphControls.SlotSignature(b,slot),args??common,cancellation,key??slot);
        }
        if(GraphControls.IsJoin(b.Operation))return await ListJoinRuntime.Execute(b,inputs,(slot,item,index)=>Call(slot,slot+":"+index,new(common){{"item",item},{"index",index}}),cancellation,entities,hashes);
        if(GraphControls.IsSelector(b.Operation))return await ListSelectorRuntime.Execute(b,inputs,(item,index)=>Call("body","body:"+index,new(common){{"item",item},{"index",index}}),cancellation,entities,hashes);
        IReadOnlyDictionary<string,object> result=new Dictionary<string,object>();
        switch(b.Operation)
        {
            case "timeout":
            {
                var milliseconds=(int)inputs["timeoutMilliseconds"];
                if(milliseconds<1||milliseconds>600000)throw new ArgumentOutOfRangeException("timeoutMilliseconds","timeoutMilliseconds: Expected 1–600000.");
                cancellation.ThrowIfCancellationRequested();using var deadline=CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                var started=System.Diagnostics.Stopwatch.StartNew();deadline.CancelAfter(milliseconds);
                try
                {
                    result=await invoke(node.Id,(GraphReference)inputs["body"],GraphControls.SlotSignature(b,"body"),common,deadline.Token,"body");
                    cancellation.ThrowIfCancellationRequested();
                    if(deadline.IsCancellationRequested||started.ElapsedMilliseconds>=milliseconds)throw new NodeFailureException("timeout",$"Subgraph exceeded {milliseconds} ms.");
                }
                catch(Exception) when(!cancellation.IsCancellationRequested&&(deadline.IsCancellationRequested||started.ElapsedMilliseconds>=milliseconds)){throw new NodeFailureException("timeout",$"Subgraph exceeded {milliseconds} ms.");}
                break;
            }
            case "retry":
            {
                var attempts=(int)inputs["maxAttempts"];var delay=inputs.TryGetValue("delayMilliseconds",out var delayValue)?(int)delayValue:0;
                var codes=((IEnumerable)inputs["retryCodes"]).Cast<string>().ToHashSet(StringComparer.Ordinal);
                if(attempts<1||attempts>10)throw new ArgumentOutOfRangeException("maxAttempts","maxAttempts: Retry requires 1–10 attempts.");
                if(delay<0||delay>60000)throw new ArgumentOutOfRangeException("delayMilliseconds","delayMilliseconds: Expected 0–60000.");
                for(var attempt=1;attempt<=attempts;attempt++)
                {
                    try{result=await Call("body","body:"+(attempt-1),new(common){{"attempt",attempt}});break;}
                    catch(Exception error) when(error is not OperationCanceledException)
                    {
                        cancellation.ThrowIfCancellationRequested();var code=NodeFailureException.FindCode(error)??"failed";
                        if(attempt==attempts||code is "cancelled" or "session_lost"||!codes.Contains(code))throw;
                        if(delay>0)await Task.Delay(delay,cancellation);
                    }
                }
                break;
            }
            case "repeat":
            {
                var count=(int)inputs["count"];
                if(count<0||count>1000)throw new ArgumentOutOfRangeException("count","count: Repeat requires 0–1000 iterations.");
                cancellation.ThrowIfCancellationRequested();
                for(var repeatIndex=0;repeatIndex<count;repeatIndex++){await Call("body","body:"+repeatIndex,new(common){{"index",repeatIndex}});cancellation.ThrowIfCancellationRequested();}
                return new Dictionary<string,object>();
            }
            case "while":
                result=common;
                var limit=GraphControls.WhileLimit(node);
                for(var turn=0;;turn++)
                {
                    var state=new Dictionary<string,object>(result);
                    var condition=await Call("condition","condition:"+turn,state);
                    if(!(bool)condition["value"])break;
                    if(turn>=limit)throw new InvalidOperationException($"While exceeded its limit of {limit} iterations.");
                    result=await Call("body","body:"+turn,state);
                }
                break;
            case "if":if((bool)inputs["condition"])result=await Call("then");break;
            case "ifElse":result=await Call((bool)inputs["condition"]?"then":"else");break;
            case "switch":var index=Array.IndexOf(b.Cases!,inputs["selector"]);result=await Call(index<0?"default":"case_"+index);break;
            case "aggregate":
                var accumulator=inputs["seed"];var aggregateIndex=0;
                cancellation.ThrowIfCancellationRequested();
                foreach(var item in (IEnumerable)inputs["items"])
                {
                    var args=new Dictionary<string,object>(common){{"item",item!},{"index",aggregateIndex},{"accumulator",accumulator}};
                    var output=await Call("body","body:"+aggregateIndex,args);
                    cancellation.ThrowIfCancellationRequested();accumulator=output["accumulator"];
                    aggregateIndex=checked(aggregateIndex+1);
                }
                return new Dictionary<string,object>{{"result",accumulator}};
            case "forEach":case "map":case "filter":case "flatMap":case "any":case "all":case "find":case "findIndex":case "takeWhile":case "skipWhile":case "partition":
                var values=new List<object>();var nonMatching=new List<object>();var iteration=0;var skipping=true;
                cancellation.ThrowIfCancellationRequested();
                foreach(var item in (IEnumerable)inputs["items"])
                {
                    if(b.Operation=="skipWhile"&&!skipping){values.Add(item!);continue;}
                    var args=new Dictionary<string,object>(common){{"item",item!},{"index",iteration}};
                    var output=await Call("body","body:"+iteration,args);
                    cancellation.ThrowIfCancellationRequested();
                    var currentIndex=iteration;iteration=checked(iteration+1);
                    if(b.Operation=="forEach")continue;
                    var value=output["value"];
                    if(b.Operation=="map"){values.Add(value);continue;}
                    if(b.Operation=="flatMap")
                    {
                        if(value is not IEnumerable list||value is string)throw new InvalidOperationException("FlatMap body must return a list.");
                        foreach(var element in list)values.Add(element!);
                        continue;
                    }
                    if(value is not bool matches)throw new InvalidOperationException("Predicate body must return Bool value.");
                    if(b.Operation=="any"&&matches)return new Dictionary<string,object>{{"value",true}};
                    if(b.Operation=="all"&&!matches)return new Dictionary<string,object>{{"value",false}};
                    if(b.Operation=="find"&&matches)return new Dictionary<string,object>{{"found",true},{"value",item!}};
                    if(b.Operation=="findIndex"&&matches)return new Dictionary<string,object>{{"value",currentIndex}};
                    if(b.Operation=="takeWhile"&&!matches)break;
                    if(b.Operation=="skipWhile"){skipping=matches;if(!skipping)values.Add(item!);}
                    if(b.Operation=="filter"&&matches||b.Operation=="takeWhile")values.Add(item!);
                    if(b.Operation=="partition")(matches?values:nonMatching).Add(item!);
                }
                cancellation.ThrowIfCancellationRequested();
                if(b.Operation is "any" or "all")return new Dictionary<string,object>{{"value",b.Operation=="all"}};
                if(b.Operation=="find")return new Dictionary<string,object>{{"found",false}};
                if(b.Operation=="findIndex")return new Dictionary<string,object>{{"value",-1}};
                if(b.Operation=="partition")return new Dictionary<string,object>{{"matching",values},{"nonMatching",nonMatching}};
                return b.Operation=="forEach"?new Dictionary<string,object>():new Dictionary<string,object>{{"value",values}};
            case "try":
                Exception? failure=null;
                try {result=await Call("body");}
                catch(Exception error) when(error is not OperationCanceledException&&!cancellation.IsCancellationRequested)
                {
                    try {result=await Call("catch",args:new(common){{"error",error.Message}});}
                    catch(Exception catchError) {failure=catchError;}
                }
                // Root cancellation aborts the whole tree; it is never converted to a caught success.
                cancellation.ThrowIfCancellationRequested();
                if(failure is OperationCanceledException)ExceptionDispatchInfo.Capture(failure).Throw();
                try {await Call("finally");}
                catch(Exception finalError) when(failure is not null&&finalError is not OperationCanceledException)
                {throw new AggregateException("Catch and Finally failed.",failure,finalError);}
                if(failure is not null)ExceptionDispatchInfo.Capture(failure).Throw();
                break;
            default:throw new InvalidOperationException("Unsupported graph control.");
        }
        return b.Signature.Outputs.Where(p=>result.ContainsKey(p.Name)).ToDictionary(GraphNodes.OutputPort,p=>result[p.Name]);
    }
}
