using System.Collections;
using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

/// <summary>Contract-directed conversion at wire boundaries; native edges keep their objects.</summary>
public static class FlowValues
{
    public static Type ClrType(TypeRef type)=>type.Kind switch
    {
        "scalar"=>type.Name switch
        {
            "core.Bool"=>typeof(bool),"core.Integer"=>typeof(int),"core.Decimal"=>typeof(decimal),
            "core.Guid"=>typeof(Guid),"core.DateTimeOffset"=>typeof(DateTimeOffset),"core.TimeSpan"=>typeof(TimeSpan),
            _=>throw new InvalidOperationException($"Unknown scalar {type.Name}.")
        },
        "pageConfig"=>typeof(JsonElement),"number"=>typeof(decimal),"string"=>typeof(string),"boolean"=>typeof(bool),"graph"=>typeof(GraphReference),
        "dictionary" or "array" or "object" or "nullable" or "optional" or "null" or "entity" or "entityRef" or "queryable" or "orderedQueryable" or "grouping" or "enumerable"=>typeof(object),
        _=>throw new InvalidOperationException($"Unsupported value type {type.Kind}.")
    };
    public static JsonElement Encode(TypeRef type,object? value)=>type.Kind=="optional"&&value is FlowAbsent?default:JsonSerializer.SerializeToElement(WireValue(type,value),ContractSchemas.JsonOptions);
    private static object? WireValue(TypeRef type,object? value)
    {
        if(type.Kind=="optional")return WireValue(type.Inner!,value);
        if(type.Kind=="nullable")return value is null?null:WireValue(type.Inner!,value);
        if(type.Kind is "entity" or "queryable" or "orderedQueryable" or "grouping" or "enumerable")throw new InvalidOperationException("Local entities require an explicit projection before transport.");
        if(type.Kind=="scalar")
        {
            if(value is null||!ClrType(type).IsInstanceOfType(value))throw new InvalidOperationException($"Expected native {type.Name}.");
            return type.Name switch
            {
                "core.Decimal"=>ScalarValues.Parse(type.Name,JsonSerializer.SerializeToElement(((decimal)value).ToString(CultureInfo.InvariantCulture))),
                "core.TimeSpan"=>((TimeSpan)value).Ticks.ToString(CultureInfo.InvariantCulture),
                "core.DateTimeOffset"=>((DateTimeOffset)value).ToString("yyyy-MM-dd'T'HH:mm:ss.fffffffzzz",CultureInfo.InvariantCulture),
                "core.Guid"=>((Guid)value).ToString("D"),
                _=>value
            };
        }
        if(type.Kind=="dictionary")return WireValue(DictionaryContract.Shape(type.Items!),value);
        if(type.Kind=="array")
        {
            if(value is not IEnumerable sequence||value is string||value is IDictionary)throw new InvalidOperationException("Expected a native list.");
            return sequence.Cast<object?>().Select(item=>WireValue(type.Items!,item)).ToArray();
        }
        if(type.Kind=="object")
        {
            if(value is null)throw new InvalidOperationException("Expected a native record.");
            var result=new Dictionary<string,object?>();
            foreach(var (name,field) in type.Fields!)
            {
                if(TryField(value,name,out var item))result.Add(name,WireValue(field,item));
                else if(field.Kind!="optional")throw new InvalidOperationException($"Missing record field {name}.");
            }
            return result;
        }
        return value;
    }
    public static bool TryField(object record,string name,out object? value)
    {
        if(record is IReadOnlyDictionary<string,object> readOnly)return readOnly.TryGetValue(name,out value);
        if(record is IDictionary dictionary){value=dictionary[name];return dictionary.Contains(name);}
        var property=record.GetType().GetProperties(BindingFlags.Instance|BindingFlags.Public).FirstOrDefault(property=>property.GetIndexParameters().Length==0&&property.CanRead&&
            (property.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name??JsonNamingPolicy.CamelCase.ConvertName(property.Name))==name);
        value=property?.GetValue(record);return property is not null;
    }
    public static object Decode(TypeRef type,JsonElement value,Type? nativeType=null)
    {
        if(type.Kind=="dictionary"){var errors=DictionaryContract.Keys(value);if(errors.Count>0)throw new ContractException(errors);return Decode(DictionaryContract.Shape(type.Items!),value,nativeType);}
        if(type.Kind=="scalar"&&!ScalarValues.IsValue(type.Name!,value))throw new FormatException($"Expected canonical {type.Name} value.");
        object? decoded=type.Kind switch
        {
            "nullable" when value.ValueKind==JsonValueKind.Null=>null,
            "nullable" or "optional"=>Decode(type.Inner!,value),
            "scalar"=>type.Name switch
            {
                "core.Bool"=>value.GetBoolean(),"core.Integer"=>value.GetInt32(),
                "core.Decimal"=>decimal.Parse(value.GetString()!,NumberStyles.AllowLeadingSign|NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture),
                "core.Guid"=>Guid.ParseExact(value.GetString()!,"D"),
                "core.TimeSpan"=>TimeSpan.FromTicks(long.Parse(value.GetString()!,CultureInfo.InvariantCulture)),
                "core.DateTimeOffset"=>DateTimeOffset.ParseExact(value.GetString()!,"yyyy-MM-dd'T'HH:mm:ss.fffffffzzz",CultureInfo.InvariantCulture),
                _=>throw new InvalidOperationException($"Unknown scalar {type.Name}.")
            },
            "number"=>value.GetDecimal(),"string"=>value.GetString(),"boolean"=>value.GetBoolean(),"null"=>null,
            "pageConfig"=>value.Clone(),
            "graph"=>value.Deserialize<GraphReference>(ContractSchemas.JsonOptions),
            "array"=>value.EnumerateArray().Select(item=>Decode(type.Items!,item)).ToArray(),
            "object"=>type.Fields!.Where(field=>value.TryGetProperty(field.Key,out _)).ToDictionary(field=>field.Key,field=>Decode(field.Value,value.GetProperty(field.Key))),
            "entityRef"=>value.Clone(),
            _=>throw new InvalidOperationException($"Cannot decode {type.Kind} from the wire.")
        };
        if(decoded is null||nativeType is null||nativeType.IsInstanceOfType(decoded))return decoded!;
        // Custom DTO/collection adapters receive native scalar values, not their wire strings.
        return JsonSerializer.SerializeToElement(decoded,ContractSchemas.JsonOptions).Deserialize(nativeType,ContractSchemas.JsonOptions)!;
    }
}
