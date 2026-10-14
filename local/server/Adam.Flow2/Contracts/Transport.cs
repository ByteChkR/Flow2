using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;

namespace Adam.Flow2.Contracts;

public sealed record CodecReference(string TypeId, int Version);
public sealed record CodecDefinition(string TypeId, int Version, TypeRef ValueType, JsonElement WireSchema);
public sealed record CodecCatalog(int SchemaVersion, string Environment, CodecDefinition[] Codecs);
public sealed record WireEnvelope(int SchemaVersion, string TypeId, int CodecVersion, JsonElement Payload);

public static class TransportContracts
{
    public static bool Equivalent<T>(T left, T right) => JsonNode.DeepEquals(
        JsonSerializer.SerializeToNode(left, ContractSchemas.JsonOptions), JsonSerializer.SerializeToNode(right, ContractSchemas.JsonOptions));
    public static bool IsTransportable(TypeRef type) => type.Kind switch
    {
        "entity" or "queryable" or "orderedQueryable" or "grouping" or "enumerable" => false,
        "array" or "dictionary" => IsTransportable(type.Items!),
        "optional" or "nullable" => IsTransportable(type.Inner!),
        "object" => type.Fields!.Values.All(IsTransportable),
        _ => true
    };

    public static JsonSchema CompileWireSchema(JsonElement schema)
    {
        void Check(JsonElement value)
        {
            if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) Check(item);
            if (value.ValueKind != JsonValueKind.Object) return;
            foreach (var item in value.EnumerateObject())
            {
                if (item.Name is "$ref" or "$dynamicRef") throw new InvalidOperationException("Wire schema references are unsupported.");
                Check(item.Value);
            }
        }
        Check(schema);
        return JsonSchema.Build(schema.Clone(), new BuildOptions { Dialect = Dialect.Draft202012, SchemaRegistry = new() });
    }

    public static IReadOnlyList<Diagnostic> ValidateCatalog(CodecCatalog catalog, TypeRegistry registry)
    {
        var errors = ContractSchemas.Validate("codecs", JsonSerializer.SerializeToElement(catalog, ContractSchemas.JsonOptions)).ToList();
        if (errors.Count != 0) return errors;
        var seen = new HashSet<(string, int)>();
        foreach (var codec in catalog.Codecs)
        {
            var path = $"{codec.TypeId}/{codec.Version}";
            if (!seen.Add((codec.TypeId, codec.Version))) errors.Add(new("duplicate_codec", path, "Duplicate codec."));
            errors.AddRange(registry.Check(codec.ValueType, path));
            if (!IsTransportable(codec.ValueType)) errors.Add(new("not_transportable", path, "Codec cannot transport native entities or queries."));
            try { CompileWireSchema(codec.WireSchema); }
            catch (Exception error) when (error is not OutOfMemoryException) { errors.Add(new("wire_schema", path, "Invalid or unsupported wire schema.")); }
        }
        return errors;
    }

    public static IReadOnlyList<Diagnostic> ValidateBoundary(TypeRef source, TypeRef target, CodecReference? reference,
        CodecCatalog sourceCodecs, CodecCatalog targetCodecs, TypeRegistry registry)
    {
        var errors = ValidateCatalog(sourceCodecs, registry).Concat(ValidateCatalog(targetCodecs, registry)).ToArray();
        if (errors.Length != 0) return errors;
        IReadOnlyList<Diagnostic> Fail(string code, string message) => [new(code, "", message)];
        if (!registry.IsAssignable(source, target)) return Fail("type_mismatch", "Boundary port types are incompatible.");
        if (!IsTransportable(source)) return Fail("not_transportable", "Local entities require an explicit projection.");
        if (reference is null) return Fail("missing_codec", "Boundary requires an explicit codec.");
        var sender = sourceCodecs.Codecs.SingleOrDefault(c => c.TypeId == reference.TypeId && c.Version == reference.Version);
        var receiver = targetCodecs.Codecs.SingleOrDefault(c => c.TypeId == reference.TypeId && c.Version == reference.Version);
        if (sender is null || receiver is null) return Fail("missing_codec", "Codec must be registered at both endpoints.");
        if (!Equivalent(sender, receiver)) return Fail("codec_mismatch", "Endpoint codec definitions differ.");
        if (!Equivalent(source, sender.ValueType) || !registry.IsAssignable(receiver.ValueType, target)) return Fail("codec_type", "Codec does not represent this port type.");
        return [];
    }

    public static IReadOnlyList<Diagnostic> ValidateFlow(JsonElement flowValue, JsonElement catalogValue, JsonElement typesValue,
        CodecCatalog server, CodecCatalog browser)
    {
        var errors = FlowValidator.Validate(flowValue, catalogValue, typesValue).ToList();
        if (errors.Count != 0) return errors;
        if (server.Environment != "server" || browser.Environment != "browser") return [new("environment", "/codecs", "Codec capability environment mismatch.")];
        var flow = flowValue.Deserialize<FlowDocument>(ContractSchemas.JsonOptions)!;
        var catalog = catalogValue.Deserialize<NodeCatalog>(ContractSchemas.JsonOptions)!;
        var registry = new TypeRegistry(typesValue.Deserialize<TypeDocument>(ContractSchemas.JsonOptions)!);
        var active=ControlFlowRules.ActiveNodes(flow,catalog);
        for (var index = 0; index < flow.Connections.Length; index++)
        {
            var connection = flow.Connections[index];
            if(connection.Kind=="control"||!active.Contains(connection.Target.NodeId))continue;
            var source = flow.Nodes.Single(node => node.Id == connection.Source.NodeId);
            var target = flow.Nodes.Single(node => node.Id == connection.Target.NodeId);
            if (source.Environment == target.Environment) continue;
            var output = NodeResolution.Find(catalog,source)!.Outputs[connection.Source.Port];
            var input = NodeResolution.Find(catalog,target)!.Inputs[connection.Target.Port];
            errors.AddRange(ValidateBoundary(output, input, connection.Codec, source.Environment == "server" ? server : browser,
                target.Environment == "server" ? server : browser, registry).Select(error => error with { Path = $"/connections/{index}{error.Path}" }));
        }
        return errors;
    }
}
