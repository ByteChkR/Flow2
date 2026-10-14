namespace Adam.Flow2.Contracts;

/// <summary>Opaque, transportable JSON document. Keeping the text preserves decimal precision and unknown fields.</summary>
public static class JsonValueContract
{
    public static TypeRef Type => new("object",Fields:new() { ["json"]=new("string") });
    public static bool Supports(TypeRef type) => type.Kind switch {
        "string" or "null" or "scalar"=>true,
        "nullable" or "optional"=>Supports(type.Inner!),
        "dictionary" or "array"=>Supports(type.Items!),
        "object"=>type.Fields!.Values.All(Supports),
        _=>false
    };
}
