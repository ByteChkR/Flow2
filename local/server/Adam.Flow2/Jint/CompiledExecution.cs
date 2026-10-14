using System.Text.Json;
using System.Collections.Concurrent;
using Adam.Flow2.Runtime;
using Adam.Flow2.Contracts;
using Jint;

namespace Adam.Flow2.Jint;

public sealed record CompiledSegmentResult(Guid ExecutionId, string SegmentId, Dictionary<string,string> Wires, string GeneratedJavaScript, Dictionary<string,JsonElement> Outputs)
{
    [System.Text.Json.Serialization.JsonIgnore]
    public Dictionary<string,object> NativeOutputs { get; init; } = new();
}

/// <summary>Execution-local native storage with a validated plan and fresh native bindings.</summary>
public sealed class CompiledExecution : IDisposable
{
    private readonly ExecutionPlan plan;
    private readonly Dictionary<string,PlannedNode> nodesById;
    private readonly Dictionary<string,ExecutionSegment> segmentsById;
    private readonly Dictionary<string,PlannedConnection[]> inputEdges;
    private readonly NodeRegistry registry;
    private readonly CodecRegistry codecs;
    private readonly ConcurrentDictionary<string, IReadOnlyDictionary<string, object>> values = new();
    private readonly ConcurrentDictionary<string, byte> started = new();
    private readonly Dictionary<string,object> flowInputs;
    private volatile bool failed;
    public Guid ExecutionId { get; }
    public ExecutionPlan Plan => JsonSerializer.Deserialize<ExecutionPlan>(JsonSerializer.Serialize(plan, ContractSchemas.JsonOptions), ContractSchemas.JsonOptions)!;

    public CompiledExecution(Guid executionId, FlowDocument flow, NodeCatalog browserCatalog, CodecCatalog browserCodecs,
        NodeRegistry registry, CodecRegistry codecs, bool allowUnknownInputs, IReadOnlyDictionary<string,JsonElement>? inputs = null, IReadOnlyDictionary<string,object>? nativeInputs = null)
        : this(executionId, flow, browserCatalog, browserCodecs, registry, codecs, inputs, nativeInputs, null, allowUnknownInputs) { }

    internal CompiledExecution(Guid executionId, FlowDocument flow, NodeCatalog browserCatalog, CodecCatalog browserCodecs,
        NodeRegistry registry, CodecRegistry codecs, IReadOnlyDictionary<string,JsonElement>? inputs,
        IReadOnlyDictionary<string,object>? nativeInputs, ExecutionPlan? preparedPlan, bool allowUnknownInputs)
    {
        ExecutionId = executionId;
        this.registry = registry; this.codecs = codecs;
        if (preparedPlan is not null)
        {
            // Only the coordinator can supply a plan prepared against its factory and capabilities.
            // Bind fresh executors; cached plans never contain scopes, inputs, or runtime state.
            ValueRuntimeNodes.Prepare(registry, flow);
            registry.PrepareQueries(flow, codecs);
        }
        plan = preparedPlan ?? CompilePlan(flow,browserCatalog,browserCodecs,registry,codecs);
        if (nativeInputs is not null)
        {
            if (inputs is not null) throw new InvalidOperationException("Supply either native or wire flow inputs.");
            registry.RequireNativeValues(plan.Interface.Inputs, nativeInputs);
            flowInputs = new(nativeInputs);
        }
        else
        {
            inputs ??= new Dictionary<string,JsonElement>();
            FlowInterfaces.RequireValues(plan.Interface.Inputs, inputs, registry: new(registry.Types), allowUnknown: allowUnknownInputs);
            flowInputs = plan.Interface.Inputs.Where(p => inputs.ContainsKey(p.Name)).ToDictionary(p => p.Name, p =>
            {
                // Public parameters remain part of the interface even when their nodes are unused.
                var node = flow.Nodes.Single(n => n.Id == p.NodeId);
                var native = node.Environment == "server" ? registry.Resolve(node.Type, node.TypeVersion, nodeId: node.Id).Definition.Outputs["value"].ClrType : null;
                return FlowValues.Decode(p.Type, inputs[p.Name], native);
            });
        }
        plan = Plan; // Detach mutable input documents from the execution.
        nodesById=FlowOptimizations.RuntimeIndexes?plan.Nodes.ToDictionary(node=>node.Id):new();
        segmentsById=FlowOptimizations.RuntimeIndexes?plan.Segments.ToDictionary(segment=>segment.Id):new();
        inputEdges=FlowOptimizations.RuntimeIndexes?plan.Connections.Where(edge=>edge.Kind!="control").GroupBy(edge=>edge.Target.NodeId).ToDictionary(group=>group.Key,group=>group.ToArray()):new();
        // Recheck CLR adapter compatibility for all native local edges before any execution.
        foreach (var edge in plan.Connections.Where(edge => !edge.Boundary && edge.Kind!="control" && plan.Nodes.Any(node=>node.Id==edge.Target.NodeId)))
        {
            var source = plan.Nodes.Single(node => node.Id == edge.Source.NodeId);
            var target = plan.Nodes.Single(node => node.Id == edge.Target.NodeId);
            if (source.Environment != "server") continue;
            if (!registry.IsAssignable(registry.Resolve(source.Type, source.TypeVersion, nodeId: source.Id).Definition.Outputs[edge.Source.Port],
                registry.Resolve(target.Type, target.TypeVersion, nodeId: target.Id).Definition.Inputs[edge.Target.Port]))
                throw new InvalidOperationException("Incompatible native CLR adapters.");
        }
    }

    public static ExecutionPlan CompilePlan(FlowDocument flow,NodeCatalog browserCatalog,CodecCatalog browserCodecs,NodeRegistry registry,CodecRegistry codecs)
    {
        ValueRuntimeNodes.Prepare(registry,flow);
        registry.PrepareQueries(flow,codecs);
        var catalogErrors = ContractSchemas.Validate("catalog", JsonSerializer.SerializeToElement(browserCatalog, ContractSchemas.JsonOptions));
        if (catalogErrors.Count != 0) throw new ContractException(catalogErrors);
        if (browserCatalog.Nodes.Select(node => (node.Type, node.Version, node.NodeId)).Distinct().Count() != browserCatalog.Nodes.Length)
            throw new InvalidOperationException("Duplicate browser node definition.");
        // Remote declarations cannot grant permission to invoke a server implementation.
        if (browserCatalog.Nodes.Any(node => node.Environments.Any(environment => environment != "browser")))
            throw new InvalidOperationException("Remote catalog may declare browser nodes only.");
        var definitions = registry.Catalog.Nodes.ToDictionary(node => (node.Type, node.Version, node.NodeId));
        foreach (var remote in browserCatalog.Nodes)
        {
            if (definitions.TryGetValue((remote.Type, remote.Version, remote.NodeId), out var local))
            {
                if (!TransportContracts.Equivalent(local.Inputs, remote.Inputs) || !TransportContracts.Equivalent(local.Outputs, remote.Outputs))
                    throw new InvalidOperationException("Conflicting node contracts.");
                if(!TransportContracts.Equivalent(local.Value,remote.Value))throw new InvalidOperationException("Conflicting value bindings.");
                if(!TransportContracts.Equivalent(local.Graph,remote.Graph))throw new InvalidOperationException("Conflicting graph bindings.");
                if(!TransportContracts.Equivalent(local.Query,remote.Query)||!TransportContracts.Equivalent(local.Ef,remote.Ef)||!TransportContracts.Equivalent(local.Ui,remote.Ui))throw new InvalidOperationException("Conflicting node bindings.");
                if (local.FlowPort != remote.FlowPort) throw new InvalidOperationException("Conflicting flow ports.");
                if (local.Control != remote.Control) throw new InvalidOperationException("Conflicting control ports.");
                if (local.Config is not null && remote.Config is not null && !NodeAuthoringContracts.EquivalentConfig(local.Config, remote.Config))
                    throw new InvalidOperationException("Conflicting node configuration.");
                definitions[(remote.Type, remote.Version, remote.NodeId)] = local with { Environments = ["server", "browser"], Config = local.Config ?? remote.Config };
            }
            else definitions.Add((remote.Type, remote.Version, remote.NodeId), remote);
        }
        var result = FlowCompiler.Compile(flow, new(1, definitions.Values.ToArray()), registry.Types, codecs.Catalog, browserCodecs);
        foreach (var (node, index) in flow.Nodes.Select((node, index) => (node, index)).Where(item => item.node.Environment == "server"))
        {
            try { registry.Resolve(node.Type, node.TypeVersion, nodeId: node.Id).ValidateConfiguration?.Invoke(node.Config); }
            catch (ContractException error)
            { throw new ContractException(error.Diagnostics.Select(diagnostic => diagnostic with { Path = $"/flow/nodes/{index}/config" + diagnostic.Path }).ToArray()); }
        }
        return result;
    }

    public CompiledSegmentResult Execute(string segmentId, IReadOnlyDictionary<string,string> wires,
        CancellationToken cancellationToken = default, int maxStatements = 10_000, TimeSpan? timeout = null, Action<NodeTrace>? onNode = null, Action<NodeLog>? onLog = null)
        => ExecuteAsync(segmentId, wires, cancellationToken, maxStatements, timeout, onNode, onLog).GetAwaiter().GetResult();

    public async Task<CompiledSegmentResult> ExecuteAsync(string segmentId, IReadOnlyDictionary<string,string> wires,
        CancellationToken cancellationToken = default, int maxStatements = 10_000, TimeSpan? timeout = null, Action<NodeTrace>? onNode = null, Action<NodeLog>? onLog = null, Action<IReadOnlyDictionary<string,double>>? onProfile = null)
    {
        var profiling=onProfile is not null;
        var segmentStart=profiling?System.Diagnostics.Stopwatch.GetTimestamp():0;
        double decodeMs=0,scheduleMs=0,nodesMs=0,encodeMs=0;
        string? currentNode = null;
        var flowOutputs=new Dictionary<string,JsonElement>();
        var nativeOutputs=new Dictionary<string,object>();
        try
        {
            ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxStatements);
            if (maxStatements == int.MaxValue) throw new ArgumentOutOfRangeException(nameof(maxStatements));
            if (failed) throw new InvalidOperationException("Execution already failed or disposed.");
            var segment = (FlowOptimizations.RuntimeIndexes?segmentsById.GetValueOrDefault(segmentId):plan.Segments.FirstOrDefault(s=>s.Id==segmentId));
            if (segment is null || segment.Environment != "server" || !started.TryAdd(segmentId,0))
                throw new InvalidOperationException("Unknown, wrong-environment or repeated segment.");
            var expected = segment.Incoming.Where(index => plan.Connections[index].Boundary).Select(index => index.ToString()).ToHashSet();
            if (!expected.SetEquals(wires.Keys)) throw new InvalidOperationException("Boundary inputs do not match the plan.");
            var decoded = new Dictionary<int, object>();
            foreach (var index in segment.Incoming)
            {
                var edge = plan.Connections[index]; if(edge.Kind=="control")continue; currentNode = edge.Target.NodeId;
                if (edge.Boundary)
                {
                    var value = codecs.Decode(edge.Codec!, wires[index.ToString()], edge.TargetType);
                    var target = (FlowOptimizations.RuntimeIndexes?nodesById[edge.Target.NodeId]:plan.Nodes.Single(n=>n.Id==edge.Target.NodeId));
                    if(value is not FlowAbsent)value=registry.Adapt(registry.Resolve(target.Type, target.TypeVersion, nodeId: target.Id).Definition.Inputs[edge.Target.Port], value);
                    decoded.Add(index, value);
                }
                else if (!values.ContainsKey(edge.Source.NodeId)) throw new InvalidOperationException("Local dependency has not executed.");
            }
            if(profiling)decodeMs=System.Diagnostics.Stopwatch.GetElapsedTime(segmentStart).TotalMilliseconds;
            var scheduleStart=profiling?System.Diagnostics.Stopwatch.GetTimestamp():0;
            var next = 0; var complete = false;
            currentNode = segment.NodeIds.FirstOrDefault();
            // No native node values are exposed to JS. Host calls carry only validated plan indexes.
            var engine = new Engine(options => options.MaxStatements(maxStatements).TimeoutInterval(timeout ?? TimeSpan.FromSeconds(2))
                .LimitMemory(16_000_000).LimitRecursion(64).CancellationToken(cancellationToken));
            var scheduled = new List<int>();
            engine.SetValue("invokeNode", (Delegate)new Action<int>(index =>
            {
                if (index != next++ || index >= segment.NodeIds.Count) throw new InvalidOperationException("Invalid invocation order.");
                scheduled.Add(index);
            }));
            engine.SetValue("completeSegment", (Delegate)new Action(() =>
            {
                if (next != segment.NodeIds.Count) throw new InvalidOperationException("Incomplete segment.");
                complete = true;
            }));
            var script = FlowCompiler.Generate(segment);
            engine.Execute("const host = Object.freeze({invokeNode: invokeNode, completeSegment: completeSegment});\n" + script);
            if (!complete) throw new InvalidOperationException("Segment did not complete scheduling.");
            if(profiling)scheduleMs=System.Diagnostics.Stopwatch.GetElapsedTime(scheduleStart).TotalMilliseconds;
            foreach (var index in scheduled)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var started = System.Diagnostics.Stopwatch.GetTimestamp();
                var node = (FlowOptimizations.RuntimeIndexes?nodesById[segment.NodeIds[index]]:plan.Nodes.Single(n=>n.Id==segment.NodeIds[index])); currentNode = node.Id;
                var implementation = registry.Resolve(node.Type, node.TypeVersion, nodeId: node.Id);
                double implementationMs=0;int? inputItems=null;
                Dictionary<string,double>? Profile(double elapsed)
                {
                    if(!profiling)return null;
                    var profile=new Dictionary<string,double>{{"startMs",System.Diagnostics.Stopwatch.GetElapsedTime(0,started).TotalMilliseconds},{"offsetMs",System.Diagnostics.Stopwatch.GetElapsedTime(segmentStart,started).TotalMilliseconds},{"implementationMs",implementationMs},{"overheadMs",Math.Max(0,elapsed-implementationMs)}};
                    if(inputItems is {} count)profile["inputItems"]=count;
                    return profile;
                }
                onNode?.Invoke(new(node.Id, "running"));
                try
                {
                var inputs = new Dictionary<string,object>();
                foreach (var edge in (FlowOptimizations.RuntimeIndexes?inputEdges.GetValueOrDefault(node.Id,[]):plan.Connections.Where(e=>e.Kind!="control"&&e.Target.NodeId==node.Id).ToArray()))
                {
                    if (edge.Boundary) {if(decoded[edge.Index] is not FlowAbsent)inputs.Add(edge.Target.Port, decoded[edge.Index]);}
                    else if (values[edge.Source.NodeId].TryGetValue(edge.Source.Port, out var value)) inputs.Add(edge.Target.Port, registry.Adapt(implementation.Definition.Inputs[edge.Target.Port],value));
                }
                foreach(var (port,literal) in node.InlineInputs??[])
                    if(literal.Enabled)inputs.Add(port,FlowValues.Decode(node.Inputs[port],literal.Value,implementation.Definition.Inputs[port].ClrType));
                if(profiling)
                {
                    var lists=new[]{"items","left","right","entries","dictionary"}.Where(inputs.ContainsKey).Select(port=>inputs[port]).OfType<System.Collections.ICollection>().ToArray();
                    if(lists.Length>0)inputItems=lists.Sum(list=>list.Count);
                }
                registry.ValidatePorts(implementation.Definition.Inputs, inputs);
                IReadOnlyDictionary<string,object> nodeOutputs;
                var implementationStart=profiling?System.Diagnostics.Stopwatch.GetTimestamp():0;
                try {
                if(node.FlowPort=="input")
                {
                    var parameter=plan.Interface.Inputs.Single(p=>p.NodeId==node.Id);
                    nodeOutputs=flowInputs.TryGetValue(parameter.Name,out var value)?new Dictionary<string,object>{{"value",value}}:new Dictionary<string,object>();
                }
                else if(node.FlowPort=="output")
                {
                    var parameter=plan.Interface.Outputs.Single(p=>p.NodeId==node.Id);
                    if (inputs.TryGetValue("value",out var value))
                    {
                        nativeOutputs[parameter.Name] = value;
                        if (TransportContracts.IsTransportable(parameter.Type)) flowOutputs[parameter.Name] = FlowValues.Encode(parameter.Type,value);
                    }
                    nodeOutputs=new Dictionary<string,object>();
                }
                else nodeOutputs = implementation.ExecuteWithContextAsync is {} contextual
                    ? await contextual(inputs,node.Config,cancellationToken,new(node.Id,new FlowLogger((level,message)=>
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        onLog?.Invoke(new(node.Id,level,message));
                    })))
                    : implementation.ExecuteAsync is { } asynchronous
                    ? await asynchronous(inputs, node.Config, cancellationToken)
                    : implementation.ExecuteConfigured is { } configured
                    ? configured(inputs, node.Config) : implementation.Execute(inputs);
                } finally {if(profiling)implementationMs=System.Diagnostics.Stopwatch.GetElapsedTime(implementationStart).TotalMilliseconds;}
                registry.ValidatePorts(implementation.Definition.Outputs, nodeOutputs);
                cancellationToken.ThrowIfCancellationRequested();
                if(failed)throw new OperationCanceledException("Execution stopped.");
                values[node.Id]=nodeOutputs;
                var elapsed=System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds;
                onNode?.Invoke(new(node.Id, "completed", elapsed, Profile:Profile(elapsed)));
                }
                catch(Exception error)
                {
                    var elapsed=System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds;
                    onNode?.Invoke(new(node.Id, "failed", elapsed, error.Message,Profile(elapsed)));
                    throw;
                }
                finally {if(profiling)nodesMs+=System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds;}
            }
            cancellationToken.ThrowIfCancellationRequested();
            var encodeStart=profiling?System.Diagnostics.Stopwatch.GetTimestamp():0;
            var outputs = new Dictionary<string,string>();
            foreach (var index in segment.Outgoing)
            {
                var edge = plan.Connections[index];
                if (!edge.Boundary) continue;
                currentNode = edge.Source.NodeId;
                outputs.Add(index.ToString(), codecs.Encode(edge.Codec!, values[edge.Source.NodeId].TryGetValue(edge.Source.Port,out var value)?value:FlowAbsent.Value));
            }

            if(profiling) {
                encodeMs=System.Diagnostics.Stopwatch.GetElapsedTime(encodeStart).TotalMilliseconds;
                onProfile!(new Dictionary<string,double>{{"decodeMs",decodeMs},{"scheduleMs",scheduleMs},{"nodesMs",nodesMs},{"encodeMs",encodeMs},{"totalMs",System.Diagnostics.Stopwatch.GetElapsedTime(segmentStart).TotalMilliseconds},{"inputBytes",wires.Values.Sum(value=>(double)System.Text.Encoding.UTF8.GetByteCount(value))},{"outputBytes",outputs.Values.Sum(value=>(double)System.Text.Encoding.UTF8.GetByteCount(value))}});
            }
            return new(ExecutionId, segment.Id, outputs, script, flowOutputs) { NativeOutputs = nativeOutputs };
        }
        catch (Exception error) { failed=true; throw new SegmentExecutionException(ExecutionId, currentNode, error); }
    }
    public void Dispose() { values.Clear(); flowInputs.Clear(); failed = true; }
}
