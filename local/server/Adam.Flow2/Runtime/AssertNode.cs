using System.Text.RegularExpressions;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class AssertNode
{
 public static void Register(NodeRegistry nodes)
 {
  var map=new NodeTypeMap();var optional=new PortType("optional<string>",typeof(string),new("optional",Inner:new("string")));
  nodes.Register(new(new("Standard.Flow.Assert",1,new Dictionary<string,PortType>{{"condition",map.Resolve(typeof(bool))},{"message",optional},{"code",optional}},new Dictionary<string,PortType>(),new(Label:"Assert",Category:"Control",Description:"Prüft eine Bedingung. Bei false schlägt die Node mit Meldung und Fehlercode fehl; bei true geht der Kontrollfluss weiter."),Control:new(true,true,false)),values=>{
   if((bool)values["condition"])return new Dictionary<string,object>();
   var code=values.TryGetValue("code",out var c)?(string)c:"assertion_failed";
   if(!Regex.IsMatch(code,@"\A[A-Za-z][A-Za-z0-9_.-]{0,127}\z",RegexOptions.CultureInvariant)||code is "cancelled" or "session_lost" or "timeout" or "limit")throw new ArgumentException("code: Expected a non-reserved error identifier (1–128 characters).");
   throw new NodeFailureException(code,values.TryGetValue("message",out var m)?(string)m:"Assertion failed.");
  }));
 }
}
