using System.Text.Json;
using System.Text.Json.Serialization;

namespace Adam.Flow2.Contracts;

/// <summary>A pure, single-parameter expression DAG, separate from executable flow graphs.</summary>
public sealed record ExpressionGraph(int SchemaVersion, TypeRef Parameter, ExpressionNode[] Nodes, string Result);
public sealed record ExpressionNode(string Id, string Operation, Dictionary<string, string> Inputs,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Member = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] TypeRef? Type = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] JsonElement Value = default);
