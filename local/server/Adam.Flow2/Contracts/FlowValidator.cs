using System.Text.Json;

namespace Adam.Flow2.Contracts;

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
        var definitions = new Dictionary<(string, int, string?), NodeDefinition>();
        for (var index = 0; index < catalog.Nodes.Length; index++)
        {
            var node = catalog.Nodes[index];
            errors.AddRange(NodeAuthoringContracts.Validate(node));
            if(node.Control is {} control && ((control.Start&&(control.Input||!control.Output||node.Inputs.Count>0)) || (control.Output&&!control.Input&&!control.Start&&node.Graph?.Operation!="invoke"))) Add("control_contract",$"/catalog/nodes/{index}","Invalid Start/control contract.");
            if (!definitions.TryAdd((node.Type, node.Version, node.NodeId), node)) Add("duplicate_node_type", $"/catalog/nodes/{index}", "Duplicate node definition.");
            definitions[(node.Type, node.Version, node.NodeId)] = node;
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
            var definition=NodeResolution.Find(catalog,node);
            if (definition is null)
            { Add("unknown_node_type", path, $"Unknown node {node.Type}@{node.TypeVersion}."); continue; }
            resolved[node.Id] = definition;
            if(!TransportContracts.Equivalent(node.Graph,definition.Graph))Add("graph_binding",path,"Graph binding differs from its node definition.");
            if(!TransportContracts.Equivalent(node.Value,definition.Value))Add("value_binding",path,"Value binding differs from its node definition.");
            if(!TransportContracts.Equivalent(node.Ui,definition.Ui))Add("ui_binding",path,"UI binding differs from its node definition.");
            if(!TransportContracts.Equivalent(node.Ef,definition.Ef))Add("ef_binding",path,"EF binding differs from its node definition.");
            if(!TransportContracts.Equivalent(node.Query,definition.Query))Add("query_binding",path,"Query binding differs from its node definition.");
            errors.AddRange(InlineInputContracts.Validate(node,definition,flow,registry));
            errors.AddRange(NodeAuthoringContracts.ValidateConfig(definition.Config, node.Config, $"{path}/config"));
            if (!definition.Environments.Contains(node.Environment)) Add("environment", path, $"Node {node.Id} is unavailable in {node.Environment}.");
            if (flow.Mode == "hybrid" && (!definition.Environments.Contains("server") || !definition.Environments.Contains("browser") || !definition.Inputs.Values.Concat(definition.Outputs.Values).All(GraphContracts.IsHybridType))) Add("hybrid_node", path, "Hybrid graphs require both server and browser implementations for every node.");
            if (flow.Mode == "backend" && node.Environment == "browser") Add("mode", path, "Backend flows cannot contain browser nodes.");
        }
        var starts=flow.Nodes.Where(node=>resolved.GetValueOrDefault(node.Id)?.Control?.Start==true).ToArray();
        if(starts.Length!=1) Add("start","/flow/nodes","Each graph requires exactly one Start node.");
        if(flow.EntryNodeId is not null&&flow.EntryNodeId!=starts.FirstOrDefault()?.Id) Add("entry","/flow/entryNodeId","Entry must be the Start node.");
        var controlEdges=new HashSet<(string,string)>();
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
            if(connection.Kind=="control")
            {
                if(sourceNode.Control?.Output!=true||targetNode.Control?.Input!=true||source.Port!="out"||target.Port!="in")Add("control_port",path,"Control edges require a control output and input.");
                if(connection.Codec is not null)Add("control_codec",path,"Control edges have no data codec.");
                if(!controlEdges.Add((source.NodeId,target.NodeId)))Add("duplicate_control",path,"Duplicate control connection.");
                continue;
            }
            if (!sourceNode.Outputs.TryGetValue(source.Port, out var sourceType) || !targetNode.Inputs.TryGetValue(target.Port, out var targetType))
            { Add("unknown_port", path, "Connection refers to an unknown port."); continue; }
            if (!connectedInputs.Add((target.NodeId, target.Port))) Add("multiple_inputs", path, "An input port accepts only one connection.");
            if (!registry.IsAssignable(sourceType, targetType)) Add("type_mismatch", path, $"{source.NodeId}.{source.Port} is incompatible with {target.NodeId}.{target.Port}.");
        }
        var active=ControlFlowRules.ActiveNodes(flow,catalog);
        errors.AddRange(FlowInterfaces.Validate(FlowInterfaces.Describe(flow,catalog),active));
        for(var index=0;index<flow.Connections.Length;index++)
        {
            var edge=flow.Connections[index];
            if(active.Contains(edge.Target.NodeId)&&!active.Contains(edge.Source.NodeId))Add("inactive_dependency",$"/flow/connections/{index}","An active node depends on a node outside the Start control flow.");
        }
        foreach (var (id, definition) in resolved)
            if(active.Contains(id)) foreach (var (port, type) in definition.Inputs)
                if (NodeAuthoringContracts.InputRequired(definition, nodes[id].Config, port) && !connectedInputs.Contains((id, port)) && nodes[id].InlineInputs?.GetValueOrDefault(port)?.Enabled!=true) Add("missing_input", $"/flow/nodes/{id}/inputs/{port}", "Required input is not connected.");
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
        if (errors.Count == 0) errors.AddRange(FlowDesignations.Registry.Validate(flow, catalog));
        return errors;
    }
}
