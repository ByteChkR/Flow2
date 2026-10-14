using System.Text.Json;
namespace Adam.Flow2.Contracts;

public static class NodeAuthoringContracts
{
    public static bool InputRequired(NodeDefinition node, IReadOnlyDictionary<string, JsonElement> values, string port)
    {
        if(node.Inputs[port].Kind != "optional") return true;
        var rule=node.Metadata?.Inputs?.GetValueOrDefault(port)?.RequiredWhen;
        if(rule is null) return false;
        var value=values.TryGetValue(rule.Config,out var supplied)?supplied:node.Config?.GetValueOrDefault(rule.Config)?.Default ?? default;
        return value.ValueKind==JsonValueKind.String && value.GetString()==rule.Value;
    }
    public static bool EquivalentConfig(Dictionary<string, ConfigField> left, Dictionary<string, ConfigField> right)
        => TransportContracts.Equivalent(
            left.ToDictionary(p => p.Key, p => new { p.Value.Type, p.Value.Default, p.Value.Options, p.Value.Scalar }),
            right.ToDictionary(p => p.Key, p => new { p.Value.Type, p.Value.Default, p.Value.Options, p.Value.Scalar }));
    public static IReadOnlyList<Diagnostic> ValidateConfig(Dictionary<string, ConfigField>? fields, IReadOnlyDictionary<string, JsonElement> values, string path = "/config")
    {
        var errors = new List<Diagnostic>();
        foreach (var (key, field) in fields ?? [])
        {
            var value = values.TryGetValue(key, out var supplied) ? supplied : field.Default;
            var valid = field.Type switch
            {
                "scalar" => ScalarValues.IsValue(field.Scalar!, value),
                "string" => value.ValueKind == JsonValueKind.String && (field.Options is null || field.Options.Contains(value.GetString())),
                "number" => value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var n) && double.IsFinite(n),
                "boolean" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
                _ => false
            };
            if (!valid) errors.Add(new("config", $"{path}/{key}", $"Invalid configuration value for {key}."));
        }
        return errors;
    }
    public static IReadOnlyList<Diagnostic> Validate(NodeDefinition node)
    {
        var errors = ValidateConfig(node.Config, new Dictionary<string, JsonElement>()).ToList();
        if(node.FlowPort is not null)
        {
            var ports=node.FlowPort=="input"?node.Outputs:node.Inputs;
            var other=node.FlowPort=="input"?node.Inputs:node.Outputs;
            if(ports.Count!=1||!ports.TryGetValue("value",out var type)||other.Count!=0||node.Config?.GetValueOrDefault("name")?.Type!="string"||
                (node.FlowPort=="input"?node.Control is not null:node.Control?.Input!=true||node.Control.Start))
                errors.Add(new("flow_port","/catalog","Flow ports require a name configuration, one scalar or graph value port, and control input for outputs only."));
        }
        foreach (var (direction, metadata, ports) in new[] { ("inputs", node.Metadata?.Inputs, node.Inputs), ("outputs", node.Metadata?.Outputs, node.Outputs) })
            foreach (var (key, info) in metadata ?? [])
            {
                if (!ports.ContainsKey(key)) errors.Add(new("metadata", $"/{direction}/{key}", "Metadata refers to an unknown port."));
                if(info.Editor is not null)
                {
                    var type=ports.GetValueOrDefault(key);while(type?.Kind is "optional" or "nullable")type=type.Inner;
                    if(direction!="inputs"||type?.Kind!="string")errors.Add(new("metadata",$"/{direction}/{key}","HTML editors require a string input."));
                }
                if(info.RequiredWhen is {} rule && (direction!="inputs" || node.Config?.GetValueOrDefault(rule.Config)?.Type!="string"))
                    errors.Add(new("metadata", $"/{direction}/{key}", "Input requirement must refer to a string configuration."));
            }
        return errors;
    }
}
