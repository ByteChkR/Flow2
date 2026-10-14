namespace Adam.Flow2.Contracts;

public static class ValueEqualityContract
{
    public static bool Supports(TypeRef type)=>type.Kind switch
    {
        "string" or "number" or "boolean" or "null" or "scalar" or "entity" or "entityRef"=>true,
        "nullable" or "optional"=>Supports(type.Inner!),
        "dictionary" or "array"=>Supports(type.Items!),
        "object"=>type.Fields!.Values.All(Supports),
        _=>false
    };
}
