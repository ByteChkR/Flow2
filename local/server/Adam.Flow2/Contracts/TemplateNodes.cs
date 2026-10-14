using System.Text.Json;

namespace Adam.Flow2.Contracts;

/// <summary>Template implementations are host services; the parameter shape is an explicit record contract.</summary>
public static class TemplateNodes
{
    public static readonly string[] Operations = ["execute", "byId", "default", "fromModel"];
    public static string? Operation(string type) => Operations.FirstOrDefault(operation => type == NodeNames.Template(operation));
    public static NodeDefinition Definition(string type, TypeRef? parameters = null)
    {
        var operation = Operation(type) ?? throw new InvalidOperationException("Unknown template operation.");
        parameters ??= new("object", Fields: []);
        if(parameters.Kind != "object" || !TransportContracts.IsTransportable(parameters))throw new InvalidOperationException("Template parameters require a transportable record.");
        var text = new TypeRef("string");var guid = new TypeRef("scalar", Name: "core.Guid");
        var inputs = new Dictionary<string, TypeRef> { ["parameters"] = new("optional", Inner: parameters) };
        inputs["id"] = operation == "default" ? guid : new("optional", Inner: guid);
        if(operation != "default")inputs["where"] = new("optional", Inner: text);
        if(operation == "execute") { inputs["entity"] = text; inputs["name"] = text; }
        else if(operation == "byId")inputs["templateId"] = guid;
        else inputs["groupName"] = text;
        if(operation == "fromModel")
        {
            inputs.Clear();inputs["templateId"]=guid;inputs["model"]=parameters;
        }
        return new(type, 1, ["server"], inputs,
            new() { ["data"] = text, ["type"] = text, ["vorlageId"] = guid, ["vorlagenGruppeId"] = new("nullable", Inner: guid), ["betreff"] = new("nullable", Inner: text) },
            new(Label: operation switch { "execute" => "ExecuteTemplate", "byId" => "ExecuteTemplateById", "fromModel" => "Template aus Datenmodell", _ => "ExecuteDefaultTemplate" }, Category: "Backend/Templates"),
            new() { ["parameterType"] = new("string", JsonSerializer.SerializeToElement(JsonSerializer.Serialize(parameters, ContractSchemas.JsonOptions)), operation=="fromModel"?"Datenmodellvertrag":"Parametervertrag") },
            new(true, true, false));
    }
    public static TypeRef ParameterType(FlowNode node) => node.Config.TryGetValue("parameterType", out var json)
        ? ContractSchemas.Parse<TypeRef>("type", json.GetString()!) : new("object", Fields: []);
}
