using System.Security.Cryptography;
using System.Text.Json;
using Flow.Contracts;

namespace Flow.Api;

public static class ExecutionRoutes
{
    private const string Cookie="flow-browser";
    public static void MapExecutionRoutes(this WebApplication app)
    {
        app.MapPost("/api/sessions",(JsonElement body,HttpContext http,Orchestrator coordinator)=>Guard(()=>
        {
            Shape(body,["browserCatalog","browserCodecs"],[]);
            var nodes=ContractSchemas.Parse<NodeCatalog>("catalog",body.GetProperty("browserCatalog").GetRawText());
            var codecs=ContractSchemas.Parse<CodecCatalog>("codecs",body.GetProperty("browserCodecs").GetRawText());
            var owner=http.Request.Cookies[Cookie];
            if(string.IsNullOrEmpty(owner))
            {
                owner=Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
                http.Response.Cookies.Append(Cookie,owner,new CookieOptions{HttpOnly=true,SameSite=SameSiteMode.Strict,Secure=http.Request.IsHttps,Path="/",IsEssential=true});
            }
            var id=coordinator.CreateSession(owner,nodes,codecs);
            return Results.Json(new {sessionId=id,leaseSeconds=Orchestrator.Lease.TotalSeconds},statusCode:201);
        }));
        app.MapDelete("/api/sessions/{id}",(string id,HttpContext http,Orchestrator coordinator)=>Guard(()=>
        {
            coordinator.CloseSession(id,http.Request.Cookies[Cookie]);return Results.NoContent();
        }));
        app.MapPost("/api/executions",(JsonElement body,HttpContext http,Orchestrator coordinator)=>Guard(()=>
        {
            Shape(body,["flow"],["sessionId"]);
            var flow=ContractSchemas.Parse<FlowDocument>("flow",body.GetProperty("flow").GetRawText());
            var sessionId=body.TryGetProperty("sessionId",out var session)?session.GetString():null;
            return Results.Json(coordinator.Start(flow,sessionId,http.Request.Cookies[Cookie]),ContractSchemas.JsonOptions,statusCode:201);
        },starting:true));
        app.MapGet("/api/executions/{id:guid}/next",(Guid id,HttpContext http,Orchestrator coordinator)=>Guard(()=>
            Results.Json(coordinator.Next(id,http.Request.Headers["X-Flow-Session"].FirstOrDefault(),http.Request.Cookies[Cookie]),ContractSchemas.JsonOptions)));
        app.MapPost("/api/executions/{id:guid}/result",(Guid id,JsonElement body,HttpContext http,Orchestrator coordinator)=>Guard(()=>
        {
            Shape(body,["segmentId","attemptId","wires"],["error"]);
            if(body.GetProperty("segmentId").ValueKind!=JsonValueKind.String || body.GetProperty("attemptId").ValueKind!=JsonValueKind.String || body.GetProperty("wires").ValueKind!=JsonValueKind.Object)
                throw new ProtocolException(400,"schema","Invalid segment result shape.");
            var result=body.Deserialize<BrowserResult>(ContractSchemas.JsonOptions)!;
            if(result.Wires.Values.Any(value=>value is null) || (result.Error is {} error && (error.Code is null || error.Message is null)))
                throw new ProtocolException(400,"schema","Invalid result values.");
            return Results.Json(coordinator.Result(id,http.Request.Headers["X-Flow-Session"].FirstOrDefault(),http.Request.Cookies[Cookie],result),ContractSchemas.JsonOptions);
        }));
    }
    private static void Shape(JsonElement body,string[] required,string[] optional)
    {
        if(body.ValueKind!=JsonValueKind.Object || required.Any(key=>!body.TryGetProperty(key,out _)) ||
           body.EnumerateObject().Any(property=>!required.Contains(property.Name)&&!optional.Contains(property.Name)) ||
           body.EnumerateObject().Select(property=>property.Name).Distinct().Count()!=body.EnumerateObject().Count())
            throw new ProtocolException(400,"schema","Unexpected request shape.");
    }
    private static IResult Guard(Func<IResult> action,bool starting=false)
    {
        try {return action();}
        catch(ProtocolException error) {return Results.Json(new {state=starting?"rejected":null,error.Code,error.Message},statusCode:error.Status);}
        catch(ContractException error) {return Results.BadRequest(new {state=starting?"rejected":null,errors=error.Diagnostics});}
        catch(Exception error) when(error is JsonException or InvalidOperationException or ArgumentException)
        {return Results.BadRequest(new {state=starting?"rejected":null,code="invalid_request",error.Message});}
    }
}
