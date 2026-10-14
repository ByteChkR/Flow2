
using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Hosting;


using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;

namespace Adam.Flow2.AspNetCore;

[ApiController]
[RequestSizeLimit(1_048_576)]
public abstract class FlowControllerBase(IFlowRuntimeFactory factory, Orchestrator coordinator) : ControllerBase
{
    protected abstract string Owner { get; }
    protected virtual IFlowValidationProgress? BeginValidation(string? id) => null;
    private string? Session => Request.Headers["X-Flow-Session"].FirstOrDefault();

    [HttpGet("catalog")]
    public IActionResult Catalog() => Json(factory.Create().Nodes.Catalog);
    [HttpGet("types")]
    public IActionResult Types() => Json(factory.Create().Nodes.Types);
    [HttpGet("codecs")]
    public IActionResult Codecs() => Json(factory.Create().Codecs.Catalog);

    [HttpPost("sessions")]
    public IActionResult CreateSession([ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) => Guard(() =>
    {
        var value = Body(body, ["browserCatalog", "browserCodecs"]);
        var nodes = ContractSchemas.Parse<NodeCatalog>("catalog", value.GetProperty("browserCatalog").GetRawText());
        var codecs = ContractSchemas.Parse<CodecCatalog>("codecs", value.GetProperty("browserCodecs").GetRawText());
        return Json(new { sessionId = coordinator.CreateSession(Owner, nodes, codecs), leaseSeconds = Orchestrator.Lease.TotalSeconds }, 201);
    });
    [HttpDelete("sessions/{id}")]
    public IActionResult CloseSession(string id) => Guard(() => { coordinator.CloseSession(id, Owner); return NoContent(); });

    [HttpPost("validate")]
    public IActionResult Validate([ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) => Guard(() =>
    {
        using var progress = BeginValidation(Request.Headers["X-Flow-Validation"].FirstOrDefault());
        var value = Body(body, ["bundle", "browserCatalog", "browserCodecs"], ["inputs"]);
        var bundle = ContractSchemas.Parse<GraphBundle>("bundle", value.GetProperty("bundle").GetRawText());
        var nodes = ContractSchemas.Parse<NodeCatalog>("catalog", value.GetProperty("browserCatalog").GetRawText());
        var codecs = ContractSchemas.Parse<CodecCatalog>("codecs", value.GetProperty("browserCodecs").GetRawText());
        Dictionary<string,JsonElement>? inputs=null;
        if(value.TryGetProperty("inputs",out var supplied))
        {
            if(supplied.ValueKind!=JsonValueKind.Object)throw new ProtocolException(400,"schema","Inputs must be a named object.");
            inputs=supplied.Deserialize<Dictionary<string,JsonElement>>(ContractSchemas.JsonOptions);
        }
        progress?.Plan(bundle.Graphs.Select(graph=>(graph.Id,graph.Id)));
        progress?.Phase("Backend-Prüfung (gegebenenfalls auf freie Runtime warten)");
        return Json(new { diagnostics = coordinator.ValidateWorkspace(bundle, nodes, codecs, Owner, inputs, progress is null ? null : progress.Graph, progress is null ? null : progress.Phase) });
    });

    [HttpPost("executions")]
    public IActionResult Start([ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) => Guard(() =>
    {
        var value = Body(body, ["flow"], ["sessionId", "inputs", "bundle", "profiling"]);
        var flow = ContractSchemas.Parse<FlowDocument>("flow", value.GetProperty("flow").GetRawText());
        var session = value.TryGetProperty("sessionId", out var id) ? id.GetString() : null;
        Dictionary<string,JsonElement>? inputs=null;
        if(value.TryGetProperty("inputs",out var supplied))
        {
            if(supplied.ValueKind!=JsonValueKind.Object)throw new ProtocolException(400,"schema","Inputs must be a named object.");
            inputs=supplied.Deserialize<Dictionary<string,JsonElement>>(ContractSchemas.JsonOptions);
        }
        var bundle=value.TryGetProperty("bundle",out var suppliedBundle)?ContractSchemas.Parse<GraphBundle>("bundle",suppliedBundle.GetRawText()):null;
        var profiling=value.TryGetProperty("profiling",out var profile)&&profile.ValueKind==JsonValueKind.True;
        if(value.TryGetProperty("profiling",out profile)&&profile.ValueKind is not (JsonValueKind.True or JsonValueKind.False))throw new ProtocolException(400,"schema","Profiling must be a boolean.");
        return Json(coordinator.Start(flow, session, Owner, inputs,bundle,profiling, allowUnknownInputs: true), 201);
    });
    [HttpPost("executions/{id:guid}/invoke")]
    public IActionResult Invoke(Guid id,[ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body)=>Guard(()=>
    {
        var value=Body(body,["segmentId","attemptId","reference","inputs"],["callKey"]);
        if(value.GetProperty("segmentId").ValueKind!=JsonValueKind.String||value.GetProperty("attemptId").ValueKind!=JsonValueKind.String||value.GetProperty("inputs").ValueKind!=JsonValueKind.Object||!GraphContracts.IsReference(value.GetProperty("reference")))
            throw new ProtocolException(400,"schema","Invalid graph invocation request.");
        if(value.TryGetProperty("callKey",out var key)&&(key.ValueKind!=JsonValueKind.String||key.GetString()!.Length>64))throw new ProtocolException(400,"schema","Invalid graph call key.");
        return Json(coordinator.Invoke(id,Session,Owner,value.Deserialize<GraphCall>(ContractSchemas.JsonOptions)!));
    });
    [HttpDelete("executions/{id:guid}")]
    public IActionResult Cancel(Guid id) => Guard(() => Json(coordinator.Cancel(id, Session, Owner)));
    [HttpGet("executions/{id:guid}/next")]
    public IActionResult Next(Guid id) => Guard(() => Json(coordinator.Next(id, Session, Owner)));
    [HttpPost("executions/{id:guid}/result")]
    public IActionResult Result(Guid id, [ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) => Guard(() =>
    {
        var value = Body(body, ["segmentId", "attemptId", "wires"], ["error", "outputs"]);
        if (value.GetProperty("segmentId").ValueKind != JsonValueKind.String || value.GetProperty("attemptId").ValueKind != JsonValueKind.String || value.GetProperty("wires").ValueKind != JsonValueKind.Object)
            throw new ProtocolException(400, "schema", "Invalid segment result shape.");
        var result = value.Deserialize<BrowserResult>(ContractSchemas.JsonOptions)!;
        if (result.Wires.Values.Any(wire => wire is null) || (result.Error is {} error && (error.Code is null || error.Message is null)))
            throw new ProtocolException(400, "schema", "Invalid result values.");
        return Json(coordinator.Result(id, Session, Owner, result));
    });

    [HttpPost("executions/{id:guid}/results")]
    public IActionResult Results(Guid id, [ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) => Guard(() =>
    {
        var value=Body(body,["results"]);
        var items=value.GetProperty("results");
        if(items.ValueKind!=JsonValueKind.Array||items.GetArrayLength() is <1 or >256)throw new ProtocolException(400,"schema","Expected 1 to 256 results.");
        var results=new List<BrowserResultItem>();
        foreach(var item in items.EnumerateArray())
        {
            if(item.ValueKind!=JsonValueKind.Object)throw new ProtocolException(400,"schema","Invalid result item.");
            var entry=Body(item,["executionId","result"]);
            if(entry.GetProperty("executionId").ValueKind!=JsonValueKind.String||!entry.GetProperty("executionId").TryGetGuid(out var executionId)||entry.GetProperty("result").ValueKind!=JsonValueKind.Object)throw new ProtocolException(400,"schema","Invalid result target.");
            var payload=Body(entry.GetProperty("result"),["segmentId","attemptId","wires"],["error","outputs"]);
            if(payload.GetProperty("segmentId").ValueKind!=JsonValueKind.String||payload.GetProperty("attemptId").ValueKind!=JsonValueKind.String||payload.GetProperty("wires").ValueKind!=JsonValueKind.Object)throw new ProtocolException(400,"schema","Invalid result shape.");
            var result=payload.Deserialize<BrowserResult>(ContractSchemas.JsonOptions)!;
            if(result.Wires.Values.Any(wire=>wire is null)||(result.Error is {} error&&(error.Code is null||error.Message is null)))throw new ProtocolException(400,"schema","Invalid result values.");
            results.Add(new(executionId,result));
        }
        return Json(coordinator.Results(id,Session,Owner,results.ToArray()));
    });

    // Explicit System.Text.Json output preserves the Flow contract despite Adam's MVC Newtonsoft defaults.
    private static ContentResult Json(object value, int status = 200) => new()
    {
        Content = JsonSerializer.Serialize(value, ContractSchemas.JsonOptions),
        ContentType = "application/json; charset=utf-8", StatusCode = status
    };
    private static JsonElement Body(JObject body, string[] required, string[]? optional = null)
    {
        using var document = JsonDocument.Parse(body.ToString(Newtonsoft.Json.Formatting.None));
        return Body(document.RootElement,required,optional).Clone();
    }
    private static JsonElement Body(JsonElement value, string[] required, string[]? optional = null)
    {
        if (required.Any(key => !value.TryGetProperty(key, out _)) || value.EnumerateObject().Any(property => !required.Contains(property.Name) && !(optional ?? []).Contains(property.Name)))
            throw new ProtocolException(400, "schema", "Unexpected request shape.");
        return value;
    }
    private static IActionResult Guard(Func<IActionResult> action)
    {
        try { return action(); }
        catch (ProtocolException error) { return Json(new { code = error.Code, message = error.Message }, error.Status); }
        catch (ContractException error) { return Json(new { errors = error.Diagnostics }, 400); }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException)
        { return Json(new { code = "invalid_request", message = error.Message }, 400); }
    }
}
