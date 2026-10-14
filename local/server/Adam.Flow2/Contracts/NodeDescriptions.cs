using System.Text.Json;
namespace Adam.Flow2.Contracts;

/// <summary>Shared standard metadata; application metadata is never overwritten.</summary>
public static class NodeDescriptions
{
    private sealed record Documentation(string Description, Dictionary<string,string> Inputs);
    private static readonly Lazy<Dictionary<string,Documentation>> Entries = new(() => {
        using var stream=typeof(NodeDescriptions).Assembly.GetManifestResourceStream("Data.node-descriptions.json")!;
        return JsonSerializer.Deserialize<Dictionary<string,Documentation>>(stream,ContractSchemas.JsonOptions)!;
    });
    public static NodeDefinition Describe(NodeDefinition definition)
    {
        if(!Entries.Value.TryGetValue(definition.Type,out var entry))return definition;
        var metadata=definition.Metadata??new();
        var inputs=metadata.Inputs is null?new Dictionary<string,PortMetadata>():new(metadata.Inputs);
        foreach(var key in definition.Inputs.Keys){
            var existing=inputs.GetValueOrDefault(key)??new();
            var description=entry.Inputs.GetValueOrDefault(key)??
                (key.StartsWith("field_")?$"Wert für das Feld {key[6..]}; ohne Wert bleibt es unverändert, sofern die Operation einen bestehenden Datensatz bearbeitet.":
                key.StartsWith("item_")?$"Listenelement an Position {key[5..]}.":
                key.StartsWith("arg_")?$"Wert für den Abfrageparameter {key[4..]}.":
                key.StartsWith("in_")?$"Wert für den Graph-Eingang {existing.Label??key[3..]} gemäß der angezeigten Schnittstelle.":
                key.StartsWith("case_")?$"Graph für den Fall {existing.Label??key[5..]}.":null);
            if(description is not null)inputs[key]=existing with {Description=string.IsNullOrEmpty(existing.Description)?description:existing.Description};
        }
        return definition with {Metadata=metadata with {Description=string.IsNullOrEmpty(metadata.Description)?entry.Description:metadata.Description,Inputs=inputs}};
    }
}
