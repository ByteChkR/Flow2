using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;
static class ListJoinCases
{
 public static async Task Run(Action<bool,string> check)
 {
  using var fixtures=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/list-join-cases.json")));
  foreach(var test in fixtures.RootElement.EnumerateArray())
  {
   var operation=test.GetProperty("operation").GetString()!;var nullable=new TypeRef("nullable",Inner:new("string"));
   var rightType=test.TryGetProperty("rightType",out var r)?r.Deserialize<TypeRef>(ContractSchemas.JsonOptions)!:nullable;
   var keyType=test.TryGetProperty("keyType",out var k)?k.Deserialize<TypeRef>(ContractSchemas.JsonOptions)!:nullable;
   var signature=new FlowInterface([new("leftItem","leftItem",nullable),new("rightItem","rightItem",rightType),new("index","index",new("scalar",Name:"core.Integer")),new("note","note",new("optional",Inner:new("string")))],[new("value","value",keyType)],new(false,false));
   var node=new FlowNode("join",GraphNodes.NodeType("join",operation),1,"server",[],Graph:new(operation,signature));
   var definition=GraphNodes.Definition(node);
   var left=(object[])FlowValues.Decode(definition.Inputs["left"],test.GetProperty("left"));var right=(object[])FlowValues.Decode(definition.Inputs["right"],test.GetProperty("right"));
   var leftKeys=(object[])FlowValues.Decode(new("array",Items:keyType),test.GetProperty("leftKeys"));var rightKeys=(object[])FlowValues.Decode(new("array",Items:keyType),test.GetProperty("rightKeys"));
   var inputs=new Dictionary<string,object>{{"left",left},{"right",right},{"leftKey",new GraphReference("left",1)},{"rightKey",new GraphReference("right",1)}};var seen=new List<string>();
   var actual=await GraphControlRuntime.Execute(node,inputs,(_,_,s,args,_,callKey)=>{
    var slot=GraphControls.SlotForCall(node.Graph!,callKey);var index=(int)args["index"];var isLeft=slot=="leftKey";
    check(ReferenceEquals(args["item"],(isLeft?left:right)[index])&&!args.ContainsKey("note"),"join selector gets original item and absent optional argument");
    check(GraphContracts.SameSignature(s,GraphControls.SlotSignature(node.Graph!,slot)),"join slot has exact signature");seen.Add(callKey);
    return Task.FromResult<IReadOnlyDictionary<string,object>>(new Dictionary<string,object>{{"value",(isLeft?leftKeys:rightKeys)[index]}});
   },CancellationToken.None);
   check(seen.SequenceEqual(right.Select((_,i)=>"rightKey:"+i).Concat(left.Select((_,i)=>"leftKey:"+i))),"join selects keys once in right-then-left order");
   check(TransportContracts.Equivalent(FlowValues.Encode(definition.Outputs["value"],actual["value"]),test.GetProperty("expected").GetProperty("value")),operation+" matches shared fixture");
   using var abort=new CancellationTokenSource();abort.Cancel();
   try{await GraphControlRuntime.Execute(node,inputs,(_,_,_,_,_,_)=>throw new Exception("must not invoke"),abort.Token);throw new Exception("Cancellation ignored");}catch(OperationCanceledException){check(true,"join cancellation before selection");}
   var one=new Dictionary<string,object>(inputs){["right"]=new object[]{"x"}};
   using var after=new CancellationTokenSource();
   try{await GraphControlRuntime.Execute(node,one,(_,_,_,_,_,_)=>{after.Cancel();return Task.FromResult<IReadOnlyDictionary<string,object>>(new Dictionary<string,object>());},after.Token);throw new Exception("Cancellation ignored");}catch(OperationCanceledException){check(true,"join cancellation after selection");}
   try{await GraphControlRuntime.Execute(node,one,(_,_,_,_,_,_)=>throw new InvalidOperationException("selector failed"),CancellationToken.None);throw new Exception("Failure ignored");}catch(InvalidOperationException ex)when(ex.Message=="selector failed"){check(true,"join failure propagates");}
  }
 }
}
