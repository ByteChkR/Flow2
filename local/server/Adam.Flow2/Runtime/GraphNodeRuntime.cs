using System.Text.Json;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;

public delegate Task<IReadOnlyDictionary<string,object>> GraphInvoker(string nodeId,GraphReference reference,FlowInterface signature,IReadOnlyDictionary<string,object> inputs,CancellationToken cancellation,string callKey="");

public static class GraphNodeRuntime
{
    public static void Register(FlowDocument flow,GraphBundleSnapshot snapshot,NodeRegistry nodes,CodecRegistry codecs,GraphInvoker invoke,NodeCatalog? referenceCatalog = null)
    {
        var baseCatalog=referenceCatalog??nodes.Catalog;
        var known=codecs.Catalog.Codecs.ToDictionary(codec=>(codec.TypeId,codec.Version));
        foreach(var codec in snapshot.PreparedCodecs)
        {
            known.TryGetValue((codec.TypeId,codec.Version),out var existing);
            if(existing is not null)
            {
                if(!TransportContracts.Equivalent(existing,codec))throw new InvalidOperationException("Conflicting generated graph codec.");
                continue;
            }
            if(codec.ValueType.Kind=="graph")codecs.Register(new(codec,typeof(GraphReference),value=>JsonSerializer.SerializeToElement((GraphReference)value,ContractSchemas.JsonOptions),payload=>payload.Deserialize<GraphReference>(ContractSchemas.JsonOptions)!));
            else codecs.RegisterValue(codec.ValueType);
            known.Add((codec.TypeId,codec.Version),codec);
        }
        foreach(var node in flow.Nodes.Where(node=>node.Graph is not null))
        {
            var def=GraphNodes.Definition(node);var binding=node.Graph!;
            var native=new NodeDefinition(def.Type,def.Version,def.Inputs.ToDictionary(pair=>pair.Key,pair=>Port(pair.Value)),def.Outputs.ToDictionary(pair=>pair.Key,pair=>Port(pair.Value)),def.Metadata,def.Config,def.Control,def.FlowPort,def.Graph,NodeId:node.Id);
            nodes.Register(new(native,_=>throw new InvalidOperationException("Graph built-ins require their execution context."),ExecuteAsync:async (inputs,config,cancellation)=>
            {
                cancellation.ThrowIfCancellationRequested();
                if(binding.Operation=="reference")
                {
                    var reference=snapshot.Reference(binding.GraphId!);
                    snapshot.Resolve(JsonSerializer.SerializeToElement(reference,ContractSchemas.JsonOptions),binding.Signature,baseCatalog);
                    return new Dictionary<string,object>{{"graph",reference}};
                }
                if(GraphControls.IsControl(binding.Operation))return await GraphControlRuntime.Execute(node,inputs,invoke,cancellation,nodes.EntityEquals,nodes.EntityHash);
                if(binding.Operation!="invoke")throw new InvalidOperationException("Graph IO is executed by the flow runtime.");
                var target=binding.GraphId is {} graphId?snapshot.Reference(graphId):(GraphReference)inputs["graph"];
                snapshot.Resolve(JsonSerializer.SerializeToElement(target,ContractSchemas.JsonOptions),binding.Signature,baseCatalog);
                var arguments=binding.Signature.Inputs.Where(parameter=>inputs.ContainsKey(GraphNodes.InputPort(parameter))).ToDictionary(parameter=>parameter.Name,parameter=>inputs[GraphNodes.InputPort(parameter)]);
                var result=await invoke(node.Id,target,binding.Signature,arguments,cancellation);
                nodes.RequireNativeValues(binding.Signature.Outputs,result,"/outputs");
                return binding.Signature.Outputs.Where(parameter=>result.ContainsKey(parameter.Name)).ToDictionary(parameter=>GraphNodes.OutputPort(parameter),parameter=>result[parameter.Name]);
            }));
        }
    }
    public static PortType Port(TypeRef type)=>new(type.Kind,FlowValues.ClrType(type),type,Dynamic:true);
}
