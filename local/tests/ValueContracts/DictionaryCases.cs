using System.Text.Json;
using System.Collections;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;
static class DictionaryCases
{
 public static void Run(Action<bool,string> check)
 {
  var text=new TypeRef("string");var dictionary=new TypeRef("dictionary",Items:text);var types=new TypeRegistry(new(1,[]));
  foreach(var source in new[]{"{}","null","[{\"key\":\"a\"}]","[{\"key\":3,\"value\":\"x\"}]","[{\"key\":\"a\",\"value\":\"x\"},{\"key\":\"a\",\"value\":\"y\"}]","[{\"key\":\"a\",\"value\":null}]","[{\"key\":\"a\",\"value\":\"x\",\"extra\":1}]"})
   check(types.ValidateValue(dictionary,JsonDocument.Parse(source).RootElement).Count>0,"invalid dictionary rejected");
  check(types.Check(new("dictionary",Items:new("optional",Inner:text))).Count>0,"dictionary values cannot be absent");
  check(!types.IsAssignable(dictionary,DictionaryContract.Shape(text)),"dictionary and list have distinct types");
  check(types.IsAssignable(dictionary,new("dictionary",Items:new("nullable",Inner:text))),"dictionary value widening");
  check(!types.IsAssignable(dictionary,new("dictionary",Items:new("scalar",Name:"core.Integer"))),"dictionary value types enforced");
  check(!TransportContracts.IsTransportable(new("dictionary",Items:new("entity",Name:"native"))),"native dictionary stays in backend");
  check(ValueCodecs.Definition(dictionary).TypeId!=ValueCodecs.Definition(DictionaryContract.Shape(text)).TypeId,"dictionary codec identity is distinct");
  var entity=new object();var native=new TypeRef("entity",Name:"test.Native@1");
  var entries=new[]{new Dictionary<string,object>{{"key","a"},{"value",entity}}};
  var registry=new NodeRegistry(new(1,[new("test.Native@1","entity",[])]));registry.RegisterEntity<object>("test.Native@1");
  registry.ValidateNative(new("dictionary",Items:native),entries);
  var result=DictionaryRuntime.Execute(new("dictCreate",native),new Dictionary<string,object>{{"entries",entries}});
  var created=((IEnumerable)result["value"]).Cast<object>().Single();FlowValues.TryField(created,"value",out var kept);
  check(ReferenceEquals(entity,kept)&&!ReferenceEquals(created,entries[0]),"dictionary copies entries and preserves native value identity");
  try{registry.ValidateNative(new("dictionary",Items:native),new[]{entries[0],entries[0]});throw new Exception("Duplicate accepted");}catch(InvalidOperationException){check(true,"native dictionary rejects duplicates");}
 }
}
