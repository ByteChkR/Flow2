using System.Text.Json;
namespace Flow.Contracts;

public static class NodeAuthoringContracts
{
    public static bool EquivalentConfig(Dictionary<string, ConfigField> left, Dictionary<string, ConfigField> right)
        => TransportContracts.Equivalent(
            left.ToDictionary(p => p.Key, p => new { p.Value.Type, p.Value.Default, p.Value.Options }),
            right.ToDictionary(p => p.Key, p => new { p.Value.Type, p.Value.Default, p.Value.Options }));
    public static IReadOnlyList<Diagnostic> ValidateConfig(Dictionary<string, ConfigField>? fields, IReadOnlyDictionary<string, JsonElement> values, string path = "/config")
    {
        var errors = new List<Diagnostic>();
        foreach (var (key, field) in fields ?? [])
        {
            var value = values.TryGetValue(key, out var supplied) ? supplied : field.Default;
            var valid = field.Type switch
            {
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
        foreach (var (direction, metadata, ports) in new[] { ("inputs", node.Metadata?.Inputs, node.Inputs), ("outputs", node.Metadata?.Outputs, node.Outputs) })
            foreach (var key in (metadata ?? []).Keys)
                if (!ports.ContainsKey(key)) errors.Add(new("metadata", $"/{direction}/{key}", "Metadata refers to an unknown port."));
        return errors;
    }
}
