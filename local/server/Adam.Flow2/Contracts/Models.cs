using System.Text.Json;
using System.Text.Json.Serialization;

namespace Adam.Flow2.Contracts;

// JSON Schemas enforce the discriminated shapes before these records are deserialized.
public sealed record TypeRef(
    string Kind,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Name = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] TypeRef? Items = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] TypeRef? Inner = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, TypeRef>? Fields = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] FlowInterface? Signature = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] TypeRef? Key = null);
public sealed record EntityDefinition(string Id, string Kind, Dictionary<string, TypeRef> Fields);
public sealed record TypeDocument(int SchemaVersion, EntityDefinition[] Types);
public sealed record FlowControlPorts(bool Input, bool Output);
public sealed record ControlFlow(bool Input, bool Output, bool Start);
public sealed record GraphNodeBinding(string Operation,FlowInterface Signature,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? GraphId = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string[]? Cases = null);
public sealed record ValueNodeBinding(string Operation, TypeRef Type,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Member = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] TypeRef? Result = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string[]? Fields = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Count = null);
public sealed record QueryNodeBinding(string Operation, TypeRef Element,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] TypeRef? Result = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, TypeRef>? Parameters = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] bool Predicate = false);
public sealed record UiNodeBinding(TypeRef DataType);
public sealed record EfNodeBinding(string Context, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Entity = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Collection = null);
public sealed record NodeDefinition(string Type, int Version, string[] Environments,
    Dictionary<string, TypeRef> Inputs, Dictionary<string, TypeRef> Outputs,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] NodeMetadata? Metadata = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, ConfigField>? Config = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ControlFlow? Control = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? FlowPort = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] GraphNodeBinding? Graph = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] QueryNodeBinding? Query = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ValueNodeBinding? Value = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? NodeId = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] EfNodeBinding? Ef = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] UiNodeBinding? Ui = null);
public sealed record InputRequirement(string Config, string Value);
public sealed record InputEditorMetadata(string Kind, string[] Editors);
public sealed record PortMetadata(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Label = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Description = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Order = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] InputRequirement? RequiredWhen = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] InputEditorMetadata? Editor = null);
public sealed record NodeMetadata(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Label = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Description = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Category = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, PortMetadata>? Inputs = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, PortMetadata>? Outputs = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] EfNodeBinding[]? EfTargets = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string,Dictionary<string,TypeRef>>? EfInputs = null);
public sealed record ConfigField(string Type, JsonElement Default,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Label = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Description = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Order = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string[]? Options = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Scalar = null);
public sealed record NodeCatalog(int SchemaVersion, NodeDefinition[] Nodes);
public sealed record InlineInput(bool Enabled,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] JsonElement Value = default);
public sealed record FlowNode(string Id, string Type, int TypeVersion, string Environment, Dictionary<string, JsonElement> Config,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] GraphNodeBinding? Graph = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] QueryNodeBinding? Query = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ValueNodeBinding? Value = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, InlineInput>? InlineInputs = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] EfNodeBinding? Ef = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] UiNodeBinding? Ui = null);
public sealed record PortAddress(string NodeId, string Port);
public sealed record Connection(PortAddress Source, PortAddress Target,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] CodecReference? Codec = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Kind = null);
public sealed record FlowDocument(int SchemaVersion, string Id, int Version, string Mode, FlowNode[] Nodes, Connection[] Connections,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? EntryNodeId = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] FlowControlPorts? Control = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Designation = null);
public sealed record Diagnostic(string Code, string Path, string Message, string? Severity = null, string? Keyword = null, Dictionary<string,JsonElement>? Params = null);
public sealed class ContractException(IReadOnlyList<Diagnostic> diagnostics)
    : Exception(string.Join(Environment.NewLine, diagnostics.Select(d => $"{d.Path}: {d.Message}")))
{
    public IReadOnlyList<Diagnostic> Diagnostics { get; } = diagnostics;
}

public sealed record FlowParameter(string Name,string NodeId,TypeRef Type);
public sealed record FlowInterface(FlowParameter[] Inputs,FlowParameter[] Outputs,FlowControlPorts Control);

public sealed record GraphReference(string GraphId,int Revision);
public sealed record GraphBundle(int SchemaVersion,string RootGraphId,FlowDocument[] Graphs);
