using System.Collections;
using System.Text.Json;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

/// <summary>Type-directed value equality. Entity identity is supplied by the execution host.</summary>
public static class ValueEquality
{
    public static bool Equal(TypeRef type,object? left,object? right,Func<string,object,object,bool>? entities=null)
    {
        if(!ValueEqualityContract.Supports(type))throw new InvalidOperationException($"Equality is not supported for {type.Kind}.");
        return Compare(type,left,right);
        bool Compare(TypeRef t,object? a,object? b)
        {
            if(t.Kind=="optional")return a is FlowAbsent||b is FlowAbsent?a is FlowAbsent&&b is FlowAbsent:Compare(t.Inner!,a,b);
            if(t.Kind=="nullable")return a is null||b is null?a is null&&b is null:Compare(t.Inner!,a,b);
            switch(t.Kind)
            {
                case "null":case "string":case "boolean":case "scalar":return Equals(a,b);
                case "number":return Convert.ToDouble(a,System.Globalization.CultureInfo.InvariantCulture)==Convert.ToDouble(b,System.Globalization.CultureInfo.InvariantCulture);
                case "dictionary":
                    var entries=((IEnumerable)b!).Cast<object>().ToDictionary(entry=>{FlowValues.TryField(entry,"key",out var key);return (string)key!;},entry=>{FlowValues.TryField(entry,"value",out var value);return value;},StringComparer.Ordinal);
                    var leftEntries=((IEnumerable)a!).Cast<object>().ToArray();
                    return leftEntries.Length==entries.Count&&leftEntries.All(entry=>{FlowValues.TryField(entry,"key",out var key);FlowValues.TryField(entry,"value",out var value);return entries.TryGetValue((string)key!,out var other)&&Compare(t.Items!,value,other);});
                case "array":
                    var x=((IEnumerable)a!).GetEnumerator();var y=((IEnumerable)b!).GetEnumerator();
                    try
                    {
                        while(x.MoveNext()){if(!y.MoveNext()||!Compare(t.Items!,x.Current,y.Current))return false;}
                        return !y.MoveNext();
                    }
                    finally{(x as IDisposable)?.Dispose();(y as IDisposable)?.Dispose();}
                case "object":
                    foreach(var (name,field) in t.Fields!)
                    {
                        var hasX=FlowValues.TryField(a!,name,out var av);var hasY=FlowValues.TryField(b!,name,out var bv);
                        if(hasX!=hasY||hasX&&!Compare(field,av,bv))return false;
                    }
                    return true;
                case "entityRef":
                    string Field(object value,string name)=>value is JsonElement json?json.GetProperty(name).GetString()!:
                        FlowValues.TryField(value,name,out var result)?(string)result!:throw new InvalidOperationException("Invalid entity reference.");
                    return Field(a!,"type")==Field(b!,"type")&&Field(a!,"id")==Field(b!,"id");
                case "entity":return (entities??throw new InvalidOperationException("Native entity equality requires a registered identity provider."))(t.Name!,a!,b!);
                default:throw new InvalidOperationException($"Equality is not supported for {t.Kind}.");
            }
        }
    }
}
