using System.Text.Json;
namespace Adam.Flow2.Contracts;
public static class FlowInterfaces
{
    public static FlowInterface Describe(FlowDocument flow,NodeCatalog catalog)
    {
        var inputs=new List<FlowParameter>();var outputs=new List<FlowParameter>();
        foreach(var node in flow.Nodes)
        {
            var def=node.Graph is not null?GraphNodes.Definition(node):node.Value is not null?ValueNodes.Definition(node):NodeResolution.Find(catalog,node);
            if(def?.FlowPort is null)continue;
            var name=node.Config.TryGetValue("name",out var configured)?configured:def.Config?.GetValueOrDefault("name")?.Default??default;
            var ports=def.FlowPort=="input"?def.Outputs:def.Inputs;
            if(name.ValueKind==JsonValueKind.String&&ports.TryGetValue("value",out var type))
                (def.FlowPort=="input"?inputs:outputs).Add(new(name.GetString()!,node.Id,type));
        }
        return new(inputs.ToArray(),outputs.ToArray(),flow.Control??new(false,false));
    }
    public static IEnumerable<Diagnostic> Validate(FlowInterface signature,HashSet<string> active)
    {
        foreach(var (direction,parameters) in new[]{("inputs",signature.Inputs),("outputs",signature.Outputs)})
        {
            var seen=new HashSet<string>();
            foreach(var parameter in parameters)
            {
                if(!System.Text.RegularExpressions.Regex.IsMatch(parameter.Name,@"\A[A-Za-z_][A-Za-z0-9_]*\z")||!seen.Add(parameter.Name))
                    yield return new("parameter_name",$"/flow/nodes/{parameter.NodeId}/config/name","Flow-Parameter brauchen einen eindeutigen Namen (Buchstaben, Ziffern, Unterstrich).");
                if(direction=="outputs"&&!active.Contains(parameter.NodeId))yield return new("inactive_output",$"/flow/nodes/{parameter.NodeId}","Flow Output muss mit dem Start-Kontrollfluss verbunden sein.");
            }
        }
    }
    public static void RequireValues(FlowParameter[] parameters,IReadOnlyDictionary<string,JsonElement> values,string path="/inputs",TypeRegistry? registry=null, bool allowUnknown=false)
    {
        registry??=new(new(1,[]));
        var errors=new List<Diagnostic>();
        foreach(var parameter in parameters)
        {
            values.TryGetValue(parameter.Name,out var value);
            errors.AddRange(registry.ValidateValue(parameter.Type,value,$"{path}/{parameter.Name}").Select(error=>error with{Code="parameter_value",Message=$"Node {parameter.NodeId}, value ({parameter.Name}): {error.Message}"}));
        }
        foreach(var name in values.Keys)
        {
            if(!allowUnknown && parameters.All(parameter => parameter.Name != name))
                errors.Add(new("parameter_value",$"{path}/{name}",$"Unbekannter Flow-Parameter: {name}."));
        }
        if(errors.Count>0)throw new ContractException(errors);
    }
}
