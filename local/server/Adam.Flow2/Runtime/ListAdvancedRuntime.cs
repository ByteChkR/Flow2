using System.Collections;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class ListAdvancedRuntime
{
 public static IReadOnlyDictionary<string,object> Execute(ValueNodeBinding b,IReadOnlyDictionary<string,object> inputs,Func<string,object,object,bool>? entities=null,Func<string,object,uint>? hashes=null)
 {
  Dictionary<string,object> Result(object? value)=>new(){{"value",value!}};
  var items=((IEnumerable)inputs["items"]).Cast<object?>().ToArray();var op=b.Operation;
  if(op=="zip")return Result(items.Zip(((IEnumerable)inputs["other"]).Cast<object?>(),(left,right)=>new Dictionary<string,object?>{{"left",left},{"right",right}}).ToList());
  if(op=="sort")return Result(items.Select((value,index)=>(value,index)).OrderBy(x=>x,Comparer<(object? value,int index)>.Create((a,z)=>{
   var order=ValueOrder.Compare(b.Type,a.value,z.value);if(inputs.GetValueOrDefault("descending") is true)order=-Math.Sign(order);return order==0?a.index.CompareTo(z.index):order;
  })).Select(x=>x.value).ToList());
  if(op is "min" or "max"){
   if(items.Length==0)return new Dictionary<string,object>();var best=items[0];
   foreach(var value in items.Skip(1))if(Math.Sign(ValueOrder.Compare(b.Type,value,best))*(op=="min"?1:-1)<0)best=value;
   return Result(best);
  }
  if(op is "sum" or "average"){
   try
   {
    if(op=="sum"&&b.Type.Name=="core.Integer"){var sum=0;foreach(var item in items)sum=checked(sum+(int)item!);return Result(sum);}
    if(op=="average"&&items.Length==0)return new Dictionary<string,object>();
    var total=0m;foreach(var item in items)total=checked(total+(b.Type.Name=="core.Integer"?(int)item!:(decimal)item!));
    return Result(op=="sum"?total:total/items.Length);
   }
   catch(OverflowException error){throw new OverflowException("Numeric overflow in "+op+".",error);}
  }
  var seen=new ValueIndex<bool>(b.Type,entities,hashes);var membership=new ValueIndex<bool>(b.Type,entities,hashes);var result=new List<object?>();
  var other=inputs.TryGetValue("other",out var additional)?((IEnumerable)additional).Cast<object?>():[];
  if(op is "intersect" or "except")foreach(var item in other)if(!membership.TryGet(item,out _))membership.Add(item,true);
  foreach(var item in op=="union"?items.Concat(other):items){
   if(seen.TryGet(item,out _))continue;seen.Add(item,true);
   if(op=="intersect"&&!membership.TryGet(item,out _)||op=="except"&&membership.TryGet(item,out _))continue;
   result.Add(item);
  }
  return Result(result);
 }
}
