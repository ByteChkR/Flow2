using System.Text.Json;
using System.Text.RegularExpressions;

namespace Adam.Flow2.Contracts;

public static class GraphContracts
{
    // Declaration IDs preserve editor connections; public names and exact types define compatibility.
    public static bool IsHybridType(TypeRef type)=>type.Kind switch
    {
        "graph"=>type.Signature!.Inputs.Concat(type.Signature.Outputs).All(port=>IsHybridType(port.Type)),
        "array" or "dictionary"=>IsHybridType(type.Items!),
        "object"=>type.Fields!.Values.All(IsHybridType),
        "optional" or "nullable"=>IsHybridType(type.Inner!),
        _=>TransportContracts.IsTransportable(type)
    };
    public static FlowDocument MaterializeHybrid(FlowDocument flow,string environment="server") => flow.Mode!="hybrid"?flow:flow with
    {
        Nodes=flow.Nodes.Select(node=>node with{Environment=environment}).ToArray(),
        Connections=flow.Connections.Select(edge=>edge with{Codec=null}).ToArray()
    };
    public static bool SameSignature(FlowInterface left,FlowInterface right) =>
        !SignatureDiagnostics(left).Any()&&!SignatureDiagnostics(right).Any()&&TransportContracts.Equivalent(Shape(left),Shape(right));
    private static object Shape(FlowInterface signature)=>new
    {
        inputs=signature.Inputs.ToDictionary(port=>port.Name,port=>Shape(port.Type)),
        outputs=signature.Outputs.ToDictionary(port=>port.Name,port=>Shape(port.Type)),
        control=signature.Control
    };
    private static object Shape(TypeRef type)=>type.Kind switch
    {
        "grouping"=>new{kind=type.Kind,key=Shape(type.Key!),items=Shape(type.Items!)},
        "graph"=>new{kind=type.Kind,signature=Shape(type.Signature!)},
        "object"=>new{kind=type.Kind,fields=type.Fields!.ToDictionary(pair=>pair.Key,pair=>Shape(pair.Value))},
        "dictionary" or "array" or "queryable" or "orderedQueryable" or "enumerable"=>new{kind=type.Kind,items=Shape(type.Items!)},
        "optional" or "nullable"=>new{kind=type.Kind,inner=Shape(type.Inner!)},
        "scalar" or "entity" or "entityRef"=>new{kind=type.Kind,name=type.Name},
        _=>new{kind=type.Kind}
    };
    public static IEnumerable<Diagnostic> SignatureDiagnostics(FlowInterface signature,string path="")
    {
        foreach(var (direction,ports) in new[]{("inputs",signature.Inputs),("outputs",signature.Outputs)})
        {
            var names=new HashSet<string>(StringComparer.Ordinal);var ids=new HashSet<string>(StringComparer.Ordinal);
            for(var i=0;i<ports.Length;i++)
            {
                var uniqueName=names.Add(ports[i].Name);var uniqueId=ids.Add(ports[i].NodeId);
                if(!uniqueName||!uniqueId)yield return new("graph_signature",$"{path}/{direction}/{i}","Graph ports require unique names and IDs per direction.");
            }
        }
    }
    public static bool IsReference(JsonElement value)=>value.ValueKind==JsonValueKind.Object&&value.EnumerateObject().Count()==2&&
        value.TryGetProperty("graphId",out var id)&&id.ValueKind==JsonValueKind.String&&Regex.IsMatch(id.GetString()!,@"\A[A-Za-z_][A-Za-z0-9_.-]*\z")&&
        value.TryGetProperty("revision",out var revision)&&revision.ValueKind==JsonValueKind.Number&&revision.TryGetDecimal(out var number)&&number>=1&&number<=int.MaxValue&&number==decimal.Truncate(number);
}

/// <summary>A run owns a frozen workspace snapshot; no accessor exposes mutable definitions.</summary>
public sealed class GraphBundleSnapshot
{
    private readonly GraphBundle bundle;
    private readonly Lazy<CodecDefinition[]> codecs;
    // Owned by this immutable snapshot; consumers must not mutate these definitions.
    internal CodecDefinition[] PreparedCodecs=>codecs.Value;
    private readonly Dictionary<string,FlowDocument> definitions=new(StringComparer.Ordinal);
    private static T Clone<T>(T value)=>JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value,ContractSchemas.JsonOptions),ContractSchemas.JsonOptions)!;
    public GraphBundleSnapshot(GraphBundle value) : this(value,false) { }
    internal GraphBundleSnapshot(GraphBundle value,bool alreadyValidated)
    {
        bundle=alreadyValidated?Clone(value):ContractSchemas.Parse<GraphBundle>("bundle",JsonSerializer.Serialize(value,ContractSchemas.JsonOptions));
        codecs=new(()=>GraphNodes.Codecs(bundle),LazyThreadSafetyMode.ExecutionAndPublication);
        foreach(var flow in bundle.Graphs)
            if(!definitions.TryAdd(flow.Id,flow))throw new ContractException([new("duplicate_graph","/bundle/graphs",$"Duplicate graph {flow.Id}.")]);
        foreach(var graph in bundle.Graphs.Where(graph=>graph.Mode=="hybrid"))
            foreach(var node in graph.Nodes.Where(node=>node.Graph?.GraphId is not null))
                if(!definitions.TryGetValue(node.Graph!.GraphId!,out var target)||target.Mode!="hybrid")
                    throw new ContractException([new("hybrid_graph",$"/graphs/{graph.Id}/nodes/{node.Id}","Hybrid graphs may reference only hybrid subgraphs.")]);
        if(!definitions.ContainsKey(bundle.RootGraphId))throw new ContractException([new("graph_missing","/bundle/rootGraphId","Root graph is missing.")]);
    }
    public FlowDocument Root=>Clone(definitions[bundle.RootGraphId]);
    public GraphBundle Document=>Clone(bundle);
    public GraphReference Reference(string graphId)=>definitions.TryGetValue(graphId,out var graph)?new(graphId,graph.Version):
        throw new ContractException([new("graph_missing","/graphId",$"Unknown workspace graph {graphId}.")]);
    public FlowDocument Resolve(JsonElement value,FlowInterface signature,NodeCatalog catalog)
    {
        if(!GraphContracts.IsReference(value))throw new ContractException([new("graph_reference","/graph","Expected a graph reference with graphId and revision.")]);
        var reference=value.Deserialize<GraphReference>(ContractSchemas.JsonOptions)!;
        if(!definitions.TryGetValue(reference.GraphId,out var graph)||graph.Version!=reference.Revision)
            throw new ContractException([new("graph_reference","/graph","Graph reference is missing or belongs to a different revision.")]);
        var actual=FlowInterfaces.Describe(graph,catalog);
        var errors=GraphContracts.SignatureDiagnostics(signature).Concat(GraphContracts.SignatureDiagnostics(actual)).ToArray();
        if(errors.Length!=0)throw new ContractException(errors);
        if(!GraphContracts.SameSignature(actual,signature))throw new ContractException([new("graph_signature","/graph","Graph interface does not match the expected signature.")]);
        return Clone(graph);
    }
}
