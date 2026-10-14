using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;
static class TextCases
{
 public static void Run(Action<bool,string> check,string fixture="text-cases.json")
 {
  var nodes=new NodeRegistry();ScalarNodes.Register(nodes);JsonValueNodes.Register(nodes);TemporalNodes.Register(nodes);
  using var cases=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/"+fixture)));
  foreach(var test in cases.RootElement.EnumerateArray())
  {
   var name=test.GetProperty("type").GetString()!;var node=nodes.Resolve(name,1);var definition=node.Definition;
   var inputs=test.GetProperty("inputs").EnumerateObject().ToDictionary(p=>p.Name,p=>FlowValues.Decode(definition.Inputs[p.Name].ContractType,p.Value));
   nodes.ValidatePorts(definition.Inputs,inputs);
   if(test.TryGetProperty("error",out var error))
   {
    Exception? caught=null;try{node.Execute(inputs);}catch(Exception ex){caught=ex;}
    check(caught is not null&&caught.Message.Contains(error.GetString()!,StringComparison.OrdinalIgnoreCase),name+" validates bounds");continue;
   }
   IReadOnlyDictionary<string,object> result;try{result=node.Execute(inputs);}catch(Exception failure){throw new Exception(name+" fixture "+test.GetProperty("inputs"),failure);}
   nodes.ValidatePorts(definition.Outputs,result);var expected=test.GetProperty("expected");
   check(result.Count==expected.EnumerateObject().Count(),name+" absent result");
   foreach(var output in expected.EnumerateObject())check(result.ContainsKey(output.Name)&&TransportContracts.Equivalent(FlowValues.Encode(definition.Outputs[output.Name].ContractType,result[output.Name]),output.Value),name+" shared fixture "+test.GetProperty("inputs"));
  }
  if(fixture=="temporal-cases.json")
  {
   var guids=Enumerable.Range(0,100).Select(_=>(Guid)nodes.Resolve("Standard.Values.NewGuid",1).Execute(new Dictionary<string,object>())["value"]).ToArray();
   check(guids.Distinct().Count()==100&&guids.All(value=>value!=Guid.Empty&&value.ToString("D")[14]=='4'),"NewGuid creates fresh version 4 values");
  }
  if(fixture=="json-cases.json")
  {
   var parser=nodes.Resolve("Standard.JSON.TryParse",1);
   foreach(var invalid in new[]{new string('[',65)+"0"+new string(']',65),new string(' ',4194305)})
   {
    var result=parser.Execute(new Dictionary<string,object>{{"text",invalid}});
    check(!(bool)result["found"]&&!result.ContainsKey("value"),"TryParse rejects depth and size limits without partial value");
   }
  }
  if(fixture=="regex-cases.json")
  {
   var output=new TypeRef("scalar",Name:"core.Bool");
   var normal=new Dictionary<string,object>{{"value","aaaa"},{"pattern","(?:a+)+$"}};
   check((bool)RegexNodes.Execute("test",normal,output)["value"],"default timeout executes valid regex");
   var slow=new Dictionary<string,object>(normal){["value"]=new string('a',100000)+"!",["timeoutMilliseconds"]=20};
   var clock=System.Diagnostics.Stopwatch.StartNew();Exception? error=null;
   try{RegexNodes.Execute("test",slow,output);}catch(Exception failure){error=failure;}
   check(error is not null&&clock.Elapsed<TimeSpan.FromSeconds(5),"regex catastrophic backtracking has bounded execution");
   using var abort=new CancellationTokenSource();abort.Cancel();
   try{RegexNodes.Execute("test",normal,output,abort.Token);throw new Exception("Cancellation ignored");}catch(OperationCanceledException){check(true,"regex cancellation before evaluation");}
   using var during=new CancellationTokenSource();during.CancelAfter(20);slow["timeoutMilliseconds"]=100;
   try{RegexNodes.Execute("test",slow,output,during.Token);throw new Exception("Cancellation ignored");}catch(OperationCanceledException){check(true,"regex cancellation during evaluation");}
   error=null;try{RegexNodes.Execute("test",new Dictionary<string,object>{{"value","x"},{"pattern","["}},output);}catch(Exception failure){error=failure;}
   check(error is not null,"invalid regex pattern fails");
  }
  foreach(var invalid in new[]{"\ud800","\udc00"}){try{TextNodes.Characters(invalid);throw new Exception("Invalid surrogate accepted");}catch(FormatException){check(true,"invalid surrogate rejected");}}
  using var table=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/unicode-casing.json")));
  foreach(var op in new[]{"lower","upper"})check(table.RootElement.GetProperty(op).EnumerateObject().All(p=>TextNodes.ChangeCase(char.ConvertFromUtf32(int.Parse(p.Name)),op)==p.Value.GetString()),"all Unicode casing mappings: "+op);
 }
}
