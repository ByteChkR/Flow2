using System.Text.Json;
namespace Adam.Flow2.Contracts;

/// <summary>String keys use ordinal equality. Entry order is preserved across runtimes.</summary>
public static class DictionaryContract
{
    public static TypeRef Shape(TypeRef items)=>new("array",Items:new("object",Fields:new(){{"key",new("string")},{"value",items}}));
    public static IReadOnlyList<Diagnostic> Keys(JsonElement value,string path="")
    {
        IReadOnlyList<Diagnostic> Fail(string message,string? at=null)=>[new("value_type",at??path,message)];
        if(value.ValueKind!=JsonValueKind.Array)return Fail("Expected dictionary entries.");
        var keys=new HashSet<string>(StringComparer.Ordinal);var index=0;
        foreach(var entry in value.EnumerateArray())
        {
            var at=$"{path}/{index++}";
            if(entry.ValueKind!=JsonValueKind.Object||entry.EnumerateObject().Count()!=2||!entry.TryGetProperty("key",out var key)||key.ValueKind!=JsonValueKind.String||!entry.TryGetProperty("value",out _))return Fail("Expected dictionary entry { key, value }.",at);
            if(!keys.Add(key.GetString()!))return Fail("Duplicate dictionary key: "+key.GetString(),at+"/key");
        }
        return [];
    }
}
