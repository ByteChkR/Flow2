namespace Adam.Flow2.Contracts;

public sealed record PlannedNode(string Id, string Type, int TypeVersion, string Environment,
    Dictionary<string, System.Text.Json.JsonElement> Config, string[] Dependencies,
    Dictionary<string, TypeRef> Inputs, Dictionary<string, TypeRef> Outputs,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] ControlFlow? Control = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? FlowPort = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] GraphNodeBinding? Graph = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] Dictionary<string, InlineInput>? InlineInputs = null);
public sealed record PlannedConnection(int Index, PortAddress Source, PortAddress Target,
    TypeRef SourceType, TypeRef TargetType,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] CodecReference? Codec, bool Boundary,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] string? Kind = null);
public sealed record ExecutionSegment(string Id, string Environment, List<string> NodeIds,
    List<string> Dependencies, List<int> Incoming, List<int> Outgoing);
public sealed record ExecutionPlan(int SchemaVersion, string FlowId, int FlowVersion, string Mode,
    PlannedNode[] Nodes, PlannedConnection[] Connections, ExecutionSegment[] Segments, string[] SkippedNodeIds, FlowInterface Interface);

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
        var active=ControlFlowRules.ActiveNodes(flow,catalog);
        NodeDefinition Definition(FlowNode node)=>NodeResolution.Find(catalog,node)!;
        var start=flow.Nodes.Single(node=>Definition(node).Control?.Start==true);
        string[] Dependencies(string id)=>flow.Connections.Where(edge=>edge.Target.NodeId==id).Select(edge=>edge.Source.NodeId)
            .Concat(id==start.Id?[]:new[]{start.Id}).Distinct().ToArray();
        var pending=flow.Nodes.Where(node=>active.Contains(node.Id)).ToList();
        var completed=new HashSet<string>();
        var nodes=new List<PlannedNode>();var segments=new List<ExecutionSegment>();
        while(pending.Count>0)
        {
            var node=pending.FirstOrDefault(node=>Dependencies(node.Id).All(completed.Contains));
            if(node is null)throw new ContractException([new("cycle","/flow","No schedulable node.")]);
            var definition=Definition(node);
            nodes.Add(new(node.Id,node.Type,node.TypeVersion,node.Environment,node.Config,Dependencies(node.Id),definition.Inputs,definition.Outputs,definition.Control,definition.FlowPort,node.Graph,node.InlineInputs));
            completed.Add(node.Id);pending.Remove(node);
        }
        var connections=flow.Connections.Select((edge,index)=>
        {
            var source=flow.Nodes.Single(node=>node.Id==edge.Source.NodeId);
            var target=flow.Nodes.Single(node=>node.Id==edge.Target.NodeId);
            return new PlannedConnection(index,edge.Source,edge.Target,
                edge.Kind=="control"?new("null"):Definition(source).Outputs[edge.Source.Port],
                edge.Kind=="control"?new("null"):Definition(target).Inputs[edge.Target.Port],edge.Codec,
                edge.Kind!="control"&&active.Contains(target.Id)&&source.Environment!=target.Environment,edge.Kind);
        }).ToArray();
        // Collapse only linear chains. Forks/joins, runtime changes and graph calls
        // retain boundaries so independent work remains independently schedulable.
        var effective=nodes.ToDictionary(node=>node.Id,node=>node.Dependencies.Any(id=>id!=start.Id)
            ? node.Dependencies.Where(id=>id!=start.Id).ToArray() : node.Dependencies);
        var successors=nodes.ToDictionary(node=>node.Id,_=>0);
        foreach(var dependencies in effective.Values)foreach(var id in dependencies)successors[id]++;
        var byId=nodes.ToDictionary(node=>node.Id);
        var owner=new Dictionary<string,ExecutionSegment>();
        foreach(var node in nodes)
        {
            var dependencies=effective[node.Id];
            ExecutionSegment segment;
            if(dependencies.Length==1 && successors[dependencies[0]]==1 && node.Graph is null
                && byId[dependencies[0]].Graph is null && owner[dependencies[0]].Environment==node.Environment
                && owner[dependencies[0]].NodeIds.Count<256)
            {
                segment=owner[dependencies[0]];segment.NodeIds.Add(node.Id);
            }
            else {segment=new($"segment-{segments.Count}",node.Environment,[node.Id],[],[],[]);segments.Add(segment);}
            owner.Add(node.Id,segment);
        }
        foreach(var segment in segments)
            foreach(var dependency in segment.NodeIds.SelectMany(id=>byId[id].Dependencies).Select(id=>owner[id].Id).Distinct())
                if(dependency!=segment.Id)segment.Dependencies.Add(dependency);
        foreach(var edge in connections)
        {
            var source=segments.FirstOrDefault(segment=>segment.NodeIds.Contains(edge.Source.NodeId));
            var target=segments.FirstOrDefault(segment=>segment.NodeIds.Contains(edge.Target.NodeId));
            if(source is null||target is null||source==target)continue;
            source.Outgoing.Add(edge.Index);target.Incoming.Add(edge.Index);
        }
        return new(1,flow.Id,flow.Version,flow.Mode,nodes.ToArray(),connections,segments.ToArray(),flow.Nodes.Where(node=>!active.Contains(node.Id)).Select(node=>node.Id).ToArray(),FlowInterfaces.Describe(flow,catalog));
    }

    public static string Generate(ExecutionSegment segment) => "'use strict';\n" +
        string.Concat(segment.NodeIds.Select((_, index) => $"host.invokeNode({index});\n")) + "host.completeSegment();";
}
