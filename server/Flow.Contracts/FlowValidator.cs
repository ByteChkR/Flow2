using System.Text.Json;

namespace Flow.Contracts;

public static class FlowValidator
{
    public static IReadOnlyList<Diagnostic> Validate(JsonElement flowValue, JsonElement catalogValue, JsonElement typesValue)
    {
        var errors = new List<Diagnostic>();
        foreach (var (name, value) in new[] { ("flow", flowValue), ("catalog", catalogValue), ("types", typesValue) })
            errors.AddRange(ContractSchemas.Validate(name, value).Select(d => d with { Path = $"/{name}{d.Path}" }));
        if (errors.Count != 0) return errors;
        var flow = flowValue.Deserialize<FlowDocument>(ContractSchemas.JsonOptions)!;
        var catalog = catalogValue.Deserialize<NodeCatalog>(ContractSchemas.JsonOptions)!;
        TypeRegistry registry;
        try { registry = new(typesValue.Deserialize<TypeDocument>(ContractSchemas.JsonOptions)!); }
        catch (ContractException error) { return error.Diagnostics; }
        void Add(string code, string path, string message) => errors.Add(new(code, path, message));
        var definitions = new Dictionary<(string, int), NodeDefinition>();
        for (var index = 0; index < catalog.Nodes.Length; index++)
        {
            var node = catalog.Nodes[index];
            errors.AddRange(NodeAuthoringContracts.Validate(node));
            if (!definitions.TryAdd((node.Type, node.Version), node)) Add("duplicate_node_type", $"/catalog/nodes/{index}", "Duplicate node definition.");
            definitions[(node.Type, node.Version)] = node;
            foreach (var port in node.Inputs.Concat(node.Outputs)) errors.AddRange(registry.Check(port.Value, $"/catalog/nodes/{index}/{port.Key}"));
        }
        var nodes = new Dictionary<string, FlowNode>(StringComparer.Ordinal);
        var resolved = new Dictionary<string, NodeDefinition>(StringComparer.Ordinal);
        var edges = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        for (var index = 0; index < flow.Nodes.Length; index++)
        {
            var node = flow.Nodes[index];
            var path = $"/flow/nodes/{index}";
            if (!nodes.TryAdd(node.Id, node)) Add("duplicate_node", path, $"Duplicate node ID {node.Id}.");
            nodes[node.Id] = node; edges[node.Id] = new(StringComparer.Ordinal);
            if (!definitions.TryGetValue((node.Type, node.TypeVersion), out var definition))
            { Add("unknown_node_type", path, $"Unknown node {node.Type}@{node.TypeVersion}."); continue; }
            resolved[node.Id] = definition;
            errors.AddRange(NodeAuthoringContracts.ValidateConfig(definition.Config, node.Config, $"{path}/config"));
            if (!definition.Environments.Contains(node.Environment)) Add("environment", path, $"Node {node.Id} is unavailable in {node.Environment}.");
            if (flow.Mode == "backend" && node.Environment == "browser") Add("mode", path, "Backend flows cannot contain browser nodes.");
        }
        var connectedInputs = new HashSet<(string, string)>();
        var incoming = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < flow.Connections.Length; index++)
        {
            var connection = flow.Connections[index];
            var path = $"/flow/connections/{index}";
            var source = connection.Source; var target = connection.Target;
            if (!nodes.ContainsKey(source.NodeId) || !nodes.ContainsKey(target.NodeId))
            { Add("unknown_node", path, "Connection refers to an unknown node."); continue; }
            edges[source.NodeId].Add(target.NodeId); incoming.Add(target.NodeId);
            if (!resolved.TryGetValue(source.NodeId, out var sourceNode) || !resolved.TryGetValue(target.NodeId, out var targetNode)) continue;
            if (!sourceNode.Outputs.TryGetValue(source.Port, out var sourceType) || !targetNode.Inputs.TryGetValue(target.Port, out var targetType))
            { Add("unknown_port", path, "Connection refers to an unknown port."); continue; }
            if (!connectedInputs.Add((target.NodeId, target.Port))) Add("multiple_inputs", path, "An input port accepts only one connection.");
            if (!registry.IsAssignable(sourceType, targetType)) Add("type_mismatch", path, $"{source.NodeId}.{source.Port} is incompatible with {target.NodeId}.{target.Port}.");
        }
        foreach (var (id, definition) in resolved)
            foreach (var (port, type) in definition.Inputs)
                if (type.Kind != "optional" && !connectedInputs.Contains((id, port))) Add("missing_input", $"/flow/nodes/{id}/inputs/{port}", "Required input is not connected.");
        if (flow.EntryNodeId is not null && (!nodes.ContainsKey(flow.EntryNodeId) || incoming.Contains(flow.EntryNodeId)))
            Add("entry", "/flow/entryNodeId", "Entry must identify an existing root node.");
        var indegree = nodes.Keys.ToDictionary(id => id, _ => 0, StringComparer.Ordinal);
        foreach (var targets in edges.Values) foreach (var id in targets) indegree[id]++;
        var ready = new Queue<string>(indegree.Where(pair => pair.Value == 0).Select(pair => pair.Key));
        var visited = 0;
        while (ready.TryDequeue(out var id))
        {
            visited++;
            foreach (var target in edges[id]) if (--indegree[target] == 0) ready.Enqueue(target);
        }
        if (visited != nodes.Count) Add("cycle", "/flow/connections", "Flow must be acyclic.");
        return errors;
    }
}
