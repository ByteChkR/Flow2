using System.Collections;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class ListJoinRuntime
{
 public static async Task<IReadOnlyDictionary<string,object>> Execute(GraphNodeBinding binding,IReadOnlyDictionary<string,object> inputs,Func<string,object,int,Task<IReadOnlyDictionary<string,object>>> select,CancellationToken cancellation,Func<string,object,object,bool>? entities=null,Func<string,object,uint>? hashes=null)
 {
  var lookup=new ValueIndex<List<object>>(binding.Signature.Outputs[0].Type,entities,hashes);
  async Task<object> Key(string slot,object item,int index)
  {
   cancellation.ThrowIfCancellationRequested();var output=await select(slot,item,index);cancellation.ThrowIfCancellationRequested();
   return output.TryGetValue("value",out var key)?key:throw new InvalidOperationException("Join selector must return value.");
  }
  cancellation.ThrowIfCancellationRequested();var index=0;
  foreach(var item in (IEnumerable)inputs["right"])
  {
   var key=await Key("rightKey",item!,index);index=checked(index+1);
   if(lookup.TryGet(key,out var bucket))bucket.Add(item!);else lookup.Add(key,[item!]);
  }
  var values=new List<object>();index=0;
  foreach(var left in (IEnumerable)inputs["left"])
  {
   var key=await Key("leftKey",left!,index);index=checked(index+1);
   if(!lookup.TryGet(key,out var matches))matches=[];
   if(binding.Operation=="groupJoinByKey"){values.Add(new Dictionary<string,object>{{"left",left!},{"right",new List<object>(matches)}});continue;}
   if(matches.Count==0&&binding.Operation=="leftJoinByKey")values.Add(new Dictionary<string,object>{{"left",left!},{"found",false}});
   foreach(var right in matches){var pair=new Dictionary<string,object>{{"left",left!},{"right",right}};if(binding.Operation=="leftJoinByKey")pair["found"]=true;values.Add(pair);}
  }
  cancellation.ThrowIfCancellationRequested();return new Dictionary<string,object>{{"value",values}};
 }
}
