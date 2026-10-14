using System.Globalization;
using System.Text;
using System.Text.Json;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class TextNodes
{
 private static readonly Lazy<Dictionary<string,Dictionary<int,string>>> Casing=new(()=>{
  using var stream=typeof(TextNodes).Assembly.GetManifestResourceStream("Data.unicode-casing.json")!;
  using var json=JsonDocument.Parse(stream);
  return new[]{"lower","upper"}.ToDictionary(op=>op,op=>json.RootElement.GetProperty(op).EnumerateObject().ToDictionary(p=>int.Parse(p.Name,CultureInfo.InvariantCulture),p=>p.Value.GetString()!));
 });
 private const string Whitespace="\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
 public static string[] Characters(string value)
 {
  for(var i=0;i<value.Length;i++)if(char.IsSurrogate(value[i])){
   if(!char.IsHighSurrogate(value[i])||i+1>=value.Length||!char.IsLowSurrogate(value[i+1]))throw new FormatException("value: Invalid Unicode surrogate.");i++;
  }
  return value.EnumerateRunes().Select(r=>r.ToString()).ToArray();
 }
 public static string ChangeCase(string value,string operation)=>string.Concat(Characters(value).Select(c=>Casing.Value[operation].GetValueOrDefault(char.ConvertToUtf32(c,0),c)));
 public static void Register(NodeRegistry nodes)
 {
  var text=new TypeRef("string");var integer=new TypeRef("scalar",Name:"core.Integer");var boolean=new TypeRef("scalar",Name:"core.Bool");
  PortType Port(TypeRef t)=>new(t.Kind,typeof(object),t,Dynamic:true);
  void Add(string name,Dictionary<string,TypeRef> inputs,TypeRef output,Func<IReadOnlyDictionary<string,object>,object> execute)=>nodes.Register(new(new("Standard.Text."+name,1,inputs.ToDictionary(p=>p.Key,p=>Port(p.Value)),new Dictionary<string,PortType>{{"value",Port(output)}},new(Label:name,Category:"Text")),v=>new Dictionary<string,object>{{"value",execute(v)}}));
  Add("Length",new(){{"value",text}},integer,v=>Characters((string)v["value"]).Length);
  Add("Substring",new(){{"value",text},{"index",integer},{"length",integer}},text,v=>{
   var chars=Characters((string)v["value"]);var index=(int)v["index"];var length=(int)v["length"];
   if(index<0||length<0||index>chars.Length||length>chars.Length-index)throw new ArgumentOutOfRangeException("index/length","Text range out of bounds.");return string.Concat(chars.Skip(index).Take(length));
  });
  Add("IndexOf",new(){{"value",text},{"search",text},{"start",new("optional",Inner:integer)}},integer,v=>{
   var value=(string)v["value"];var chars=Characters(value);var search=(string)v["search"];Characters(search);var start=v.TryGetValue("start",out var offset)?(int)offset:0;
   if(start<0||start>chars.Length)throw new ArgumentOutOfRangeException("start","Text index out of bounds.");
   var found=value.IndexOf(search,string.Concat(chars.Take(start)).Length,StringComparison.Ordinal);return found<0?-1:Characters(value[..found]).Length;
  });
  Add("IsEmpty",new(){{"value",text}},boolean,v=>((string)v["value"]).Length==0);
  Add("IsNullOrWhiteSpace",new(){{"value",new("nullable",Inner:text)}},boolean,v=>v["value"] is null||((string)v["value"]).All(c=>Whitespace.Contains(c)));
  Add("Split",new(){{"value",text},{"separator",text},{"removeEmpty",new("optional",Inner:boolean)}},new("array",Items:text),v=>{
   var value=(string)v["value"];var separator=(string)v["separator"];Characters(value);Characters(separator);
   if(separator.Length==0)throw new ArgumentException("separator: Must not be empty.");return value.Split(separator,v.GetValueOrDefault("removeEmpty") is true?StringSplitOptions.RemoveEmptyEntries:StringSplitOptions.None);
  });
  Add("ToLower",new(){{"value",text}},text,v=>ChangeCase((string)v["value"],"lower"));
  Add("ToUpper",new(){{"value",text}},text,v=>ChangeCase((string)v["value"],"upper"));
  foreach(var name in new[]{"Bool","Integer","Decimal","Guid","TimeSpan","DateTimeOffset"})
  {
   nodes.Register(new(new("Standard.Convert."+name+".TryParse",1,new Dictionary<string,PortType>{{"value",Port(text)}},new Dictionary<string,PortType>{{"found",Port(boolean)},{"value",Port(new("optional",Inner:new("scalar",Name:"core."+name)))}},new(Label:"Try Parse ("+name+")",Category:"Convert")),values=>{
    try{var parsed=ScalarNodes.ParseText("core."+name,(string)values["value"]);return new Dictionary<string,object>{{"found",true},{"value",parsed}};}
    catch(Exception error)when(error is FormatException or OverflowException or ArgumentException or ContractException){return new Dictionary<string,object>{{"found",false}};}
   }));
  }
 }
}
