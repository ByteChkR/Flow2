using System.Text.Json;
using Adam.Flow2.Runtime;
using Flow.Contracts;
using Jint;

namespace Flow.Runtime.Jint;

public sealed record CompiledSegmentResult(Guid ExecutionId, string SegmentId, Dictionary<string,string> Wires, string GeneratedJavaScript);

/// <summary>Execution-local native storage. Plans are recompiled against the actual server registry.</summary>
public sealed class CompiledExecution : IDisposable
{
    private readonly ExecutionPlan plan;
    private readonly NodeRegistry registry;
    private readonly CodecRegistry codecs;
    private readonly Dictionary<string, IReadOnlyDictionary<string, object>> values = new();
    private readonly HashSet<string> completed = new();
    private bool failed;
    public Guid ExecutionId { get; }
    public ExecutionPlan Plan => JsonSerializer.Deserialize<ExecutionPlan>(JsonSerializer.Serialize(plan, ContractSchemas.JsonOptions), ContractSchemas.JsonOptions)!;

    public CompiledExecution(Guid executionId, FlowDocument flow, NodeCatalog browserCatalog, CodecCatalog browserCodecs,
        NodeRegistry registry, CodecRegistry codecs)
    {
        ExecutionId = executionId;
        this.registry = registry; this.codecs = codecs;
        var catalogErrors = ContractSchemas.Validate("catalog", JsonSerializer.SerializeToElement(browserCatalog, ContractSchemas.JsonOptions));
        if (catalogErrors.Count != 0) throw new ContractException(catalogErrors);
        if (browserCatalog.Nodes.Select(node => (node.Type, node.Version)).Distinct().Count() != browserCatalog.Nodes.Length)
            throw new InvalidOperationException("Duplicate browser node definition.");
        // Remote declarations cannot grant permission to invoke a server implementation.
        if (browserCatalog.Nodes.Any(node => node.Environments.Any(environment => environment != "browser")))
            throw new InvalidOperationException("Remote catalog may declare browser nodes only.");
        var definitions = registry.Catalog.Nodes.ToDictionary(node => (node.Type, node.Version));
        foreach (var remote in browserCatalog.Nodes)
        {
            if (definitions.TryGetValue((remote.Type, remote.Version), out var local))
            {
                if (!TransportContracts.Equivalent(local.Inputs, remote.Inputs) || !TransportContracts.Equivalent(local.Outputs, remote.Outputs))
                    throw new InvalidOperationException("Conflicting node contracts.");
                if (local.Config is not null && remote.Config is not null && !NodeAuthoringContracts.EquivalentConfig(local.Config, remote.Config))
                    throw new InvalidOperationException("Conflicting node configuration.");
                definitions[(remote.Type, remote.Version)] = local with { Environments = ["server", "browser"], Config = local.Config ?? remote.Config };
            }
            else definitions.Add((remote.Type, remote.Version), remote);
        }
        plan = FlowCompiler.Compile(flow, new(1, definitions.Values.ToArray()), registry.Types, codecs.Catalog, browserCodecs);
        plan = Plan; // Detach mutable input documents from the execution.
        // Recheck CLR adapter compatibility for all native local edges before any execution.
        foreach (var edge in plan.Connections.Where(edge => !edge.Boundary))
        {
            var source = plan.Nodes.Single(node => node.Id == edge.Source.NodeId);
            var target = plan.Nodes.Single(node => node.Id == edge.Target.NodeId);
            if (source.Environment != "server") continue;
            if (!registry.IsAssignable(registry.Resolve(source.Type, source.TypeVersion).Definition.Outputs[edge.Source.Port],
                registry.Resolve(target.Type, target.TypeVersion).Definition.Inputs[edge.Target.Port]))
                throw new InvalidOperationException("Incompatible native CLR adapters.");
        }
    }

    public CompiledSegmentResult Execute(string segmentId, IReadOnlyDictionary<string,string> wires,
        CancellationToken cancellationToken = default, int maxStatements = 10_000, TimeSpan? timeout = null, Action<NodeTrace>? onNode = null)
    {
        string? currentNode = null;
        try
        {
            ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxStatements);
            if (maxStatements == int.MaxValue) throw new ArgumentOutOfRangeException(nameof(maxStatements));
            if (failed) throw new InvalidOperationException("Execution already failed or disposed.");
            var segment = plan.Segments.SingleOrDefault(segment => segment.Id == segmentId);
            if (segment is null || segment.Environment != "server" || completed.Contains(segmentId))
                throw new InvalidOperationException("Unknown, wrong-environment or repeated segment.");
            var expected = segment.Incoming.Where(index => plan.Connections[index].Boundary).Select(index => index.ToString()).ToHashSet();
            if (!expected.SetEquals(wires.Keys)) throw new InvalidOperationException("Boundary inputs do not match the plan.");
            var decoded = new Dictionary<int, object>();
            foreach (var index in segment.Incoming)
            {
                var edge = plan.Connections[index]; currentNode = edge.Target.NodeId;
                if (edge.Boundary)
                {
                    var value = codecs.Decode(edge.Codec!, wires[index.ToString()], edge.TargetType);
                    var target = plan.Nodes.Single(node => node.Id == edge.Target.NodeId);
                    registry.Validate(registry.Resolve(target.Type, target.TypeVersion).Definition.Inputs[edge.Target.Port], value);
                    decoded.Add(index, value);
                }
                else if (!values.ContainsKey(edge.Source.NodeId)) throw new InvalidOperationException("Local dependency has not executed.");
            }
            var next = 0; var complete = false;
            currentNode = segment.NodeIds.FirstOrDefault();
            // No native node values are exposed to JS. Host calls carry only validated plan indexes.
            var engine = new Engine(options => options.MaxStatements(maxStatements).TimeoutInterval(timeout ?? TimeSpan.FromSeconds(2))
                .LimitMemory(16_000_000).LimitRecursion(64).CancellationToken(cancellationToken));
            engine.SetValue("invokeNode", (Delegate)new Action<int>(index =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (index != next++) throw new InvalidOperationException("Invalid invocation order.");
                var node = plan.Nodes.Single(node => node.Id == segment.NodeIds[index]); currentNode = node.Id;
                var implementation = registry.Resolve(node.Type, node.TypeVersion);
                var started = System.Diagnostics.Stopwatch.GetTimestamp();
                onNode?.Invoke(new(node.Id, "running"));
                try
                {
                var inputs = new Dictionary<string,object>();
                foreach (var edge in plan.Connections.Where(edge => edge.Target.NodeId == node.Id))
                {
                    if (edge.Boundary) inputs.Add(edge.Target.Port, decoded[edge.Index]);
                    else if (values[edge.Source.NodeId].TryGetValue(edge.Source.Port, out var value)) inputs.Add(edge.Target.Port, value);
                }
                registry.ValidatePorts(implementation.Definition.Inputs, inputs);
                var outputs = implementation.ExecuteConfigured is { } configured
                    ? configured(inputs, node.Config) : implementation.Execute(inputs);
                registry.ValidatePorts(implementation.Definition.Outputs, outputs);
                values.Add(node.Id, outputs);
                onNode?.Invoke(new(node.Id, "completed", System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds));
                }
                catch(Exception error)
                {
                    onNode?.Invoke(new(node.Id, "failed", System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds, error.Message));
                    throw;
                }
            }));
            engine.SetValue("completeSegment", (Delegate)new Action(() =>
            {
                if (next != segment.NodeIds.Count) throw new InvalidOperationException("Incomplete segment.");
                complete = true;
            }));
            var script = FlowCompiler.Generate(segment);
            // A plain JS wrapper exposes only the two delegates, not a CLR host object.
            engine.Execute("const host = Object.freeze({invokeNode: invokeNode, completeSegment: completeSegment});\n" + script);
            if (!complete) throw new InvalidOperationException("Segment did not complete.");
            var outputs = new Dictionary<string,string>();
            foreach (var index in segment.Outgoing)
            {
                var edge = plan.Connections[index];
                if (!edge.Boundary) continue;
                currentNode = edge.Source.NodeId;
                outputs.Add(index.ToString(), codecs.Encode(edge.Codec!, values[edge.Source.NodeId][edge.Source.Port]));
            }
            completed.Add(segment.Id);
            return new(ExecutionId, segment.Id, outputs, script);
        }
        catch (Exception error) { Dispose(); throw new SegmentExecutionException(ExecutionId, currentNode, error); }
    }
    public void Dispose() { values.Clear(); failed = true; }
}
