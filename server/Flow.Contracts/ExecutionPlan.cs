namespace Flow.Contracts;

public sealed record PlannedNode(string Id, string Type, int TypeVersion, string Environment,
    Dictionary<string, System.Text.Json.JsonElement> Config, string[] Dependencies,
    Dictionary<string, TypeRef> Inputs, Dictionary<string, TypeRef> Outputs);
public sealed record PlannedConnection(int Index, PortAddress Source, PortAddress Target,
    TypeRef SourceType, TypeRef TargetType,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] CodecReference? Codec, bool Boundary);
public sealed record ExecutionSegment(string Id, string Environment, List<string> NodeIds,
    List<string> Dependencies, List<int> Incoming, List<int> Outgoing);
public sealed record ExecutionPlan(int SchemaVersion, string FlowId, int FlowVersion, string Mode,
    PlannedNode[] Nodes, PlannedConnection[] Connections, ExecutionSegment[] Segments);

public static class FlowCompiler
{
    // Independently derive plans from validated declarations, never trust imported executable text.
    public static ExecutionPlan Compile(FlowDocument flow, NodeCatalog catalog, TypeDocument types,
        CodecCatalog server, CodecCatalog browser)
    {
        var errors = TransportContracts.ValidateFlow(
            System.Text.Json.JsonSerializer.SerializeToElement(flow, ContractSchemas.JsonOptions),
            System.Text.Json.JsonSerializer.SerializeToElement(catalog, ContractSchemas.JsonOptions),
            System.Text.Json.JsonSerializer.SerializeToElement(types, ContractSchemas.JsonOptions), server, browser);
        if (errors.Count != 0) throw new ContractException(errors);
        var pending = flow.Nodes.ToList();
        var completed = new HashSet<string>();
        var nodes = new List<PlannedNode>();
        var segments = new List<ExecutionSegment>();
        while (pending.Count != 0)
        {
            var ready = pending.Where(node => flow.Connections.All(edge => edge.Target.NodeId != node.Id || completed.Contains(edge.Source.NodeId))).ToArray();
            if (ready.Length == 0) throw new ContractException([new("cycle", "/flow", "No schedulable node.")]);
            var segment = segments.LastOrDefault();
            var node = ready.FirstOrDefault(node => node.Environment == segment?.Environment) ?? ready[0];
            if (segment is null || segment.Environment != node.Environment)
            {
                segment = new($"segment-{segments.Count}", node.Environment, [], [], [], []);
                segments.Add(segment);
            }
            var definition = catalog.Nodes.Single(definition => definition.Type == node.Type && definition.Version == node.TypeVersion);
            nodes.Add(new(node.Id, node.Type, node.TypeVersion, node.Environment, node.Config,
                flow.Connections.Where(edge => edge.Target.NodeId == node.Id).Select(edge => edge.Source.NodeId).Distinct().ToArray(), definition.Inputs, definition.Outputs));
            segment.NodeIds.Add(node.Id); completed.Add(node.Id); pending.Remove(node);
        }
        var connections = flow.Connections.Select((edge, index) => new PlannedConnection(index, edge.Source, edge.Target,
            nodes.Single(node => node.Id == edge.Source.NodeId).Outputs[edge.Source.Port],
            nodes.Single(node => node.Id == edge.Target.NodeId).Inputs[edge.Target.Port], edge.Codec,
            nodes.Single(node => node.Id == edge.Source.NodeId).Environment != nodes.Single(node => node.Id == edge.Target.NodeId).Environment)).ToArray();
        foreach (var edge in connections)
        {
            var source = segments.Single(segment => segment.NodeIds.Contains(edge.Source.NodeId));
            var target = segments.Single(segment => segment.NodeIds.Contains(edge.Target.NodeId));
            if (source == target) continue;
            source.Outgoing.Add(edge.Index); target.Incoming.Add(edge.Index);
            if (!target.Dependencies.Contains(source.Id)) target.Dependencies.Add(source.Id);
        }
        return new(1, flow.Id, flow.Version, flow.Mode, nodes.ToArray(), connections, segments.ToArray());
    }

    public static string Generate(ExecutionSegment segment) => "'use strict';\n" +
        string.Concat(segment.NodeIds.Select((_, index) => $"host.invokeNode({index});\n")) + "host.completeSegment();";
}
