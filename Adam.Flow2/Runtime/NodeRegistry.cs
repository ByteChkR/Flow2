using System.Text.Json;
using Flow.Contracts;

namespace Adam.Flow2.Runtime;

// The shared type describes the contract; CLR adapters stay server-local.
public sealed record PortType(string Id, Type ClrType, TypeRef ContractType)
{
    public void Validate(object value)
    {
        if (!ClrType.IsInstanceOfType(value))
            throw new InvalidOperationException($"Expected {Id}, received {value?.GetType().Name ?? "null"}.");
    }
}

public sealed record NodeDefinition(string Type, int Version,
    IReadOnlyDictionary<string, PortType> Inputs, IReadOnlyDictionary<string, PortType> Outputs,
    NodeMetadata? Metadata = null, Dictionary<string, ConfigField>? Config = null)
{
    public Flow.Contracts.NodeDefinition ToContract() => new(Type, Version, ["server"],
        Inputs.ToDictionary(p => p.Key, p => p.Value.ContractType), Outputs.ToDictionary(p => p.Key, p => p.Value.ContractType), Metadata, Config);
}

public sealed record RegisteredNode(NodeDefinition Definition,
    Func<IReadOnlyDictionary<string, object>, IReadOnlyDictionary<string, object>> Execute,
    Func<IReadOnlyDictionary<string, object>, IReadOnlyDictionary<string, JsonElement>, IReadOnlyDictionary<string, object>>? ExecuteConfigured = null);

public sealed class NodeRegistry
{
    private readonly Dictionary<(string Type, int Version, string Environment), RegisteredNode> nodes = new();
    private readonly TypeDocument types;
    private readonly TypeRegistry typeRegistry;

    public NodeRegistry(TypeDocument? types = null)
    {
        this.types = Clone(types ?? new(1, []));
        typeRegistry = new(this.types);
    }

    private static T Clone<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, ContractSchemas.JsonOptions), ContractSchemas.JsonOptions)!;
    public TypeDocument Types => Clone(types);
    public NodeCatalog Catalog => Clone(new NodeCatalog(1, nodes.Values.Select(n => n.Definition.ToContract()).ToArray()));

    public void Register(RegisteredNode node)
    {
        var metadata = node.Definition.ToContract();
        var errors = ContractSchemas.Validate("catalog", JsonSerializer.SerializeToElement(new NodeCatalog(1, [metadata]), ContractSchemas.JsonOptions)).ToList();
        if (errors.Count != 0) throw new ContractException(errors);
        errors.AddRange(NodeAuthoringContracts.Validate(metadata));
        foreach (var type in metadata.Inputs.Values.Concat(metadata.Outputs.Values)) errors.AddRange(typeRegistry.Check(type));
        if (errors.Count != 0) throw new ContractException(errors);
        var definition = node.Definition with
        {
            Metadata = metadata.Metadata is null ? null : Clone(metadata.Metadata),
            Config = metadata.Config is null ? null : Clone(metadata.Config),
            Inputs = node.Definition.Inputs.ToDictionary(p => p.Key, p => p.Value with { ContractType = Clone(p.Value.ContractType) }),
            Outputs = node.Definition.Outputs.ToDictionary(p => p.Key, p => p.Value with { ContractType = Clone(p.Value.ContractType) })
        };
        nodes.Add((definition.Type, definition.Version, "server"), node with { Definition = definition });
    }

    public RegisteredNode Resolve(string type, int version, string environment = "server") =>
        nodes.TryGetValue((type, version, environment), out var node)
            ? node : throw new InvalidOperationException($"Unknown node: {type}@{version} in {environment}.");

    public void ValidatePorts(IReadOnlyDictionary<string, PortType> ports, IReadOnlyDictionary<string, object> values)
    {
        if (values.Keys.Any(key => !ports.ContainsKey(key))) throw new InvalidOperationException("Node output ports do not match the catalog.");
        foreach (var (port, type) in ports)
        {
            if (values.TryGetValue(port, out var value)) Validate(type, value);
            else if (type.ContractType.Kind != "optional") throw new InvalidOperationException($"Missing required port {port}.");
        }
    }

    public bool IsAssignable(PortType source, PortType target) =>
        target.ClrType.IsAssignableFrom(source.ClrType) && typeRegistry.IsAssignable(source.ContractType, target.ContractType);

    public void Validate(PortType type, object value)
    {
        type.Validate(value);
        // Entities stay native: no serialization occurs between local entity nodes.
        if (!TransportContracts.IsTransportable(type.ContractType)) return;
        var json = JsonSerializer.SerializeToElement(value, ContractSchemas.JsonOptions);
        var errors = typeRegistry.ValidateValue(type.ContractType, json);
        if (errors.Count != 0) throw new ContractException(errors);
    }
}
