using System.Text;
using System.Text.Json;
using Adam.Flow2.Runtime;
using Jint;
using Flow.Contracts;

namespace Flow.Runtime.Jint;

public sealed record SegmentResult(Guid ExecutionId, JsonElement Value, string GeneratedJavaScript, string WireJson);

public sealed class SegmentExecutionException(Guid executionId, string? nodeId, Exception inner)
    : Exception($"Execution {executionId}, node {nodeId ?? "<segment>"}: {inner.Message}", inner)
{
    public Guid ExecutionId { get; } = executionId;
    public string? NodeId { get; } = nodeId;
    public string Code { get; } = inner is OperationCanceledException or global::Jint.Runtime.ExecutionCanceledException ? "cancelled"
        : inner is TimeoutException ? "timeout"
        : inner is global::Jint.Runtime.StatementsCountOverflowException or global::Jint.Runtime.MemoryLimitExceededException ? "limit" : "failed";
}

public sealed class ServerSegmentRunner(NodeRegistry registry, CodecRegistry codecs, CodecCatalog targetCodecs, int maxStatements = 10_000)
{
    // Deliberately accepts a plan, never source code supplied by a caller.
    public SegmentResult Execute(ServerPlan plan)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxStatements);
        if (maxStatements == int.MaxValue) throw new ArgumentOutOfRangeException(nameof(maxStatements));
        ServerPlanValidator.Validate(plan, registry, codecs, targetCodecs);
        var executionId = Guid.NewGuid();
        string? currentNode = null;
        using var store = new ExecutionValueStore();
        var script = Generate(plan);
        try
        {
            var engine = new Engine(options => options
                .MaxStatements(maxStatements)
                .TimeoutInterval(TimeSpan.FromSeconds(2))
                .LimitMemory(16_000_000)
                .LimitRecursion(64));
            // Only a delegate crosses the host boundary; no Contact, registry or store is exposed.
            engine.SetValue("invokeNode", (Delegate)new Func<int, string, string>((index, inputJson) =>
            {
                var step = plan.Steps[index];
                currentNode = step.Id;
                var node = registry.Resolve(step.Type, step.Version, step.Environment);
                var arguments = JsonSerializer.Deserialize<Dictionary<string, string>>(inputJson)
                    ?? throw new InvalidOperationException("Missing node inputs.");
                var inputs = new Dictionary<string, object>();
                foreach (var (port, binding) in step.Inputs)
                {
                    object value = binding is StringInput ? arguments[port] : store.Resolve(arguments[port]);
                    registry.Validate(node.Definition.Inputs[port], value);
                    inputs.Add(port, value);
                }
                var outputs = node.Execute(inputs);
                registry.ValidatePorts(node.Definition.Outputs, outputs);
                var handles = new Dictionary<string, string>();
                foreach (var (port, type) in node.Definition.Outputs)
                {
                    if (outputs.TryGetValue(port, out var value)) handles.Add(port, store.Add(value));
                }
                // Only opaque handle strings are serialized here, never node values.
                return JsonSerializer.Serialize(handles);
            }));
            var resultHandle = engine.Evaluate(script).AsString();
            currentNode = plan.Result.NodeId;
            var wireJson = codecs.Encode(plan.ResultCodec!, store.Resolve(resultHandle));
            var envelope = ContractSchemas.Parse<WireEnvelope>("envelope", wireJson);
            return new SegmentResult(executionId, envelope.Payload.Clone(), script, wireJson);
        }
        catch (Exception error)
        {
            throw new SegmentExecutionException(executionId, currentNode, error);
        }
    }

    private static string Generate(ServerPlan plan)
    {
        var script = new StringBuilder("'use strict';\n");
        var indexes = new Dictionary<string, int>();
        for (var index = 0; index < plan.Steps.Count; index++)
        {
            var step = plan.Steps[index];
            var inputs = step.Inputs.Select(pair =>
                $"[{JsonSerializer.Serialize(pair.Key)}]: {Expression(pair.Value, indexes)}");
            script.AppendLine($"const n{index} = JSON.parse(invokeNode({index}, JSON.stringify({{{string.Join(", ", inputs)}}}))); ");
            indexes.Add(step.Id, index);
        }
        script.Append(Expression(plan.Result, indexes)).Append(';');
        return script.ToString();
    }

    private static string Expression(InputBinding binding, Dictionary<string, int> indexes) => binding switch
    {
        StringInput literal => JsonSerializer.Serialize(literal.Value),
        OutputInput output => $"n{indexes[output.NodeId]}[{JsonSerializer.Serialize(output.Port)}]",
        _ => throw new InvalidOperationException("Unsupported binding.")
    };
}
