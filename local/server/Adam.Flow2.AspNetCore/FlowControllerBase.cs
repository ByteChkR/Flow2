
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
        var timing = Request.Headers["X-Flow-Profile"].ToString() == "1" ? new PhaseTimings() : null;
        var result = new FlowExecutionProtocol(coordinator).OpenSession(Element(body), Owner, timing);
        if (timing is not null) Response.Headers["Server-Timing"] = timing.ServerTiming();
        return Json(result, 201);
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
    public IActionResult Start([ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) =>
        Guard(() => Json(new FlowExecutionProtocol(coordinator).Start(Element(body), Owner), 201));
    [HttpPost("executions/{id:guid}/invoke")]
    public IActionResult Invoke(Guid id,[ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) =>
        Guard(() => Json(new FlowExecutionProtocol(coordinator).Invoke(id, Session, Owner, Element(body))));
    [HttpDelete("executions/{id:guid}")]
    public IActionResult Cancel(Guid id) => Guard(() => Json(coordinator.Cancel(id, Session, Owner)));
    [HttpGet("executions/{id:guid}/next")]
    public IActionResult Next(Guid id) => Guard(() => Json(coordinator.Next(id, Session, Owner)));
    [HttpPost("executions/{id:guid}/result")]
    public IActionResult Result(Guid id, [ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) =>
        Guard(() => Json(coordinator.Result(id, Session, Owner, FlowExecutionProtocol.ParseResult(Element(body)))));

    [HttpPost("executions/{id:guid}/results")]
    public IActionResult Results(Guid id, [ModelBinder(BinderType = typeof(FlowJsonBodyBinder))] JObject body) =>
        Guard(() => Json(new FlowExecutionProtocol(coordinator).Results(id, Session, Owner, Element(body))));

    // Explicit System.Text.Json output preserves the Flow contract despite Adam's MVC Newtonsoft defaults.
    private static ContentResult Json(object value, int status = 200) => new()
    {
        Content = JsonSerializer.Serialize(value, ContractSchemas.JsonOptions),
        ContentType = "application/json; charset=utf-8", StatusCode = status
    };
    private static JsonElement Element(JObject body)
    {
        using var document = JsonDocument.Parse(body.ToString(Newtonsoft.Json.Formatting.None));
        return document.RootElement.Clone();
    }
    private static JsonElement Body(JObject body, string[] required, string[]? optional = null) =>
        FlowExecutionProtocol.Body(Element(body), required, optional);
    private static IActionResult Guard(Func<IActionResult> action)
    {
        try { return action(); }
        catch (ProtocolException error) { return Json(new { code = error.Code, message = error.Message }, error.Status); }
        catch (ContractException error) { return Json(new { errors = error.Diagnostics }, 400); }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException)
        { return Json(new { code = "invalid_request", message = error.Message }, 400); }
    }
}
