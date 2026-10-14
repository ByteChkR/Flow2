namespace Adam.Flow2.Contracts;
public static class ValueOrderContract
{
 public static bool Supports(TypeRef type)=>type.Kind=="nullable"?Supports(type.Inner!):type.Kind is "string" or "number" or "boolean" or "scalar" or "null";
}
