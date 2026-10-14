using System.Collections;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class ListSelectorRuntime
{
 public static async Task<IReadOnlyDictionary<string,object>> Execute(GraphNodeBinding binding,IReadOnlyDictionary<string,object> inputs,Func<object,int,Task<IReadOnlyDictionary<string,object>>> select,CancellationToken cancellation,Func<string,object,object,bool>? entities=null,Func<string,object,uint>? hashes=null)
 {
  var type=binding.Signature.Outputs[0].Type;var operation=binding.Operation;
  object? Field(object? value,string name)=>FlowValues.TryField(value!,name,out var field)?field:throw new InvalidOperationException("Missing key field: "+name);
  var directions=new List<(TypeRef Type,string? Field,bool Descending)>();
  if(type.Kind=="object"&&operation=="sortBy")
  {
   foreach(var key in (IEnumerable)inputs["orderBy"]){var field=(string)Field(key,"field")!;if(!type.Fields!.TryGetValue(field,out var fieldType))throw new InvalidOperationException("orderBy: Unknown key field "+field+".");directions.Add((fieldType,field,(bool)Field(key,"descending")!));}
   if(directions.Count==0||directions.Select(d=>d.Field).Distinct(StringComparer.Ordinal).Count()!=directions.Count)throw new InvalidOperationException("orderBy: Provide at least one distinct key field.");
  }
  else directions.Add((type,null,inputs.GetValueOrDefault("descending") is true));
  var rows=new List<(object Item,object? Key,int Index)>();var index=0;
  cancellation.ThrowIfCancellationRequested();
  foreach(var item in (IEnumerable)inputs["items"])
  {
   cancellation.ThrowIfCancellationRequested();var output=await select(item!,index);cancellation.ThrowIfCancellationRequested();
   if(!output.TryGetValue("value",out var key))throw new InvalidOperationException("Selector must return value.");
   rows.Add((item!,key,index));index=checked(index+1);
  }
  int Compare((object Item,object? Key,int Index) a,(object Item,object? Key,int Index) b)
  {
   foreach(var d in directions){var order=ValueOrder.Compare(d.Type,d.Field is null?a.Key:Field(a.Key,d.Field),d.Field is null?b.Key:Field(b.Key,d.Field));if(order!=0)return Math.Sign(order)*(d.Descending?-1:1);}
   return 0;
  }
  if(operation=="sortBy")return new Dictionary<string,object>{{"value",rows.OrderBy(row=>row,Comparer<(object Item,object? Key,int Index)>.Create((a,b)=>{var order=Compare(a,b);return order==0?a.Index.CompareTo(b.Index):order;})).Select(row=>row.Item).ToList()}};
  if(operation is "minBy" or "maxBy")
  {
   if(rows.Count==0)return new Dictionary<string,object>();var best=rows[0];
   foreach(var row in rows.Skip(1))if(Compare(row,best)*(operation=="minBy"?1:-1)<0)best=row;
   return new Dictionary<string,object>{{"value",best.Item}};
  }
  var lookup=new ValueIndex<List<object>>(type,entities,hashes);var groups=new List<object>();var distinct=new List<object>();
  foreach(var row in rows)
  {
   if(lookup.TryGet(row.Key,out var group)){if(operation=="groupBy")group.Add(row.Item);continue;}
   var items=new List<object>{row.Item};lookup.Add(row.Key,items);groups.Add(new Dictionary<string,object?>{{"key",row.Key},{"items",items}});distinct.Add(row.Item);
  }
  return new Dictionary<string,object>{{"value",operation=="groupBy"?groups:distinct}};
 }
}
