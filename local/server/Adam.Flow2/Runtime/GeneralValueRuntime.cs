using System.Collections;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;

public static class GeneralValueRuntime
{
    public static void Validate(ValueNodeBinding binding,TypeDocument types)
    {
        if(binding.Operation!="getProperty"||binding.Type.Kind!="entity")return;
        var fields=types.Types.FirstOrDefault(t=>t.Id==binding.Type.Name)?.Fields;
        if(fields is null||!fields.TryGetValue(binding.Member!,out var type)||!TransportContracts.Equivalent(type,binding.Result))
            throw new InvalidOperationException("GetProperty must match a registered entity field and its exact type.");
    }
    public static IReadOnlyDictionary<string,object> Execute(ValueNodeBinding b,IReadOnlyDictionary<string,object> inputs,Func<string,object,object,bool>? entityEquals=null,Func<string,object,uint>? entityHash=null)
    {
        Dictionary<string,object> Result(object? value)=>new(){{"value",value!}};
        if(b.Operation.StartsWith("dict",StringComparison.Ordinal))return DictionaryRuntime.Execute(b,inputs);
        switch(b.Operation)
        {
            case "jsonFrom":return Result(JsonValueNodes.Wrap(JsonValueNodes.FromValue(b.Type,inputs["value"])));
            case "jsonTo":return Result(JsonValueNodes.ToValue(b.Type,JsonValueNodes.Unwrap(inputs["value"])));
            case "ternary":
                return inputs.TryGetValue((bool)inputs["condition"]?"whenTrue":"whenFalse",out var selected)?Result(selected):new Dictionary<string,object>();
            case "input":case "output":throw new InvalidOperationException("Flow IO is handled by the execution context.");
            case "null":return Result(null);
            case "isNull":return Result(inputs["value"] is null);
            case "isMissing":return Result(!inputs.ContainsKey("value"));
            case "require":
                if(!inputs.TryGetValue("value",out var required)||required is null)throw new InvalidOperationException("Required value is missing or null.");
                return Result(required);
            case "hasField":return Result(b.Type.Fields!.ContainsKey((string)inputs["name"])&&FlowValues.TryField(inputs["value"],(string)inputs["name"],out _));
            case "removeField":
            {
                var value=new Dictionary<string,object>(StringComparer.Ordinal);
                foreach(var name in b.Type.Fields!.Keys)if(name!=b.Member&&FlowValues.TryField(inputs["value"],name,out var field))value[name]=field!;
                return new Dictionary<string,object>{{"value",value},{"removed",FlowValues.TryField(inputs["value"],b.Member!,out _)}};
            }
            case "merge":
            {
                var value=new Dictionary<string,object>(StringComparer.Ordinal);
                foreach(var (type,source) in new[]{(b.Type,inputs["left"]),(b.Result??b.Type,inputs["right"])})foreach(var name in type.Fields!.Keys)if(FlowValues.TryField(source,name,out var field))value[name]=field!;
                return Result(value);
            }
            case "getProperty":
                var owner=inputs["value"];object? property;
                if(b.Type.Kind=="entity")
                {
                    var member=owner.GetType().GetProperty(b.Member!);
                    if(member is null||member.GetIndexParameters().Length!=0||member.GetMethod?.IsPublic!=true)throw new InvalidOperationException("Registered entity property is not readable.");
                    property=member.GetValue(owner);
                }
                else if(!FlowValues.TryField(owner,b.Member!,out property))return new Dictionary<string,object>();
                return Result(property);
            case "record":case "withFields":
                var record=new Dictionary<string,object>(StringComparer.Ordinal);
                if(b.Operation=="withFields")foreach(var field in b.Type.Fields!.Keys)
                    if(FlowValues.TryField(inputs["value"],field,out var value))record[field]=value!;
                foreach(var field in b.Fields??b.Type.Fields!.Keys.ToArray())
                    if(inputs.TryGetValue("field_"+field,out var replacement))record[field]=replacement;
                    else record.Remove(field);
                return Result(record);
            case "tryGetItem":case "first":case "last":case "tryFirst":case "tryLast":case "single":case "trySingle":case "contains":case "indexOf":case "lastIndexOf":case "isEmpty":case "skip":case "take":case "slice":case "reverse":case "chunk":case "flatten":
                return ListSelectionRuntime.Execute(b,inputs,entityEquals);
            case "sort":case "distinct":case "union":case "intersect":case "except":case "zip":case "sum":case "average":case "min":case "max":
                return ListAdvancedRuntime.Execute(b,inputs,entityEquals,entityHash);
            case "removeItem":case "removeAll":
                var remaining=new List<object?>();var removedCount=0;
                foreach(var item in (IEnumerable)inputs["items"])
                {
                    if((b.Operation=="removeAll"||removedCount==0)&&ValueEquality.Equal(b.Type,item,inputs["item"],entityEquals))removedCount++;
                    else remaining.Add(item);
                }
                return new Dictionary<string,object>{{"value",remaining},{b.Operation=="removeItem"?"removed":"removedCount",b.Operation=="removeItem"?(object)(removedCount>0):removedCount}};
            case "addItem":case "addRange":case "insertItem":case "insertRange":case "setItem":case "removeAt":case "removeRange":case "clear":
                if(b.Operation=="clear")return Result(new List<object?>());
                var changed=((IEnumerable)inputs["items"]).Cast<object?>().ToList();
                var position=inputs.TryGetValue("index",out var indexValue)?(int)indexValue:0;
                if(b.Operation is "insertItem" or "insertRange" or "setItem" or "removeAt" or "removeRange")
                {
                    var endAllowed=b.Operation is "insertItem" or "insertRange" or "removeRange";
                    if(position<0||position>changed.Count||(!endAllowed&&position==changed.Count))throw new ArgumentOutOfRangeException("index","Input index: Index out of range.");
                }
                if(b.Operation.StartsWith("dict",StringComparison.Ordinal))return DictionaryRuntime.Execute(b,inputs);
        switch(b.Operation)
                {
                    case "addItem":changed.Add(inputs["item"]);break;
                    case "addRange":changed.AddRange(((IEnumerable)inputs["additionalItems"]).Cast<object?>());break;
                    case "insertItem":changed.Insert(position,inputs["item"]);break;
                    case "insertRange":changed.InsertRange(position,((IEnumerable)inputs["additionalItems"]).Cast<object?>());break;
                    case "setItem":changed[position]=inputs["item"];break;
                    case "removeAt":
                        var removed=changed[position];changed.RemoveAt(position);
                        return new Dictionary<string,object>{{"value",changed},{"removedItem",removed!}};
                    case "removeRange":
                        var length=(int)inputs["length"];
                        if(length<0||length>changed.Count-position)throw new ArgumentOutOfRangeException("length","Input length: Range must fit within the list and length must be non-negative.");
                        changed.RemoveRange(position,length);break;
                }
                return Result(changed);
            case "list":return Result(Enumerable.Range(0,b.Count!.Value).Select(i=>inputs["item_"+i]).ToList());
            case "count":return Result(((IEnumerable)inputs["items"]).Cast<object?>().Count());
            case "getItem":
                var index=(int)inputs["index"];if(index<0)throw new ArgumentOutOfRangeException("index");
                var items=((IEnumerable)inputs["items"]).Cast<object?>().ToList();
                if(index>=items.Count)throw new ArgumentOutOfRangeException("index");
                return Result(items[index]);
            default:throw new InvalidOperationException("Unknown value operation.");
        }
    }
}
