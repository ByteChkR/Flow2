using System.Text.Json;

namespace Adam.Flow2.Contracts;

public sealed class TypeRegistry
{
    private readonly HashSet<string> entities = new(StringComparer.Ordinal);
    public TypeRegistry(TypeDocument document)
    {
        var errors = ContractSchemas.Validate("types", JsonSerializer.SerializeToElement(document, ContractSchemas.JsonOptions)).ToList();
        if (errors.Count != 0) throw new ContractException(errors);
        foreach (var entity in document.Types)
            if (!entities.Add(entity.Id)) throw new ContractException([new("duplicate_type", entity.Id, "Duplicate type ID.")]);
        foreach (var entity in document.Types)
            foreach (var type in entity.Fields.Values) errors.AddRange(Check(type));
        if (errors.Count != 0) throw new ContractException(errors);
    }

    public IReadOnlyList<Diagnostic> Check(TypeRef type, string path = "") => type.Kind switch
    {
        "grouping" when type.Key!.Kind=="optional" || type.Items!.Kind=="optional" => [new("optional_position",path,"Group keys and elements cannot be absent; use nullable instead.")],
        "grouping" => Check(type.Key!, $"{path}/key").Concat(Check(type.Items!, $"{path}/items")).ToArray(),
        "scalar" => ScalarValues.Names.Contains(type.Name!)?[]:[new("unknown_scalar",path,$"Unknown scalar {type.Name}.")],
        "graph" => GraphContracts.SignatureDiagnostics(type.Signature!,path).Concat(type.Signature!.Inputs.Concat(type.Signature.Outputs).SelectMany(port=>Check(port.Type,$"{path}/{port.NodeId}"))).ToArray(),
        "entity" or "entityRef" => entities.Contains(type.Name!) ? [] : [new("unknown_type", path, $"Unknown type {type.Name}.")],
        "dictionary" or "array" or "queryable" or "orderedQueryable" or "enumerable" when type.Items!.Kind=="optional" => [new("optional_position",path,"List elements cannot be absent; use nullable elements instead.")],
        "dictionary" or "array" or "queryable" or "orderedQueryable" or "enumerable" => Check(type.Items!, $"{path}/items"),
        "nullable" when type.Inner!.Kind=="optional" => [new("optional_position",path,"Absence must wrap the nullable value, not occur inside it.")],
        "optional" or "nullable" => Check(type.Inner!, $"{path}/inner"),
        "object" => type.Fields!.SelectMany(field => Check(field.Value, $"{path}/fields/{field.Key}")).ToArray(),
        _ => []
    };

    public bool IsAssignable(TypeRef source, TypeRef target)
    {
        if (Check(source).Count != 0 || Check(target).Count != 0) return false;
        if (target.Kind == "optional") return IsAssignable(source.Kind == "optional" ? source.Inner! : source, target.Inner!);
        if(source.Kind=="optional")return false;
        if(target.Kind=="nullable")return source.Kind=="null"||IsAssignable(source.Kind=="nullable"?source.Inner!:source,target.Inner!);
        if(source.Kind=="orderedQueryable"&&target.Kind=="queryable")return IsAssignable(source.Items!,target.Items!);
        if(source.Kind=="nullable"||source.Kind!=target.Kind)return false;
        return source.Kind switch
        {
            "grouping" => IsAssignable(source.Key!,target.Key!) && IsAssignable(source.Items!,target.Items!),
            "graph" => GraphContracts.SameSignature(source.Signature!,target.Signature!),
            "scalar" or "entity" or "entityRef" => source.Name == target.Name,
            "dictionary" or "array" or "queryable" or "orderedQueryable" or "enumerable" => IsAssignable(source.Items!, target.Items!),
            "object" => target.Fields!.All(field => source.Fields!.TryGetValue(field.Key, out var type)
                ? IsAssignable(type, field.Value) : field.Value.Kind == "optional"),
            _ => true
        };
    }

    // default(JsonElement) represents an absent value, distinct from JSON null.
    public IReadOnlyList<Diagnostic> ValidateValue(TypeRef type, JsonElement value, string path = "")
    {
        var unknown = Check(type, path);
        if (unknown.Count != 0) return unknown;
        if (type.Kind == "optional") return value.ValueKind == JsonValueKind.Undefined ? [] : ValidateValue(type.Inner!, value, path);
        IReadOnlyList<Diagnostic> Fail(string message) => [new("value_type", path, message)];
        switch (type.Kind)
        {
            case "scalar": return ScalarValues.IsValue(type.Name!,value)?[]:Fail($"Expected canonical {type.Name} value.");
            case "nullable": return value.ValueKind==JsonValueKind.Null?[]:ValidateValue(type.Inner!,value,path);
            case "graph": return GraphContracts.IsReference(value)?[]:Fail("Expected graph reference { graphId, revision }.");
            case "grouping": case "enumerable": case "orderedQueryable": case "queryable": return Fail("Queryable values stay in the backend and cannot be supplied as JSON.");
            case "entity": return Fail("Runtime entities are not JSON values. Use an explicit projection.");
            case "entityRef":
                return value.ValueKind == JsonValueKind.Object && value.EnumerateObject().Count() == 2 &&
                    value.TryGetProperty("type", out var entityType) && entityType.ValueKind == JsonValueKind.String && entityType.GetString() == type.Name &&
                    value.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && id.GetString()!.Length != 0
                    ? [] : Fail("Expected entity reference { type, id }.");
            case "pageConfig": return ContractSchemas.Validate("page-config",value);
            case "null": return value.ValueKind == JsonValueKind.Null ? [] : Fail("Expected null.");
            case "string": return value.ValueKind == JsonValueKind.String ? [] : Fail("Expected string.");
            case "boolean": return value.ValueKind is JsonValueKind.True or JsonValueKind.False ? [] : Fail("Expected boolean.");
            case "number": return value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number) ? [] : Fail("Expected finite number.");
            case "dictionary":
                var keyErrors=DictionaryContract.Keys(value,path);return keyErrors.Count>0?keyErrors:ValidateValue(DictionaryContract.Shape(type.Items!),value,path);
            case "array": return value.ValueKind == JsonValueKind.Array
                ? value.EnumerateArray().SelectMany((item, index) => ValidateValue(type.Items!, item, $"{path}/{index}")).ToArray() : Fail("Expected array.");
            case "object": return value.ValueKind == JsonValueKind.Object
                ? type.Fields!.SelectMany(field => ValidateValue(field.Value, value.TryGetProperty(field.Key, out var item) ? item : default, $"{path}/{field.Key}")).ToArray() : Fail("Expected object.");
            default: return Fail("Unsupported value.");
        }
    }
}
