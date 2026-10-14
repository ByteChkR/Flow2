using System.Text.Json;
using Adam.Flow2.Contracts;
using Jint;
namespace Adam.Flow2.Runtime;
public static class RegexNodes
{
 private static readonly Lazy<string> Program=new(()=>{
  using var stream=typeof(RegexNodes).Assembly.GetManifestResourceStream("Data.regex-program.json")!;using var json=JsonDocument.Parse(stream);
  return "var regexFold="+json.RootElement.GetProperty("fold").GetRawText()+";\n"+string.Join("\n",json.RootElement.GetProperty("lines").EnumerateArray().Select(line=>line.GetString()));
 });
 private static readonly Lazy<Action<Engine>> Initialize=new(()=>{var prepared=Engine.PrepareScript(Program.Value);return engine=>engine.Execute(prepared);});
 public static IReadOnlyDictionary<string,object> Execute(string operation,IReadOnlyDictionary<string,object> inputs,TypeRef output,CancellationToken cancellation=default)
 {
  var timeout=inputs.TryGetValue("timeoutMilliseconds",out var configured)?(int)configured:100;
  if(timeout<1||timeout>5000)throw new ArgumentOutOfRangeException("timeoutMilliseconds","Expected 1–5000.");
  cancellation.ThrowIfCancellationRequested();
  var initialize=Initialize.Value;
  var engine=new Engine(options=>{options.TimeoutInterval(TimeSpan.FromMilliseconds(timeout)).MaxStatements(2_000_000).LimitMemory(32_000_000).LimitRecursion(64).CancellationToken(cancellation);options.Constraints.RegexTimeout=TimeSpan.FromMilliseconds(timeout);});
  initialize(engine);
  var request=new Dictionary<string,object>(inputs){{"operation",operation}};
  string text;
  try{text=engine.Invoke("runRegex",JsonSerializer.Serialize(request)).AsString();}
  catch(Exception)when(cancellation.IsCancellationRequested){cancellation.ThrowIfCancellationRequested();throw;}
  using var result=JsonDocument.Parse(text);
  cancellation.ThrowIfCancellationRequested();
  return new Dictionary<string,object>{{"value",FlowValues.Decode(output,result.RootElement.GetProperty("value"))}};
 }
 public static void Register(NodeRegistry nodes)
 {
  var text=new TypeRef("string");var integer=new TypeRef("scalar",Name:"core.Integer");
  var match=new TypeRef("object",Fields:new(){{"value",text},{"index",integer},{"length",integer},{"groups",new("array",Items:new("nullable",Inner:text))}});
  PortType Port(TypeRef t)=>new(t.Kind,typeof(object),t,Dynamic:true);
  foreach(var operation in new[]{"test","replace","extract"})
  {
   var inputs=new Dictionary<string,TypeRef>{{"value",text},{"pattern",text},{"flags",new("optional",Inner:text)},{"timeoutMilliseconds",new("optional",Inner:integer)}};
   if(operation=="replace")inputs["replacement"]=text;
   var output=operation=="test"?new("scalar",Name:"core.Bool"):operation=="replace"?text:new TypeRef("array",Items:match);
   var definition=new NodeDefinition("Standard.Text.Regex."+char.ToUpperInvariant(operation[0])+operation[1..],1,inputs.ToDictionary(p=>p.Key,p=>Port(p.Value)),new Dictionary<string,PortType>{{"value",Port(output)}},new(Label:"Regex "+operation,Category:"Text/Regex"));
   nodes.Register(new(definition,inputs=>Execute(operation,inputs,output),ExecuteAsync:(inputs,_,cancellation)=>ValueTask.FromResult(Execute(operation,inputs,output,cancellation))));
  }
 }
}
