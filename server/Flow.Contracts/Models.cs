using System.Text.Json;
using System.Text.Json.Serialization;

namespace Flow.Contracts;

// JSON Schemas enforce the discriminated shapes before these records are deserialized.
public sealed record TypeRef(
    string Kind,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Name = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] TypeRef? Items = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] TypeRef? Inner = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, TypeRef>? Fields = null);
public sealed record EntityDefinition(string Id, string Kind, Dictionary<string, TypeRef> Fields);
public sealed record TypeDocument(int SchemaVersion, EntityDefinition[] Types);
public sealed record NodeDefinition(string Type, int Version, string[] Environments,
    Dictionary<string, TypeRef> Inputs, Dictionary<string, TypeRef> Outputs,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] NodeMetadata? Metadata = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, ConfigField>? Config = null);
public sealed record PortMetadata(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Label = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Description = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Order = null);
public sealed record NodeMetadata(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Label = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Description = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Category = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, PortMetadata>? Inputs = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, PortMetadata>? Outputs = null);
public sealed record ConfigField(string Type, JsonElement Default,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Label = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Description = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Order = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string[]? Options = null);
public sealed record NodeCatalog(int SchemaVersion, NodeDefinition[] Nodes);
public sealed record FlowNode(string Id, string Type, int TypeVersion, string Environment, Dictionary<string, JsonElement> Config);
public sealed record PortAddress(string NodeId, string Port);
public sealed record Connection(PortAddress Source, PortAddress Target,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] CodecReference? Codec = null);
public sealed record FlowDocument(int SchemaVersion, string Id, int Version, string Mode, FlowNode[] Nodes, Connection[] Connections,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? EntryNodeId = null);
public sealed record Diagnostic(string Code, string Path, string Message);
public sealed class ContractException(IReadOnlyList<Diagnostic> diagnostics)
    : Exception(string.Join(Environment.NewLine, diagnostics.Select(d => $"{d.Path}: {d.Message}")))
{
    public IReadOnlyList<Diagnostic> Diagnostics { get; } = diagnostics;
}
