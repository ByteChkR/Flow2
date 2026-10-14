using System.Text.Json;
namespace Adam.Flow2.Contracts;
public static class InlineInputContracts
{
    public static bool IsPrimitive(TypeRef type)=>type.Kind is "optional" or "nullable"?IsPrimitive(type.Inner!):type.Kind is "scalar" or "string" or "number" or "boolean" or "null";
    public static IReadOnlyList<Diagnostic> Validate(FlowNode node,NodeDefinition definition,FlowDocument flow,TypeRegistry registry)
    {
        var errors=new List<Diagnostic>();
        foreach(var (port,literal) in node.InlineInputs??[])
        {
            var path=$"/flow/nodes/{node.Id}/inlineInputs/{port}";
            if(!definition.Inputs.TryGetValue(port,out var type)||!IsPrimitive(type)){errors.Add(new("inline_input",path,"Inline values require an existing primitive input."));continue;}
            if(!literal.Enabled)continue;
            if(flow.Connections.Any(edge=>edge.Kind!="control"&&edge.Target.NodeId==node.Id&&edge.Target.Port==port))errors.Add(new("inline_connected",path,"Connected inputs cannot also enable an inline value."));
            if(literal.Value.ValueKind==JsonValueKind.Undefined)errors.Add(new("inline_value",path,"An enabled inline input needs a value."));
            else errors.AddRange(registry.ValidateValue(type,literal.Value,path+"/value"));
        }
        return errors;
    }
}
