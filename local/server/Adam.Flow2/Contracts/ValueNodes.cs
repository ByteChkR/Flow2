namespace Adam.Flow2.Contracts;

public static class ValueNodes
{
    public const string CoalesceType="Standard.Values.Coalesce";
    public static string NodeType(string id)=>CoalesceType;
    public static NodeDefinition Definition(FlowNode node)
    {
        var binding=node.Value;
        if(binding is not null&&binding.Operation!="coalesce")return GeneralValueNodes.Definition(node);
        if(binding is null||binding.Operation!="coalesce"||node.Type!=NodeType(node.Id)||node.TypeVersion!=1||node.Graph is not null||node.Query is not null||binding.Type.Kind is "null" or "nullable" or "optional"||binding.Member is not null||binding.Result is not null||binding.Fields is not null||binding.Count is not null)
            throw new ContractException([new("value_binding",$"/flow/nodes/{node.Id}","Invalid Coalesce specialization: T must be present and non-nullable.")]);
        return new(node.Type,1,TransportContracts.IsTransportable(binding.Type)?["server","browser"]:["server"],
            new(){{"value",new("optional",Inner:new("nullable",Inner:binding.Type))},{"fallback",binding.Type}},new(){{"value",binding.Type}},
            new(Label:"Coalesce",Category:"Werte/Null",Description:"Verwendet den Ersatzwert bei fehlendem Wert oder null. Beide Eingänge werden ausgewertet.",Inputs:new(){{"value",new(Label:"Wert")},{"fallback",new(Label:"Ersatzwert")}},Outputs:new(){{"value",new(Label:"Wert")}}),Value:binding,NodeId:node.Id);
    }
    public static NodeCatalog BrowserCatalog(FlowDocument flow,NodeCatalog catalog)=>new(1,[..catalog.Nodes,..flow.Nodes.Where(node=>node.Value is not null).Select(Definition).Where(definition=>definition.Environments.Contains("browser")).Select(definition=>definition with{Environments=["browser"]})]);
    public static NodeDefinition Template()
    {
        var definition=Definition(new("template",NodeType("template"),1,"server",[],Value:new("coalesce",new("string"))));
        return definition with{Type=CoalesceType,Value=null,NodeId=null,Metadata=definition.Metadata! with{Label="Coalesce<T>"}};
    }
}
