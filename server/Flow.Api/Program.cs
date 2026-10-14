using Flow.Api;
using Flow.Nodes.Server;

var builder = WebApplication.CreateBuilder(args);
// Build definitions from the runtime metadata once during server startup.
var nodes = new ContactDemo();
Orchestrator.RegisterInput(nodes);
builder.Services.AddSingleton(nodes.Registry);
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddSingleton<Orchestrator>();
builder.Services.AddHostedService<SessionReaper>();
var app = builder.Build();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/catalog", () => Results.Json(nodes.Registry.Catalog, Flow.Contracts.ContractSchemas.JsonOptions));
app.MapGet("/api/types", () => Results.Json(nodes.Registry.Types, Flow.Contracts.ContractSchemas.JsonOptions));
app.MapGet("/api/codecs", () => Results.Json(DemoCodecs.Create(nodes.Registry.Types).Catalog, Flow.Contracts.ContractSchemas.JsonOptions));
app.MapPost("/api/demo/transport/contact", Flow.Api.DemoTransport.Run);
app.MapExecutionRoutes();
app.Run();

public partial class Program;
