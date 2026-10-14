using System.Text.Json;

namespace Adam.Flow2.Contracts;
public static class GraphNodes
{
    public static string InputPort(FlowParameter parameter)=>"in_"+parameter.NodeId;
    public static string OutputPort(FlowParameter parameter)=>"out_"+parameter.NodeId;
    public static string NodeType(string id,string operation)=>NodeNames.Graph(operation);
    public static NodeDefinition Definition(FlowNode node) => NodeDescriptions.Describe(DefinitionCore(node));
    private static NodeDefinition DefinitionCore(FlowNode node)
    {
        var binding=node.Graph??throw new InvalidOperationException("Missing graph node binding.");
        var graphType=new TypeRef("graph",Signature:binding.Signature);
        var errors=ContractSchemas.Validate("type",JsonSerializer.SerializeToElement(graphType,ContractSchemas.JsonOptions)).ToList();
        if(errors.Count!=0)throw new ContractException(errors);
        errors.AddRange(GraphContracts.SignatureDiagnostics(binding.Signature));
        if((!GraphControls.IsControl(binding.Operation)&&binding.Operation is not ("reference" or "invoke"))||node.Type!=NodeType(node.Id,binding.Operation)||node.TypeVersion!=1||
            (binding.Operation=="reference"&&string.IsNullOrEmpty(binding.GraphId)))
            errors.Add(new("graph_node",$"/flow/nodes/{node.Id}","Invalid built-in graph node binding."));
        if(errors.Count!=0)throw new ContractException(errors);
        if(GraphControls.IsControl(binding.Operation))return GraphControls.Definition(node);
        if(binding.Cases is not null)throw new InvalidOperationException("Only Switch may declare cases.");
        Dictionary<string,TypeRef> inputs=new(),outputs=new();
        Dictionary<string,PortMetadata> inputLabels=new(),outputLabels=new();
        string label="",flowPort=null!;ControlFlow? control=null;
        Dictionary<string,ConfigField>? config=null;
        switch(binding.Operation)
        {
            case "reference":label="Graph-Referenz";outputs.Add("graph",graphType);break;
            case "invoke":
                label="Graph aufrufen";
                if(binding.GraphId is null)inputs.Add("graph",graphType);
                foreach(var parameter in binding.Signature.Inputs){var key=InputPort(parameter);inputs.Add(key,parameter.Type);inputLabels.Add(key,new(parameter.Name));}
                foreach(var parameter in binding.Signature.Outputs){var key=OutputPort(parameter);outputs.Add(key,parameter.Type);outputLabels.Add(key,new(parameter.Name));}
                if(binding.Signature.Control.Input||binding.Signature.Control.Output)control=new(binding.Signature.Control.Input,binding.Signature.Control.Output,false);
                break;
        }
        if(flowPort is not null)config=new(){{"name",new("string",JsonSerializer.SerializeToElement(flowPort=="input"?"graphInput":"graphOutput"),"Name")}};
        return new(node.Type,1,["server","browser"],inputs,outputs,new(Label:label,Category:"Workspace",Inputs:inputLabels,Outputs:outputLabels),config,control,flowPort,binding,NodeId:node.Id);
    }
    public static NodeCatalog Catalog(FlowDocument flow,NodeCatalog baseCatalog)
    {
        var generated=flow.Nodes.Where(node=>node.Graph is not null).Select(Definition).ToArray();
        if(generated.Any(def=>baseCatalog.Nodes.Any(node=>node.Type==def.Type&&node.NodeId==def.NodeId)))throw new InvalidOperationException("A graph built-in cannot replace a registered node.");
        return new(1,[..baseCatalog.Nodes,..generated]);
    }
    public static string CodecIdentity(TypeRef type,string prefix="workspace.Graph.")
    {
        string Key(JsonElement value)=>value.ValueKind switch
        {
            JsonValueKind.String=>"s"+string.Concat(value.GetString()!.Select(character=>((int)character).ToString("x4")))+";",
            JsonValueKind.Array=>"["+string.Concat(value.EnumerateArray().Select(Key))+"]",
            JsonValueKind.Object=>"{"+string.Concat(value.EnumerateObject().OrderBy(property=>property.Name,StringComparer.Ordinal).Select(property=>Key(JsonSerializer.SerializeToElement(property.Name))+Key(property.Value)))+"}",
            _=>value.GetRawText()+";"
        };
        ulong hash=14695981039346656037;
        foreach(var character in Key(JsonSerializer.SerializeToElement(type,ContractSchemas.JsonOptions)))hash=unchecked((hash^character)*1099511628211);
        return prefix+hash.ToString("x16");
    }
    public static CodecDefinition[] Codecs(GraphBundle bundle)
    {
        var codecs=new List<CodecDefinition>();
        foreach(var flow in bundle.Graphs)foreach(var node in flow.Nodes)
        {
            if(node.Graph is null&&node.Value is null)continue;
            var def=node.Graph is not null?Definition(node):ValueNodes.Definition(node);
            foreach(var (direction,ports) in new[]{("inputs",def.Inputs),("outputs",def.Outputs)})foreach(var (port,type) in ports)
            {
                if(codecs.Any(codec=>TransportContracts.Equivalent(codec.ValueType,type)))continue;
                if(type.Kind!="graph")
                {
                    if(type.Kind is "array" or "object" or "nullable" or "optional" or "entityRef" or "number" or "boolean" or "null" && TransportContracts.IsTransportable(type))codecs.Add(ValueCodecs.Definition(type));
                    continue;
                }
                var schema=JsonSerializer.SerializeToElement(new Dictionary<string,object>{{"$schema","https://json-schema.org/draft/2020-12/schema"},{"type","object"},{"properties",new{graphId=new{type="string",pattern="^[A-Za-z_][A-Za-z0-9_.-]*$"},revision=new{type="integer",minimum=1,maximum=int.MaxValue}}},{"required",new[]{"graphId","revision"}},{"additionalProperties",false}});
                codecs.Add(new(CodecIdentity(type),1,type,schema));
            }
        }
        if(codecs.Select(codec=>codec.TypeId).Distinct().Count()!=codecs.Count)throw new InvalidOperationException("Graph codec identity collision.");
        return codecs.ToArray();
    }
}
