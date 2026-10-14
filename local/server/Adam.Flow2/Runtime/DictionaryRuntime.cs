using System.Collections;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class DictionaryRuntime
{
 public static IReadOnlyDictionary<string,object> Execute(ValueNodeBinding binding,IReadOnlyDictionary<string,object> inputs)
 {
  var source=(IEnumerable)inputs[binding.Operation=="dictCreate"?"entries":"dictionary"];
  var entries=new List<(string Key,object? Value)>();var keys=new HashSet<string>(StringComparer.Ordinal);
  foreach(var entry in source){FlowValues.TryField(entry!,"key",out var key);FlowValues.TryField(entry!,"value",out var value);if(!keys.Add((string)key!))throw new InvalidOperationException("Duplicate dictionary key: "+key);entries.Add(((string)key!,value));}
  var requested=inputs.TryGetValue("key",out var k)?(string)k:null;var index=entries.FindIndex(entry=>entry.Key==requested);var found=index!=-1;
  Dictionary<string,object> Result(object? value)=>new(){{"value",value!}};
  List<object> Materialize()=>entries.Select(entry=>(object)new Dictionary<string,object>{{"key",entry.Key},{"value",entry.Value!}}).ToList();
  switch(binding.Operation)
  {
   case "dictCreate":return Result(Materialize());
   case "dictGet":if(!found)throw new InvalidOperationException("Dictionary key not found: "+requested);return Result(entries[index].Value);
   case "dictTryGet":return found?new Dictionary<string,object>{{"found",true},{"value",entries[index].Value!}}:new Dictionary<string,object>{{"found",false}};
   case "dictContainsKey":return Result(found);
   case "dictKeys":return Result(entries.Select(entry=>entry.Key).ToList());
   case "dictValues":return Result(entries.Select(entry=>entry.Value).ToList());
   case "dictRemove":if(found)entries.RemoveAt(index);return new Dictionary<string,object>{{"value",Materialize()},{"removed",found}};
   case "dictSet":if(found)entries[index]=(requested!,inputs["item"]);else entries.Add((requested!,inputs["item"]));return Result(Materialize());
   default:throw new InvalidOperationException("Unknown dictionary operation.");
  }
 }
}
