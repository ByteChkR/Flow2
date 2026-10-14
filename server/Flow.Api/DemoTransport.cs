using System.Text.Json;
using Flow.Contracts;
using Flow.Nodes.Server;
using Flow.Runtime.Jint;

namespace Flow.Api;

public static class DemoTransport
{
    // Fixed mock demonstration, not an imported flow or an interactive execution endpoint.
    public static IResult Run(JsonElement request)
    {
        try
        {
            if (request.ValueKind != JsonValueKind.Object || request.EnumerateObject().Count() != 2 ||
                !request.TryGetProperty("browserCodecs", out var capabilities) || !request.TryGetProperty("input", out var input))
                throw new ContractException([new("schema", "", "Expected browserCodecs and input.")]);
            var browser = ContractSchemas.Parse<CodecCatalog>("codecs", capabilities.GetRawText());
            if (browser.Environment != "browser") throw new ContractException([new("environment", "", "Expected browser codec capabilities.")]);
            var demo = new ContactDemo();
            var server = DemoCodecs.Create(demo.Registry.Types);
            var types = new TypeRegistry(demo.Registry.Types);
            var errors = TransportContracts.ValidateBoundary(new("string"), new("string"), DemoCodecs.String, browser, server.Catalog, types)
                .Concat(TransportContracts.ValidateBoundary(ContactDemo.DtoType.ContractType, ContactDemo.DtoType.ContractType,
                    DemoCodecs.Contact, server.Catalog, browser, types)).ToArray();
            if (errors.Length != 0) throw new ContractException(errors);
            var id = (string)server.Decode(DemoCodecs.String, input.GetRawText(), new("string"));
            var result = new ServerSegmentRunner(demo.Registry, server, browser).Execute(ContactDemo.Plan(id));
            return Results.Content(result.WireJson, "application/json");
        }
        catch (ContractException error) { return Results.BadRequest(new { errors = error.Diagnostics }); }
        catch (SegmentExecutionException error)
        {
            return Results.UnprocessableEntity(new { error.ExecutionId, error.NodeId, error.Message });
        }
    }
}
