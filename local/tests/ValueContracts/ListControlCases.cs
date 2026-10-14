using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;

static class ListControlCases
{
    public static async Task Run(Action<bool,string> check)
    {
        using var fixtures=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/list-control-cases.json")));
        foreach(var test in fixtures.RootElement.EnumerateArray())
        {
            var operation=test.GetProperty("operation").GetString()!;
            var itemType=new TypeRef("nullable",Inner:new("string"));
            var outputType=test.TryGetProperty("keyType",out var keyType)?keyType.Deserialize<TypeRef>(ContractSchemas.JsonOptions)!:GraphControls.IsPredicate(operation)?new TypeRef("scalar",Name:"core.Bool"):operation=="flatMap"?new("array",Items:itemType):itemType;
            var signature=new FlowInterface([new("item","item",itemType),new("index","index",new("scalar",Name:"core.Integer")),new("results","results",new("array",Items:outputType)),new("note","note",new("optional",Inner:new("string")))],operation=="forEach"?[]:[new("value","value",outputType)],new(false,false));
            var node=new FlowNode("operation",GraphNodes.NodeType("operation",operation),1,"server",[],Graph:new(operation,signature));
            var definition=GraphNodes.Definition(node);
            var items=FlowValues.Decode(new("array",Items:itemType),test.GetProperty("items"));
            var results=FlowValues.Decode(new("array",Items:outputType),test.GetProperty("results"));
            var inputs=new Dictionary<string,object>{{"items",items},{"in_results",results},{"body",new GraphReference("body",1)}};
            if(test.TryGetProperty("inputs",out var extraInputs))foreach(var input in extraInputs.EnumerateObject())inputs[input.Name]=FlowValues.Decode(definition.Inputs[input.Name],input.Value);
            var calls=0;
            var actual=await GraphControlRuntime.Execute(node,inputs,(_,_,_,args,_,key)=>{
                var index=(int)args["index"];
                check(index==calls&&key=="body:"+index,"sequential body key");
                check(ReferenceEquals(args["results"],results)&&!args.ContainsKey("note"),"extra arguments preserve values and absence");
                calls++;
                return Task.FromResult<IReadOnlyDictionary<string,object>>(operation=="forEach"?new Dictionary<string,object>():new Dictionary<string,object>{{"value",((object[])results)[index]}});
            },CancellationToken.None);
            check(calls==test.GetProperty("calls").GetInt32(),operation+" exact body call count");
            var expected=test.GetProperty("expected");check(actual.Count==expected.EnumerateObject().Count(),operation+" absent outputs");
            foreach(var field in expected.EnumerateObject())check(TransportContracts.Equivalent(FlowValues.Encode(definition.Outputs[field.Name],actual[field.Name]),field.Value),operation+" shared result");
            check(GraphControls.SlotForCall(node.Graph!,"body:0")=="body","new loop accepts indexed call key");
            using var before=new CancellationTokenSource();before.Cancel();
            try{await GraphControlRuntime.Execute(node,new Dictionary<string,object>(inputs){["items"]=Array.Empty<object>()},(_,_,_,_,_,_)=>throw new Exception("must not invoke"),before.Token);throw new Exception("Cancellation ignored");}catch(OperationCanceledException){check(true,"empty loop honours cancellation");}
            var one=new Dictionary<string,object>(inputs);one["items"]=new[]{"x"};
            using var after=new CancellationTokenSource();
            try{await GraphControlRuntime.Execute(node,one,(_,_,_,_,_,_)=>{after.Cancel();return Task.FromResult<IReadOnlyDictionary<string,object>>(new Dictionary<string,object>());},after.Token);throw new Exception("Cancellation ignored");}catch(OperationCanceledException){check(true,"final body cancellation is not a success");}
            try{await GraphControlRuntime.Execute(node,one,(_,_,_,_,_,_)=>throw new InvalidOperationException("body failed"),CancellationToken.None);throw new Exception("Failure ignored");}catch(InvalidOperationException ex)when(ex.Message=="body failed"){check(true,"body error propagates without partial results");}
            var lateInputs=new Dictionary<string,object>(inputs){["items"]=new[]{"a","b"}};var lateCalls=0;
            try
            {
                await GraphControlRuntime.Execute(node,lateInputs,(_,_,_,_,_,_)=>{
                    if(lateCalls++==1)throw new InvalidOperationException("late body failure");
                    object value=operation=="flatMap"?new[]{"partial"}:operation=="map"?"partial":operation is not ("any" or "find" or "findIndex");
                    return Task.FromResult<IReadOnlyDictionary<string,object>>(operation=="forEach"?new Dictionary<string,object>():new Dictionary<string,object>{{"value",value}});
                },CancellationToken.None);
                throw new Exception("Late failure ignored");
            }
            catch(InvalidOperationException ex)when(ex.Message=="late body failure"){check(lateCalls==2,"failure after partial work propagates");}
            if(GraphControls.IsPredicate(operation)||operation=="flatMap")
            {
                try{GraphNodes.Definition(node with{Graph=node.Graph! with{Signature=signature with{Outputs=[new("value","value",new("string"))]}}});throw new Exception("Invalid selector accepted");}catch(ContractException){check(true,"invalid body result rejected");}
            }
        }
    }
}
