using System.Text.Json;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Hosting;

/// <summary>Shared semantic request boundary for HTTP and message transports.</summary>
public sealed class FlowExecutionProtocol(Orchestrator coordinator)
{
    public object OpenSession(JsonElement body, string owner, PhaseTimings? timing = null)
    {
        var value = Body(body, ["browserCatalog", "browserCodecs"]);
        timing?.Mark("sessionBodyMs");
        var nodes = ContractSchemas.Parse<NodeCatalog>("catalog", value.GetProperty("browserCatalog").GetRawText());
        timing?.Mark("sessionParseNodesMs");
        var codecs = ContractSchemas.Parse<CodecCatalog>("codecs", value.GetProperty("browserCodecs").GetRawText());
        timing?.Mark("sessionParseCodecsMs");
        var sessionId = coordinator.CreateSession(owner, nodes, codecs, timing: timing);
        return new { sessionId, leaseSeconds = Orchestrator.Lease.TotalSeconds };
    }

    public ExecutionSnapshot Start(JsonElement body, string owner)
    {
        var value = Body(body, ["flow"], ["sessionId", "inputs", "bundle", "profiling"]);
        var flow = ContractSchemas.Parse<FlowDocument>("flow", value.GetProperty("flow").GetRawText());
        var session = value.TryGetProperty("sessionId", out var id) ? id.GetString() : null;
        Dictionary<string,JsonElement>? inputs = null;
        if (value.TryGetProperty("inputs", out var supplied))
        {
            if (supplied.ValueKind != JsonValueKind.Object) throw new ProtocolException(400, "schema", "Inputs must be a named object.");
            inputs = supplied.Deserialize<Dictionary<string,JsonElement>>(ContractSchemas.JsonOptions);
        }
        var bundle = value.TryGetProperty("bundle", out var suppliedBundle)
            ? ContractSchemas.Parse<GraphBundle>("bundle", suppliedBundle.GetRawText()) : null;
        var profiling = value.TryGetProperty("profiling", out var profile) && profile.ValueKind == JsonValueKind.True;
        if (value.TryGetProperty("profiling", out profile) && profile.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new ProtocolException(400, "schema", "Profiling must be a boolean.");
        return coordinator.Start(flow, session, owner, inputs, bundle, profiling, allowUnknownInputs: true);
    }

    public InvocationInfo Invoke(Guid id, string? session, string owner, JsonElement body)
    {
        var value = Body(body, ["segmentId", "attemptId", "reference", "inputs"], ["callKey"]);
        if (value.GetProperty("segmentId").ValueKind != JsonValueKind.String || value.GetProperty("attemptId").ValueKind != JsonValueKind.String || value.GetProperty("inputs").ValueKind != JsonValueKind.Object)
            throw new ProtocolException(400, "schema", "Invalid graph call shape.");
        if (value.TryGetProperty("callKey", out var key) && key.ValueKind != JsonValueKind.String)
            throw new ProtocolException(400, "schema", "Invalid call key.");
        return coordinator.Invoke(id, session, owner, value.Deserialize<GraphCall>(ContractSchemas.JsonOptions)!);
    }

    public BrowserWork Results(Guid id, string? session, string owner, JsonElement body)
    {
        var value = Body(body, ["results"]);
        var items = value.GetProperty("results");
        if (items.ValueKind != JsonValueKind.Array || items.GetArrayLength() is < 1 or > 256)
            throw new ProtocolException(400, "schema", "Expected 1 to 256 results.");
        var results = new List<BrowserResultItem>();
        foreach (var item in items.EnumerateArray())
        {
            var entry = Body(item, ["executionId", "result"]);
            if (entry.GetProperty("executionId").ValueKind != JsonValueKind.String || !entry.GetProperty("executionId").TryGetGuid(out var executionId))
                throw new ProtocolException(400, "schema", "Invalid result target.");
            results.Add(new(executionId, ParseResult(entry.GetProperty("result"))));
        }
        return coordinator.Results(id, session, owner, results.ToArray());
    }

    public static BrowserResult ParseResult(JsonElement body)
    {
        var value = Body(body, ["segmentId", "attemptId", "wires"], ["error", "outputs"]);
        if (value.GetProperty("segmentId").ValueKind != JsonValueKind.String || value.GetProperty("attemptId").ValueKind != JsonValueKind.String || value.GetProperty("wires").ValueKind != JsonValueKind.Object)
            throw new ProtocolException(400, "schema", "Invalid result shape.");
        var result = value.Deserialize<BrowserResult>(ContractSchemas.JsonOptions)!;
        if (result.Wires.Values.Any(wire => wire is null) || (result.Error is {} error && (error.Code is null || error.Message is null)))
            throw new ProtocolException(400, "schema", "Invalid result values.");
        return result;
    }

    public static JsonElement Body(JsonElement value, string[] required, string[]? optional = null)
    {
        if (value.ValueKind != JsonValueKind.Object || required.Any(key => !value.TryGetProperty(key, out _)) ||
            value.EnumerateObject().Any(property => !required.Contains(property.Name) && !(optional ?? []).Contains(property.Name)) ||
            value.EnumerateObject().Select(property => property.Name).Distinct(StringComparer.Ordinal).Count() != value.EnumerateObject().Count())
            throw new ProtocolException(400, "schema", "Unexpected request shape.");
        return value;
    }
}
