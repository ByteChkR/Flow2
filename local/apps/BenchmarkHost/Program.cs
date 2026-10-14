using Adam.Flow2.Contracts;
using Adam.Flow2.AspNetCore;
using Adam.Flow2.Hosting;
using Adam.Flow2.Runtime;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
// Loopback-only development host. Authentication and tenant isolation belong to the consuming application.
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("FLOW2_TEST_HOST_URL") ?? "http://127.0.0.1:5191");
builder.Services.AddControllers().AddNewtonsoftJson();
builder.Services.AddSingleton<IFlowRuntimeFactory, StandardFlowRegistry>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<Orchestrator>();
var app = builder.Build();
app.MapControllers();
app.MapGet("/flow2/test/optimizations", () => FlowOptimizations.Effective);
await app.RunAsync();

[Route("flow2")]
public sealed class BenchmarkController(IFlowRuntimeFactory factory, Orchestrator coordinator) : FlowControllerBase(factory, coordinator)
{
    protected override string Owner => "local-package-benchmark";
}
