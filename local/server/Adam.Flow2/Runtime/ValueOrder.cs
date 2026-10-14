using System.Collections;
using System.Globalization;
using System.Text.Json;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class ValueOrder
{
 public static int Compare(TypeRef t,object? a,object? b)
 {
  if(!ValueOrderContract.Supports(t))throw new InvalidOperationException("Type does not support ordering.");
  if(t.Kind=="nullable")return a is null||b is null?a is null&&b is null?0:a is null?-1:1:Compare(t.Inner!,a,b);
  if(t.Kind=="null")return 0;
  if(t.Kind=="string")return StringComparer.Ordinal.Compare((string)a!,(string)b!);
  if(t.Kind=="number")return Convert.ToDouble(a,CultureInfo.InvariantCulture).CompareTo(Convert.ToDouble(b,CultureInfo.InvariantCulture));
  if(t.Kind=="scalar"&&t.Name=="core.Guid")return StringComparer.Ordinal.Compare(((Guid)a!).ToString("D"),((Guid)b!).ToString("D"));
  return ((IComparable)a!).CompareTo(b);
 }
}
public static class ValueHash
{
 public static uint Hash(TypeRef type,object? value,Func<string,object,uint>? entities=null)
 {
  if(!ValueEqualityContract.Supports(type))throw new InvalidOperationException("Type does not support hashing.");
  string Text(string s)=>s.Length.ToString(CultureInfo.InvariantCulture)+":"+s;
  string Key(TypeRef t,object? v)
  {
   if(t.Kind=="optional")return v is FlowAbsent?"missing":"present"+Key(t.Inner!,v);
   if(t.Kind=="nullable")return v is null?"null":"nonnull"+Key(t.Inner!,v);
   if(t.Kind=="dictionary")return "dictionary"+string.Concat(((IEnumerable)v!).Cast<object>().Select(entry=>{FlowValues.TryField(entry,"key",out var k);FlowValues.TryField(entry,"value",out var val);return (Name:(string)k!,Value:val);}).OrderBy(e=>e.Name,StringComparer.Ordinal).Select(e=>Text(e.Name)+Text(Key(t.Items!,e.Value))));
   if(t.Kind=="array")return "array"+Text(string.Concat(((IEnumerable)v!).Cast<object?>().Select(x=>Text(Key(t.Items!,x)))));
   if(t.Kind=="object")return "record"+string.Concat(t.Fields!.OrderBy(p=>p.Key,StringComparer.Ordinal).Select(p=>Text(p.Key)+(FlowValues.TryField(v!,p.Key,out var field)?"present"+Text(Key(p.Value,field)):"missing")));
   if(t.Kind=="entityRef"){
    string Field(string name)=>v is JsonElement json?json.GetProperty(name).GetString()!:(FlowValues.TryField(v!,name,out var x)?(string)x!:throw new InvalidOperationException("Invalid entity reference."));
    return "entityRef"+Text(Field("type"))+Text(Field("id"));
   }
   // Entity hash providers are runtime-local; a constant bucket is safe for custom
   // hosts that supply equality but no hashing (collisions still use equality).
   if(t.Kind=="entity")return "entity"+Text(t.Name!)+Text((entities?.Invoke(t.Name!,v!)??0).ToString(CultureInfo.InvariantCulture));
   if(t.Kind=="null")return "null";
   if(t.Kind=="number"){var n=Convert.ToDouble(v,CultureInfo.InvariantCulture);return "number"+BitConverter.DoubleToUInt64Bits(n==0?0:n).ToString("x16",CultureInfo.InvariantCulture);}
   if(t.Kind=="scalar"){
    if(t.Name=="core.DateTimeOffset")return t.Name+Text(((DateTimeOffset)v!).UtcTicks.ToString(CultureInfo.InvariantCulture));
    var wire=FlowValues.Encode(t,v);return t.Name+Text(wire.ValueKind==JsonValueKind.String?wire.GetString()!:wire.GetRawText());
   }
   return t.Kind+Text(v is bool boolean?boolean?"true":"false":(string)v!);
  }
  var hash=2166136261u;foreach(var unit in Key(type,value))hash=unchecked((hash^unit)*16777619u);return hash;
 }
}
public sealed class ValueIndex<T>(TypeRef type,Func<string,object,object,bool>? entities=null,Func<string,object,uint>? hashes=null)
{
 private readonly Dictionary<uint,List<(object? Key,T Value)>> buckets=[];
 public bool TryGet(object? key,out T value)
 {
  if(buckets.TryGetValue(ValueHash.Hash(type,key,hashes),out var bucket))foreach(var entry in bucket)if(ValueEquality.Equal(type,entry.Key,key,entities)){value=entry.Value;return true;}
  value=default!;return false;
 }
 public void Add(object? key,T value){var hash=ValueHash.Hash(type,key,hashes);if(!buckets.TryGetValue(hash,out var bucket))buckets[hash]=bucket=[];bucket.Add((key,value));}
}
