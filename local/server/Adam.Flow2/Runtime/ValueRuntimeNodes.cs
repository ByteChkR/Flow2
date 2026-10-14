using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

public static class ValueRuntimeNodes
{
    public static RegisteredNode Create(Adam.Flow2.Contracts.NodeDefinition definition,Func<string,object,object,bool>? entityEquals=null,Func<string,object,uint>? entityHash=null)
    {
        PortType Port(TypeRef type)=>new(type.Kind,typeof(object),type,Dynamic:true);
        return new(new(definition.Type,definition.Version,definition.Inputs.ToDictionary(pair=>pair.Key,pair=>Port(pair.Value)),definition.Outputs.ToDictionary(pair=>pair.Key,pair=>Port(pair.Value)),definition.Metadata,definition.Config,definition.Control,definition.FlowPort,Value:definition.Value,NodeId:definition.NodeId),
            inputs=>definition.Value is null&&definition.Type!="Standard.Values.Coalesce"?throw new InvalidOperationException("Value node requires specialization."):definition.Value is {Operation:not "coalesce"} binding?GeneralValueRuntime.Execute(binding,inputs,entityEquals,entityHash):new Dictionary<string,object>{{"value",inputs.GetValueOrDefault("value")??inputs["fallback"]}});
    }
    public static void Prepare(NodeRegistry nodes,FlowDocument flow)
    {
        var definitions=nodes.Catalog.Nodes.ToDictionary(node=>(node.Type,node.Version,node.NodeId));
        var types=nodes.Types;
        foreach(var node in flow.Nodes.Where(node=>node.Value is not null))
        {
            GeneralValueRuntime.Validate(node.Value!,types);
            var definition=ValueNodes.Definition(node) with{Environments=["server"]};
            definitions.TryGetValue((node.Type,node.TypeVersion,node.Id),out var existing);
            if(existing is not null){if(!TransportContracts.Equivalent(existing,definition))throw new InvalidOperationException("Conflicting value specialization.");continue;}
            nodes.Register(Create(definition,nodes.EntityEquals,nodes.EntityHash));
            definitions.Add((node.Type,node.TypeVersion,node.Id),definition);
        }
    }
}
