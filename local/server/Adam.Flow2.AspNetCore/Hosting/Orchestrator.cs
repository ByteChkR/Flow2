using Adam.Flow2.Runtime;
using System.Security.Cryptography;
using System.Text.Json;
using Adam.Flow2.Contracts;
using Microsoft.Extensions.Hosting;
using Adam.Flow2.Jint;

namespace Adam.Flow2.Hosting;

public sealed class ProtocolException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}
// Server-authored receipt. Only trusted persistence code may supply this to Start;
// HTTP execution requests do not deserialize or accept this record.
public sealed record BundleValidation(string BundleHash, string RuntimeBasis, string? BrowserFingerprint);
public sealed record ExecutionFailure(string Code, string Message, string? NodeId, string? GraphId = null, Guid? ExecutionId = null);
public sealed class FlowExecutionException(ExecutionFailure failure) : Exception(failure.Message),INodeFailure { public ExecutionFailure Failure { get; } = failure; public string Code=>Failure.Code; }
public sealed record ExecutionSnapshot(Guid ExecutionId, string State, ExecutionFailure? Error, string[] CompletedSegments, ExecutionTrace[] Events, Dictionary<string,JsonElement> Outputs, bool ControlOutput, InvocationInfo[] Invocations);
public sealed record InvocationInfo(Guid ExecutionId,string GraphId,Guid? ParentInvocationId,string? CallNodeId,string State,ExecutionFailure? Error,string[] SkippedNodeIds,Dictionary<string,JsonElement> Outputs,string? CallKey=null,string? HybridEnvironment=null);
public sealed record InvocationWork(InvocationInfo Invocation,Dictionary<string,JsonElement> Inputs);
public sealed record GraphCall(string SegmentId,string AttemptId,GraphReference Reference,Dictionary<string,JsonElement> Inputs,string CallKey="");
public sealed record BrowserWorkItem(ExecutionSegment Segment, string AttemptId, Dictionary<string,string> Wires,Guid ExecutionId);
public sealed record BrowserWork(ExecutionSnapshot Execution, ExecutionSegment? Segment, string? AttemptId, Dictionary<string,string>? Wires, BrowserWorkItem[] WorkItems,InvocationWork[] Invocations, long Revision = 0);
public sealed record BrowserResultItem(Guid ExecutionId, BrowserResult Result);
public sealed record BrowserResult(string SegmentId, string AttemptId, Dictionary<string,string> Wires, ExecutionFailure? Error = null, Dictionary<string,JsonElement>? Outputs = null);

/// <summary>In-memory PoC coordinator. All transitions are serialized; native runtime contexts never leave this process.</summary>
public sealed class Orchestrator(TimeProvider clock, IFlowRuntimeFactory factory, IFlowLogSinkFactory? logSinks = null, IFlowChangeSink? changes = null) : IDisposable
{
    public static readonly TimeSpan Lease = TimeSpan.FromSeconds(30);
    private readonly object gate = new();
    private readonly Dictionary<string,Diagnostic[]> validationCache = new(StringComparer.Ordinal);
    private readonly Queue<string> validationOrder = new();
    private string? validationBasisKey, validationBasis;
    private readonly HashSet<string> preflightCache = new(StringComparer.Ordinal);
    private readonly Queue<string> preflightOrder = new();
    private readonly Dictionary<string,BundleValidation> approvedBundles = new(StringComparer.Ordinal);
    private readonly Queue<string> approvedOrder = new();
    private static readonly NodeCatalog EmptyBrowserNodes = new(1,[]);
    private static readonly CodecCatalog EmptyBrowserCodecs = new(1,"browser",[]);
    private static string BundleHash(GraphBundle bundle) => GraphValidation.Hash(JsonSerializer.SerializeToNode(bundle,ContractSchemas.JsonOptions));
    private static string BrowserFingerprint(NodeCatalog nodes,CodecCatalog codecs) => GraphValidation.Hash(JsonSerializer.SerializeToNode(new{nodes,codecs},ContractSchemas.JsonOptions));
    /// <summary>Called only after authoritative persisted approval, never from request data.</summary>
    public BundleValidation RegisterPersistedValidation(GraphBundle bundle,string runtimeBasis,string? browserFingerprint)
    {
        lock(gate)
        {
            if(runtimeBasis!=ValidationBasisCore(EmptyBrowserNodes,EmptyBrowserCodecs))throw new ProtocolException(409,"validation_stale","Runtime validation has changed.");
            if(browserFingerprint is null&&bundle.Graphs.Any(g=>g.Mode=="hybrid"||g.Nodes.Any(n=>n.Environment=="browser")))throw new ProtocolException(409,"validation_browser","Browser graphs require validated browser contracts.");
            var hash=BundleHash(bundle);
            var proof=new BundleValidation(hash,runtimeBasis,browserFingerprint);
            if(!approvedBundles.ContainsKey(hash))approvedOrder.Enqueue(hash);
            approvedBundles[hash]=proof;
            while(approvedOrder.Count>128)approvedBundles.Remove(approvedOrder.Dequeue());
            return proof;
        }
    }
    public BundleValidation? GetBundleValidation(GraphBundle bundle)
    { lock(gate) return approvedBundles.GetValueOrDefault(BundleHash(bundle)); }
    private bool Approved(GraphBundle bundle,Session? session,BundleValidation? supplied)
    {
        var hash=BundleHash(bundle);var proof=supplied??approvedBundles.GetValueOrDefault(hash);
        var matches=proof is not null && proof.BundleHash==hash && proof.RuntimeBasis==ValidationBasisCore(EmptyBrowserNodes,EmptyBrowserCodecs)
            && (proof.BrowserFingerprint is null || proof.BrowserFingerprint==BrowserFingerprint(session?.Nodes??EmptyBrowserNodes,session?.Codecs??EmptyBrowserCodecs));
        if(supplied is not null&&!matches)throw new ProtocolException(409,"validation_stale","Bundle or runtime/browser contracts differ from the validated snapshot. Validate and save again.");
        return FlowOptimizations.ValidationReuse && matches;
    }
    /// <summary>Stable across backend instances running the same code and metadata.</summary>
    public string ValidationBasis(NodeCatalog browserCatalog, CodecCatalog browserCodecs)
    {
        lock(gate)
        {
            return ValidationBasisCore(browserCatalog,browserCodecs);
        }
    }
    private string ValidationBasisCore(NodeCatalog browserCatalog, CodecCatalog browserCodecs)
    {
        var browserKey=GraphValidation.Hash(System.Text.Json.JsonSerializer.SerializeToNode(new{browserCatalog,browserCodecs},ContractSchemas.JsonOptions));
        var key=factory.PreparationVersion+":"+FlowDesignations.Registry.Fingerprint;
        if(!FlowOptimizations.ValidationReuse || factory.PreparationVersion is null || validationBasisKey!=key)
        {
            var context=factory.Create();
            var value=new {Version=GraphValidation.Version,RuntimeBuild=typeof(Orchestrator).Module.ModuleVersionId,HostBuild=factory.GetType().Module.ModuleVersionId,
                Designations=FlowDesignations.Registry.Fingerprint,Nodes=context.Nodes.Catalog,Types=context.Nodes.Types,Codecs=context.Codecs.Catalog};
            validationBasis=GraphValidation.Hash(JsonSerializer.SerializeToNode(value,ContractSchemas.JsonOptions));validationBasisKey=key;
        }
        return GraphValidation.Hash(new System.Text.Json.Nodes.JsonObject{["runtime"]=validationBasis,["browser"]=browserKey});
    }

    // Access is serialized by gate, including compilation: concurrent misses compile once.
    // Entries contain successful immutable metadata only and are bounded by count and size.
    private readonly Dictionary<string,(ExecutionPlan Plan,NodeCatalog Catalog,int Bytes)> preparedPlans = new();
    private readonly Queue<string> preparationOrder = new();
    private int preparationBytes;
    private long cacheHits,cacheMisses,preflightHits;
    private string? catalogVersion;
    private NodeCatalog? stableCatalog;
    private NodeCatalog BaseCatalog(FlowRuntimeContext context)
    {
        var version = factory.PreparationVersion;
        if (!FlowOptimizations.PlanCache || version is null) return factory.Create().Nodes.Catalog;
        if (stableCatalog is null || catalogVersion != version)
        {
            stableCatalog = factory.Create().Nodes.Catalog;
            catalogVersion = version;
            preparedPlans.Clear(); preparationOrder.Clear(); preparationBytes = 0;
        }
        return stableCatalog;
    }
    private (ExecutionPlan Plan,NodeCatalog Catalog) Prepare(FlowDocument flow, Session? session, GraphBundleSnapshot? bundle)
    {
        var version = factory.PreparationVersion;
        var content = !FlowOptimizations.PlanCache || version is null ? null : JsonSerializer.SerializeToUtf8Bytes(new {
            Compiler = 3, Designations = FlowDesignations.Registry.Fingerprint, Version = version, Flow = flow, Bundle = bundle?.Document, Nodes = session?.Nodes, Codecs = session?.Codecs
        }, ContractSchemas.JsonOptions);
        var key = content is null ? null : Convert.ToHexString(SHA256.HashData(content));
        if (key is not null && preparedPlans.TryGetValue(key, out var cached)) {cacheHits++;return (cached.Plan,cached.Catalog);}
        cacheMisses++;
        var context = factory.CreateForFlow(flow);
        var catalog = BaseCatalog(context);
        if (bundle is not null) GraphNodeRuntime.Register(flow,bundle,context.Nodes,context.Codecs,(_,_,_,_,_,_)=>throw new InvalidOperationException("Validation cannot execute a graph."),catalog);
        var browserCatalog = new NodeCatalog(1,[..session?.Nodes.Nodes??[],..flow.Nodes.Where(node=>node.Graph is not null).Select(GraphNodes.Definition).Select(def=>def with{Environments=["browser"]})]);
        var browserCodecs = new CodecCatalog(1,"browser",MergeCodecs(session?.Codecs.Codecs??[],bundle is null?[]:bundle.PreparedCodecs));
        browserCatalog = PageNodes.BrowserCatalog(flow,ValueNodes.BrowserCatalog(flow,browserCatalog));
        var plan = Clone(CompiledExecution.CompilePlan(flow,browserCatalog,browserCodecs,context.Nodes,context.Codecs));
        if (key is not null)
        {
            var bytes = content!.Length + JsonSerializer.SerializeToUtf8Bytes(plan,ContractSchemas.JsonOptions).Length;
            const int maxBytes = 32 * 1024 * 1024;
            if (bytes <= maxBytes)
            {
                while (preparationOrder.Count > 0 && (preparedPlans.Count >= 128 || preparationBytes + bytes > maxBytes))
                {
                    var oldest = preparationOrder.Dequeue(); preparationBytes -= preparedPlans[oldest].Bytes; preparedPlans.Remove(oldest);
                }
                preparedPlans.Add(key,(plan,catalog,bytes)); preparationOrder.Enqueue(key); preparationBytes += bytes;
            }
        }
        return (plan,catalog);
    }
    private readonly Dictionary<string, Session> sessions = new();
    private readonly Dictionary<Guid, Execution> executions = new();
    private sealed record Session(string Id, string Owner, NodeCatalog Nodes, CodecCatalog Codecs)
    {
        public DateTimeOffset Expires { get; set; }
    }
    private sealed class Execution(Guid id, string owner, Session? session, CompiledExecution runtime, Adam.Flow2.Runtime.CodecRegistry codecs, DateTimeOffset now,ExecutionPlan executionPlan)
    {
        public CancellationTokenSource Cancellation { get; } = new();
        public FlowRuntimeContext Context {get;init;}=null!;
        public NodeCatalog BaseCatalog {get;init;}=null!;
        public Dictionary<string,(ExecutionPlan Plan,NodeCatalog Catalog)> Preparations {get;init;}=new();
        public bool Released {get;set;}
        public bool Profiling {get;init;}
        public GraphBundleSnapshot? Bundle {get;init;}
        public bool StaticValidated {get;init;}
        public HashSet<string> DynamicValidated {get;init;} = new();
        public Execution? Parent {get;init;}
        public FlowDocument Flow {get;init;} = null!;
        public string[] AllowedEnvironments {get;init;} = ["server","browser"];
        public string? CallNodeId {get;init;}
        public Dictionary<string,JsonElement> Inputs {get;init;}=new();
        public List<Execution> Children {get;}=[];
        public Dictionary<string,Execution> Calls {get;}=new();
        public string? CallKey {get;set;}
        public string? HybridEnvironment {get;init;}
        public TaskCompletionSource<IReadOnlyDictionary<string,object>> Completion {get;}=new(TaskCreationOptions.RunContinuationsAsynchronously);
        public IFlowLogSink? LogSink {get;set;}
        public int Busy { get; set; }
        public HashSet<string> Running { get; } = new();
        public Dictionary<string,string> Attempts { get; } = new();
        public Dictionary<string,string> AcceptedResults { get; } = new();
        public long Revision { get; set; }
        public TaskCompletionSource<long> NextChange { get; set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Guid Id { get; } = id;
        public string Owner { get; } = owner;
        public Session? Session { get; } = session;
        public CompiledExecution Runtime { get; } = runtime;
        public Adam.Flow2.Runtime.CodecRegistry Codecs { get; } = codecs;
        public ExecutionPlan Plan { get; } = executionPlan;
        public string State { get; set; } = "created";
        public Dictionary<string,string> Wires { get; } = new();
        public Dictionary<string,JsonElement> Outputs { get; } = new();
        public Dictionary<string,object> NativeOutputs { get; } = new();
        public IReadOnlyDictionary<string,object>? NativeInputs { get; init; }
        public List<string> Completed { get; } = [];
        public List<ExecutionTrace> Events { get; } = [];
        public ExecutionFailure? Error { get; set; }
        public DateTimeOffset Changed { get; set; } = now;
    }
    private static string Token() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private DateTimeOffset Now => clock.GetUtcNow();

    // Successful capability validation only. Sessions and their declarations remain separate.
    private readonly HashSet<string> validatedSessionCapabilities = new(StringComparer.Ordinal);
    private readonly Queue<string> sessionCapabilityOrder = new();
    private string? sessionCapabilityVersion;
    public string CreateSession(string owner, NodeCatalog nodes, CodecCatalog codecs, Action<string>? phase = null, PhaseTimings? timing = null)
    {
        lock(gate)
        {
            phase?.Invoke("Abgelaufene Runtime-Sitzungen werden aufgeräumt");
            timing?.Mark("sessionQueueMs");
            SweepCore();
            timing?.Mark("sessionSweepMs");
            if (string.IsNullOrWhiteSpace(owner)) throw new ProtocolException(401,"owner","Authentication required.");
            if(codecs.Environment!="browser" || nodes.Nodes.Any(node=>node.Environments.Any(env=>env!="browser")))
                throw new ProtocolException(400,"environment","Expected browser capabilities.");
            var version = FlowOptimizations.ValidationReuse ? factory.PreparationVersion : null;
            if (sessionCapabilityVersion != version)
            {
                validatedSessionCapabilities.Clear(); sessionCapabilityOrder.Clear(); sessionCapabilityVersion = version;
            }
            var key = version is null ? null : Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new { nodes, codecs }, ContractSchemas.JsonOptions)));
            var hit = key is not null && validatedSessionCapabilities.Contains(key);
            timing?.Mark("sessionCacheLookupMs");
            if (!hit)
            {
                phase?.Invoke("Backend-Nodekatalog wird geladen");
                var runtime = factory.Create();
                timing?.Mark("sessionFactoryMs");
                phase?.Invoke($"Browser-Nodekatalog wird geprüft ({nodes.Nodes.Length} Nodes)");
                var nodeErrors = ContractSchemas.Validate("catalog",JsonSerializer.SerializeToElement(nodes,ContractSchemas.JsonOptions));
                timing?.Mark("sessionValidateNodesMs");
                phase?.Invoke($"Browser-Codecs werden geprüft ({codecs.Codecs.Length} Codecs)");
                var errors = nodeErrors.Concat(runtime.Nodes.ValidateCodecs(codecs)).ToArray();
                timing?.Mark("sessionValidateCodecsMs");
                if(errors.Length!=0) throw new ContractException(errors);
                if (key is not null)
                {
                    if (sessionCapabilityOrder.Count >= 64) validatedSessionCapabilities.Remove(sessionCapabilityOrder.Dequeue());
                    validatedSessionCapabilities.Add(key); sessionCapabilityOrder.Enqueue(key);
                }
            }
            phase?.Invoke("Geprüfte Browser-Metadaten werden kopiert");
            // Freeze declarations for this session; a later request cannot substitute capabilities.
            var frozenNodes=JsonSerializer.Deserialize<NodeCatalog>(JsonSerializer.Serialize(nodes,ContractSchemas.JsonOptions),ContractSchemas.JsonOptions)!;
            var frozenCodecs=JsonSerializer.Deserialize<CodecCatalog>(JsonSerializer.Serialize(codecs,ContractSchemas.JsonOptions),ContractSchemas.JsonOptions)!;
            timing?.Mark("sessionFreezeMs");
            var id=Token();sessions.Add(id,new(id,owner,frozenNodes,frozenCodecs){Expires=Now+Lease});
            timing?.Mark("sessionStoreMs");return id;
        }
    }
    /// <summary>Validates a backend bundle without creating an execution or running nodes.</summary>
    public GraphBundle ValidateBackendBundle(GraphBundle bundle)
    {
        lock (gate)
        {
            // Check original hybrid reference restrictions before specializing this backend-only run.
            var original = new GraphBundleSnapshot(bundle).Document;
            var effective = original with { Graphs = original.Graphs.Select(graph => graph.Mode == "hybrid"
                ? GraphContracts.MaterializeHybrid(graph, "server") with { Mode = "backend" } : graph).ToArray() };
            var snapshot = new GraphBundleSnapshot(effective);
            Preflight(snapshot.Root, null, snapshot, null, [], allowedEnvironments: ["server"]);
            return effective;
        }
    }

    /// <summary>Editor preflight: compile every supplied dependency without executing nodes.</summary>
    public Diagnostic[] ValidateWorkspace(GraphBundle bundle, NodeCatalog browserCatalog, CodecCatalog browserCodecs, string owner, IReadOnlyDictionary<string,JsonElement>? inputs = null, Action<string,string>? progress = null, Action<string>? phase = null)
    {
        phase?.Invoke("Auf freie Backend-Runtime warten");
        lock(gate)
        {
            phase?.Invoke($"Graph-Bundle-Schema wird geprüft ({bundle.Graphs.Length} Graphen)");
            var snapshot = new GraphBundleSnapshot(bundle);
            var sessionId = CreateSession(owner, browserCatalog, browserCodecs, phase);
            try
            {
                var session = RequireSession(sessionId, owner);
                phase?.Invoke("Prüffingerprints und Cache werden geprüft");
                var basis=ValidationBasisCore(browserCatalog,browserCodecs);
                var cacheKey=GraphValidation.Hash(JsonSerializer.SerializeToNode(new{Basis=basis,Bundle=snapshot.Document,Inputs=inputs},ContractSchemas.JsonOptions));
                void Approve() => RegisterPersistedValidation(bundle,ValidationBasisCore(EmptyBrowserNodes,EmptyBrowserCodecs),bundle.Graphs.Any(g=>g.Mode=="hybrid"||g.Nodes.Any(n=>n.Environment=="browser"))?BrowserFingerprint(browserCatalog,browserCodecs):null);
                if(FlowOptimizations.ValidationReuse && validationCache.TryGetValue(cacheKey,out var prior)){Approve();foreach(var graph in snapshot.Document.Graphs)progress?.Invoke(graph.Id,"cached");return prior.ToArray();}
                var errors = new List<Diagnostic>();
                var rootSession = snapshot.Root.Mode is "interactive" or "hybrid" || snapshot.Document.Graphs.Any(g=>g.Mode=="hybrid") ? session : null;
                var preparations = new Dictionary<string,(ExecutionPlan Plan,NodeCatalog Catalog)>();
                phase?.Invoke("Graphen und Abhängigkeiten werden validiert");
                foreach(var graph in snapshot.Document.Graphs)
                {
                    var errorCount=errors.Count;
                    try { Preflight(GraphContracts.MaterializeHybrid(graph), graph.Mode=="backend"?rootSession:session, snapshot, graph.Id==snapshot.Root.Id?inputs:null, [], preparations:preparations, progress:progress); }
                    catch(ContractException error) { errors.AddRange(error.Diagnostics.Select(d=>d with {Path=$"/graphs/{graph.Id}"+d.Path})); }
                    catch(ProtocolException error) { errors.Add(new(error.Code,$"/graphs/{graph.Id}",error.Message)); }
                    if(errors.Count!=errorCount)progress?.Invoke(graph.Id,"invalid");
                }
                var diagnostics=errors.Distinct().ToArray();
                // Cache successful checks only; stored draft diagnostics are managed by persistence.
                if(diagnostics.Length==0 && FlowOptimizations.ValidationReuse){Approve();while(validationOrder.Count>=128)validationCache.Remove(validationOrder.Dequeue());validationOrder.Enqueue(cacheKey);validationCache[cacheKey]=diagnostics;}
                return diagnostics.ToArray();
            }
            finally { CloseSession(sessionId, owner); }
        }
    }

    /// <summary>Waits until execution and scoped data cleanup have finished, without polling.</summary>
    public ExecutionSnapshot Status(Guid id, string? sessionId, string owner)
    {
        lock(gate){var execution=Find(id);Authorize(execution,sessionId,owner);return Snapshot(execution);}
    }

    public async Task<ExecutionSnapshot> WaitForCompletionAsync(Guid id, string? sessionId, string owner, CancellationToken cancellation = default)
    {
        Execution execution;
        lock (gate) { execution = Find(id); Authorize(execution, sessionId, owner); }
        using var registration = cancellation.Register(() => { lock (gate) { if (!Terminal(execution)) Fail(execution, new("cancelled", "Execution cancelled.", null)); } });
        await execution.Completion.Task.ConfigureAwait(false);
        lock (gate) return Snapshot(execution);
    }

    public ExecutionSnapshot Start(FlowDocument flow, string? sessionId, string? owner, IReadOnlyDictionary<string,JsonElement>? inputs = null,GraphBundle? bundle=null,bool profiling=false, bool allowUnknownInputs=false, BundleValidation? validation=null)
    {
        var requested=profiling?System.Diagnostics.Stopwatch.GetTimestamp():0;
        lock(gate)
        {
            var acquired=profiling?System.Diagnostics.Stopwatch.GetTimestamp():0;
            var timing=profiling?new PhaseTimings():null;
            var hits=cacheHits;var misses=cacheMisses;var validationHits=preflightHits;
            SweepCore();
            Session? session=flow.Mode is "interactive" or "hybrid" || sessionId is not null?RequireSession(sessionId,owner):null;
            if(string.IsNullOrEmpty(owner))throw new ProtocolException(401,"owner","Authentication required.");
            if(validation is not null&&bundle is null)throw new ProtocolException(400,"bundle_required","Validation receipt requires its bundle.");
            var approved=bundle is not null&&Approved(bundle,session,validation);
            timing?.Mark("approvalMs");
            var snapshot=bundle is null?null:new GraphBundleSnapshot(bundle,approved);
            timing?.Mark("snapshotMs");
            if(snapshot is not null&&!TransportContracts.Equivalent(snapshot.Root,flow))throw new ProtocolException(400,"bundle_root","Root flow differs from workspace snapshot.");
            if(flow.Nodes.Any(node=>node.Graph is not null)&&snapshot is null)throw new ProtocolException(400,"bundle_required","Graph nodes require a workspace snapshot.");
            flow=GraphContracts.MaterializeHybrid(flow);
            timing?.Mark("rootAndHybridMs");
            var preparations=new Dictionary<string,(ExecutionPlan Plan,NodeCatalog Catalog)>();
            if(approved)preflightHits++;
            if(snapshot is not null&&!approved)Preflight(flow,session,snapshot,inputs,[],preparations:preparations);
            timing?.Mark("preflightMs");
            var execution=StartCore(flow,session,owner,inputs,snapshot,null,null,preparations:preparations,profiling:profiling,allowUnknownInputs:allowUnknownInputs,staticValidated:snapshot is not null);
            timing?.Mark("startCoreMs");
            if(timing is not null)Record(execution,"server","profile","preparationPhases",profile:timing.Values);
            if(profiling)Record(execution,"server","profile","preparation",duration:System.Diagnostics.Stopwatch.GetElapsedTime(acquired).TotalMilliseconds,profile:new Dictionary<string,double>{{"queueMs",System.Diagnostics.Stopwatch.GetElapsedTime(requested,acquired).TotalMilliseconds},{"cacheHits",cacheHits-hits},{"cacheMisses",cacheMisses-misses},{"validationCacheHits",preflightHits-validationHits},{"staticValidationReused",approved?1:0}});
            return Snapshot(execution);
        }
    }
    private static string[] DesignationEnvironments(FlowDocument flow,string[]? inherited)
    {
        var allowed=inherited??["server","browser"];
        if(flow.Designation is null&&allowed.Length==2)return allowed;
        if(flow.Designation is {} id)
        {
            var definition=FlowDesignations.Registry.Get(id);
            if(definition is null)throw new ContractException([new("designation_unknown","/flow/designation",$"Unknown flow designation: {id}")]);
            allowed=allowed.Intersect(definition.Environments).ToArray();
        }
        var errors=flow.Nodes.Where(node=>!allowed.Contains(node.Environment)).Select(node=>new Diagnostic("designation_environment",$"/graphs/{flow.Id}/nodes/{node.Id}",$"Runtime {node.Environment} is not allowed by the calling context.")).ToArray();
        if(errors.Length>0)throw new ContractException(errors);
        return allowed;
    }
    // Validate known invocation targets before any native code or log side effects run.
    private void Preflight(FlowDocument flow,Session? session,GraphBundleSnapshot bundle,IReadOnlyDictionary<string,JsonElement>? inputs,HashSet<string> ancestors,HashSet<string>? validated=null,Dictionary<string,(ExecutionPlan Plan,NodeCatalog Catalog)>? preparations=null,string[]? allowedEnvironments=null,Action<string,string>? progress=null)
    {
        progress?.Invoke(flow.Id,"checking");
        allowedEnvironments=DesignationEnvironments(flow,allowedEnvironments);
        // Cache the complete checked request, including dynamic graph arguments and inherited runtime constraints.
        // No client flag can populate this cache; only a successful preflight does.
        var graphArguments=inputs?.Where(pair=>flow.Nodes.Any(node=>node.Graph?.Operation=="input" && node.Config.TryGetValue("name",out var name)
            && name.ValueKind==JsonValueKind.String && name.GetString()==pair.Key)).ToDictionary(pair=>pair.Key,pair=>pair.Value);
        var preflightKey=FlowOptimizations.ValidationReuse && ancestors.Count==0 && factory.PreparationVersion is {} version
            ? GraphValidation.Hash(JsonSerializer.SerializeToNode(new {Version=version,Designations=FlowDesignations.Registry.Fingerprint,
                Flow=flow,Bundle=bundle.Document,Nodes=session?.Nodes,Codecs=session?.Codecs,Inputs=graphArguments,Allowed=allowedEnvironments},ContractSchemas.JsonOptions)) : null;
        if(preflightKey is not null && preflightCache.Contains(preflightKey)){preflightHits++;progress?.Invoke(flow.Id,"cached");return;}
        if(ancestors.Contains(flow.Id))throw new ProtocolException(400,"graph_recursion","Recursive graph calls are not supported.");
        if(ancestors.Count>=32)throw new ProtocolException(400,"graph_depth","Graph invocation depth exceeded.");
        if((flow.Mode is "interactive" or "hybrid")&&session is null)throw new ProtocolException(400,"graph_environment","A backend-only run cannot invoke a browser graph.");
        validated??=[];
        var key=flow.Id+":"+string.Join(",",flow.Nodes.Select(node=>node.Environment))+":"+string.Join(",",allowedEnvironments);
        if(FlowOptimizations.ValidationReuse && !validated.Add(key)){progress?.Invoke(flow.Id,"valid");return;}
        var preparationKey=flow.Id+":"+string.Join(",",flow.Nodes.Select(node=>node.Environment));
        preparations??=new();
        // Bound to this immutable bundle and browser session. Dynamic target resolution
        // and recursion checks still run for every call, including new graph arguments.
        if(!preparations.TryGetValue(preparationKey,out var prepared) || !FlowOptimizations.PlanCache)
        {
            prepared=Prepare(flow,session,bundle);preparations[preparationKey]=prepared;
        }
        var (plan,catalog)=prepared;
        var path=new HashSet<string>(ancestors){flow.Id};
        foreach(var node in flow.Nodes.Where(node=>node.Graph is not null&&!plan.SkippedNodeIds.Contains(node.Id)))
        {
            var binding=node.Graph!;FlowDocument? target=null;
            if(binding.GraphId is {} id)target=bundle.Resolve(JsonSerializer.SerializeToElement(bundle.Reference(id),ContractSchemas.JsonOptions),binding.Signature,catalog);
            if(binding.Operation!="invoke"&&!GraphControls.IsControl(binding.Operation))continue;
            foreach(var slot in GraphControls.IsControl(binding.Operation)?GraphControls.Slots(binding):new[]{"graph"})
            {
                var signature=GraphControls.IsControl(binding.Operation)?GraphControls.SlotSignature(binding,slot):binding.Signature;
                FlowDocument? called=target;
                if(called is null)
                {
                    var edge=flow.Connections.FirstOrDefault(edge=>edge.Target.NodeId==node.Id&&edge.Target.Port==slot);
                    var source=edge is null?null:flow.Nodes.Single(item=>item.Id==edge.Source.NodeId);
                    if(source?.Graph?.Operation=="reference")called=bundle.Resolve(JsonSerializer.SerializeToElement(bundle.Reference(source.Graph.GraphId!),ContractSchemas.JsonOptions),signature,catalog);
                    else if(source?.Graph?.Operation=="input"&&inputs is not null)
                    {
                        var parameter=plan.Interface.Inputs.Single(parameter=>parameter.NodeId==source.Id);
                        if(inputs.TryGetValue(parameter.Name,out var value))called=bundle.Resolve(value,signature,catalog);
                    }
                }
                if(called is not null)
                {
                    if(flow.Mode=="hybrid"&&called.Mode!="hybrid")throw new ProtocolException(400,"hybrid_graph","Hybrid graphs may invoke only hybrid subgraphs.");
                    try { Preflight(GraphContracts.MaterializeHybrid(called,node.Environment),session,bundle,null,path,validated,preparations,allowedEnvironments,progress); }
                    catch(ContractException error) { progress?.Invoke(called.Id,"invalid"); throw new ContractException(error.Diagnostics.Select(d=>d with{Path=$"/calls/{node.Id}/{called.Id}"+d.Path}).ToArray()); }
                }
            }
        }
        progress?.Invoke(flow.Id,"valid");
        if(preflightKey is not null && preflightCache.Add(preflightKey))
        {
            preflightOrder.Enqueue(preflightKey);
            while(preflightOrder.Count>256)preflightCache.Remove(preflightOrder.Dequeue());
        }
    }
    private Execution StartCore(FlowDocument flow,Session? session,string owner,IReadOnlyDictionary<string,JsonElement>? inputs,GraphBundleSnapshot? bundle,Execution? parent,string? callNode,IReadOnlyDictionary<string,object>? nativeInputs=null,Dictionary<string,(ExecutionPlan Plan,NodeCatalog Catalog)>? preparations=null,bool profiling=false,bool allowUnknownInputs=false,bool staticValidated=false)
    {
        var timing=(parent?.Profiling??profiling)?new PhaseTimings():null;
        var allowedEnvironments=DesignationEnvironments(flow,parent?.AllowedEnvironments);
        var preparationStart=System.Diagnostics.Stopwatch.GetTimestamp();
        if((flow.Mode is "interactive" or "hybrid")&&session is null)throw new ProtocolException(400,"graph_environment","A backend-only run cannot invoke a browser graph.");
        preparations ??= parent?.Preparations ?? new();
        var preparationKey = flow.Id+":"+string.Join(",",flow.Nodes.Select(node=>node.Environment));
        if (!preparations.TryGetValue(preparationKey,out var prepared) || !FlowOptimizations.PlanCache)
        {
            prepared = Prepare(flow,session,bundle); preparations[preparationKey]=prepared;
        }
        var isolated=parent is not null && parent.Plan.Nodes.Single(n=>n.Id==callNode).Graph?.Operation=="parallelMap";
        timing?.Mark("planLookupMs");
        var context=isolated?factory.CreateIsolatedExecutionForFlow(flow,parent!.Context):factory.CreateExecutionForFlow(flow,parent?.Context);var id=Guid.NewGuid();
        timing?.Mark("executionFactoryMs");
        var baseCatalog=prepared.Catalog;
        var browserCatalog=session?.Nodes??new(1,[]);var browserCodecs=session?.Codecs??new(1,"browser",[]);
        if(bundle is not null)
        {
            GraphNodeRuntime.Register(flow,bundle,context.Nodes,context.Codecs,(node,reference,signature,args,cancel,key)=>InvokeNative(id,node,reference,signature,args,cancel,key),baseCatalog);
            browserCatalog=new(1,[..browserCatalog.Nodes,..flow.Nodes.Where(node=>node.Graph is not null).Select(GraphNodes.Definition).Select(def=>def with{Environments=["browser"]})]);
            browserCodecs=browserCodecs with{Codecs=MergeCodecs(browserCodecs.Codecs,bundle.PreparedCodecs)};
        }
        browserCatalog=PageNodes.BrowserCatalog(flow,ValueNodes.BrowserCatalog(flow,browserCatalog));
        timing?.Mark("specializeMs");
        var runtime=new CompiledExecution(id,flow,browserCatalog,browserCodecs,context.Nodes,context.Codecs,inputs,nativeInputs,!FlowOptimizations.PlanCache || factory.PreparationVersion is null ? null : prepared.Plan, allowUnknownInputs);
        timing?.Mark("runtimeMs");
        var runtimePlan=runtime.Plan;
        var wireInputs=nativeInputs is null?(inputs??new Dictionary<string,JsonElement>()):ToWire(runtimePlan.Interface.Inputs,nativeInputs);
        if (parent is null) RequireTransport(runtimePlan.Interface.Outputs, "Root outputs");
        RequireTransport(runtimePlan.Interface.Inputs.Where(p=>flow.Nodes.Single(n=>n.Id==p.NodeId).Environment=="browser"), "Browser inputs");
        try{
            var errors=FlowDesignations.Registry.Validate(flow,baseCatalog,wireInputs);
            if(errors.Count>0)throw new ContractException(errors);
            ValidateGraphValues(bundle,runtimePlan.Interface.Inputs,wireInputs,baseCatalog);}
        catch{runtime.Dispose();throw;}
        var execution=new Execution(id,owner,session,runtime,context.Codecs,Now,runtimePlan){Flow=flow,AllowedEnvironments=allowedEnvironments,Profiling=parent?.Profiling??profiling,HybridEnvironment=flow.Mode=="hybrid"?flow.Nodes.First().Environment:null,Context=context,BaseCatalog=baseCatalog,Preparations=parent?.Preparations??preparations??new(),Bundle=bundle,StaticValidated=parent?.StaticValidated??staticValidated,DynamicValidated=parent?.DynamicValidated??new(),Parent=parent,CallNodeId=callNode,Inputs=wireInputs.ToDictionary(p=>p.Key,p=>p.Value.Clone()),NativeInputs=nativeInputs};
        try{execution.LogSink=logSinks?.Create(id,flow.Id,owner);}catch{runtime.Dispose();throw;}
        executions.Add(id,execution);parent?.Children.Add(execution);
        if(session is not null)Record(execution,"browser","session","bound",message:"Browser-Session gebunden.");
        Record(execution,"server","execution","running",message:"Ausführung gestartet.");
        if(session is not null)session.Expires=Now+Lease; // Preparation under the gate must not consume the browser lease.
        if(execution.Profiling&&parent is not null)Record(execution,"server","profile","preparation",duration:System.Diagnostics.Stopwatch.GetElapsedTime(preparationStart).TotalMilliseconds,profile:new Dictionary<string,double>{{"staticValidationReused",execution.StaticValidated?1:0}});
        timing?.Mark("inputChecksAndRegistrationMs");
        Advance(execution);
        timing?.Mark("initialAdvanceMs");
        if(timing is not null)Record(execution,"server","profile","initializationPhases",profile:timing.Values);
        return execution;
    }
    private async Task<IReadOnlyDictionary<string,object>> InvokeNative(Guid id,string node,GraphReference reference,FlowInterface signature,IReadOnlyDictionary<string,object> inputs,CancellationToken cancellation,string callKey="")
    {
        Execution child,parent;
        var childStart=System.Diagnostics.Stopwatch.GetTimestamp();
        lock(gate){parent=Find(id);}
        try {
        lock(gate){child=StartChild(parent,node,reference,signature,null,inputs,callKey);}
        IReadOnlyDictionary<string,object> result;
        try{result=await child.Completion.Task.WaitAsync(cancellation);}
        catch(OperationCanceledException) when(cancellation.IsCancellationRequested)
        {
            lock(gate){if(!Terminal(child))Fail(child,new("cancelled","Subgraph invocation cancelled.",null));}
            await child.Completion.Task; // Cooperative cleanup must finish before a retry can share this scope.
            throw;
        }
        if(child.Error?.Code is "cancelled" or "session_lost")throw new OperationCanceledException(child.Error.Message,cancellation);
        if(child.Error is {} error)throw new FlowExecutionException(error);
        if(parent.Plan.Nodes.Single(n=>n.Id==node).Graph?.Operation=="parallelMap")return signature.Outputs.Where(p=>child.Outputs.ContainsKey(p.Name)).ToDictionary(p=>p.Name,p=>FlowValues.Decode(p.Type,child.Outputs[p.Name]));
        return result;
        } finally {if(parent.Profiling)lock(gate)Record(parent,"server","profile","childWait",node:node,duration:System.Diagnostics.Stopwatch.GetElapsedTime(childStart).TotalMilliseconds,profile:new Dictionary<string,double>{{"startMs",System.Diagnostics.Stopwatch.GetElapsedTime(0,childStart).TotalMilliseconds}});}
    }
    private Execution StartChild(Execution parent,string nodeId,GraphReference reference,FlowInterface signature,IReadOnlyDictionary<string,JsonElement>? inputs,IReadOnlyDictionary<string,object>? nativeInputs=null,string callKey="")
    {
        if(Terminal(parent)||parent.Bundle is null)throw new ProtocolException(409,"invocation","Parent invocation is not running in a workspace.");
        var binding=parent.Plan.Nodes.Single(node=>node.Id==nodeId).Graph??throw new ProtocolException(400,"invocation","Node is not a graph invocation.");
        var controlled=GraphControls.IsControl(binding.Operation);
        var slot=controlled?GraphControls.SlotForCall(binding,callKey):"";
        var expected=controlled?GraphControls.SlotSignature(binding,slot):binding.Signature;
        if((!controlled&&binding.Operation!="invoke")||(!controlled&&callKey!="")||!GraphContracts.SameSignature(expected,signature)||(binding.GraphId is {} fixedId&&fixedId!=reference.GraphId))throw new ProtocolException(400,"invocation","Graph call differs from its node binding.");
        var callId=callKey==""?nodeId:nodeId+"|"+callKey;
        if(parent.Calls.TryGetValue(callId,out var existing))
        {
            if(existing.Plan.FlowId!=reference.GraphId||existing.Plan.FlowVersion!=reference.Revision||(nativeInputs is not null ? !ReferenceEquals(existing.NativeInputs,nativeInputs) : existing.NativeInputs is not null || !TransportContracts.Equivalent(existing.Inputs,inputs)))throw new ProtocolException(409,"invocation","Repeated call has different arguments.");
            return existing;
        }
        if(controlled)
        {
            var prior=parent.Calls.Where(pair=>pair.Key.StartsWith(nodeId+"|",StringComparison.Ordinal)).ToArray();
            if(binding.Operation!="parallelMap"&&prior.Any(pair=>!Terminal(pair.Value)))throw new ProtocolException(409,"invocation_order","Previous invocation must finish first.");
            if(binding.Operation is not ("try" or "retry")&&prior.Any(pair=>pair.Value.State=="failed"))throw new ProtocolException(409,"invocation_failed","Cannot continue after a failed child.");
            if(binding.Operation=="parallelMap"&&prior.Count(pair=>!Terminal(pair.Value))>=16)throw new ProtocolException(409,"invocation_limit","ParallelMap permits at most 16 active calls.");
            if(binding.Operation=="while")
            {
                var iteration=prior.Length/2;
                var expectedSlot=prior.Length%2==0?"condition":"body";
                var config=parent.Plan.Nodes.Single(node=>node.Id==nodeId).Config;
                var limit=config.TryGetValue("maxIterations",out var configuredLimit)?configuredLimit.GetInt32():100;
                if(callKey!=expectedSlot+":"+iteration)throw new ProtocolException(409,"invocation_order","While must alternate condition and body calls.");
                if(iteration>limit||slot=="body"&&iteration>=limit)throw new ProtocolException(409,"invocation_limit","While iteration limit exceeded.");
                if(slot=="body" && (!parent.Calls.TryGetValue(nodeId+"|condition:"+iteration,out var condition)||!condition.NativeOutputs.TryGetValue("value",out var value)||value is not true))
                    throw new ProtocolException(409,"invocation_order","While body requires a true condition.");
            }
            if(GraphControls.IsJoin(binding.Operation))
            {
                var slotPrefix=nodeId+"|"+slot+":";
                if(callKey!=slot+":"+prior.Count(pair=>pair.Key.StartsWith(slotPrefix,StringComparison.Ordinal))||slot=="rightKey"&&prior.Any(pair=>pair.Key.StartsWith(nodeId+"|leftKey:",StringComparison.Ordinal)))
                    throw new ProtocolException(409,"invocation_order","Join keys must be consecutive; right keys precede left keys.");
            }
            if(binding.Operation!="parallelMap"&&(GraphControls.IsLoop(binding.Operation)||binding.Operation is "repeat" or "retry")&&callKey!="body:"+prior.Length)throw new ProtocolException(409,"invocation_order","Iterations must be consecutive.");
            if(binding.Operation=="retry"&&(prior.Length>=10||prior.Any(pair=>pair.Value.State=="completed"||pair.Value.Error?.Code is "cancelled" or "session_lost")))throw new ProtocolException(409,"invocation_order","Retry requires failed prior attempts and permits at most 10 attempts.");
            if(binding.Operation=="repeat"&&prior.Length>=1000)throw new ProtocolException(409,"invocation_limit","Repeat iteration limit exceeded.");
            if(binding.Operation is "if" or "ifElse" or "switch" && prior.Length!=0)throw new ProtocolException(409,"invocation_order","Only one branch may execute.");
            if(binding.Operation=="try")
            {
                parent.Calls.TryGetValue(nodeId+"|body",out var body);
                parent.Calls.TryGetValue(nodeId+"|catch",out var caught);
                if(slot=="body"&&prior.Length!=0||slot=="catch"&&(body?.State!="failed"||body.Error?.Code is "cancelled" or "session_lost")||slot=="finally"&&(body is null||body.State=="failed"&&caught is null))
                    throw new ProtocolException(409,"invocation_order","Invalid Try/Catch/Finally order.");
            }
        }
        var depth=0;var root=parent;
        for(var ancestor=parent;ancestor is not null;ancestor=ancestor.Parent)
        {
            root=ancestor;
            if(ancestor.Plan.FlowId==reference.GraphId)throw new ProtocolException(400,"graph_recursion","Recursive graph calls are not supported.");
            if(++depth>=32)throw new ProtocolException(400,"graph_depth","Graph invocation depth exceeded.");
        }
        if(Descendants(root).Count()>=1024)throw new ProtocolException(400,"graph_limit","Graph invocation limit exceeded.");
        var flow=parent.Bundle.Resolve(JsonSerializer.SerializeToElement(reference,ContractSchemas.JsonOptions),signature,parent.BaseCatalog);
        if(parent.Plan.Mode=="hybrid"&&flow.Mode!="hybrid")throw new ProtocolException(400,"hybrid_graph","Hybrid graphs may invoke only hybrid subgraphs.");
        flow=GraphContracts.MaterializeHybrid(flow,parent.Plan.Nodes.Single(node=>node.Id==nodeId).Environment);
        if (nativeInputs is null)
        {
            RequireTransport(signature.Inputs.Concat(signature.Outputs), "Browser graph call");
            FlowInterfaces.RequireValues(signature.Inputs,inputs!,registry:new(parent.Context.Nodes.Types));
        }
        else parent.Context.Nodes.RequireNativeValues(signature.Inputs,nativeInputs);
        var wireInputs=nativeInputs is null?inputs!:ToWire(signature.Inputs,nativeInputs);
        var ancestors=new HashSet<string>();for(var ancestor=parent;ancestor is not null;ancestor=ancestor.Parent)ancestors.Add(ancestor.Plan.FlowId);
        // Statically bound calls are covered by the receipt. A late graph target may
        // introduce a new inherited-runtime/ancestor context; check that context once.
        var edge=parent.Flow.Connections.FirstOrDefault(edge=>edge.Target.NodeId==nodeId&&edge.Target.Port==(controlled?slot:"graph"));
        var source=edge is null?null:parent.Flow.Nodes.Single(node=>node.Id==edge.Source.NodeId);
        var staticTarget=binding.GraphId is not null || source?.Graph?.Operation=="reference"&&source.Graph.GraphId==reference.GraphId;
        var dynamicKey=parent.StaticValidated&&!staticTarget?GraphValidation.Hash(JsonSerializer.SerializeToNode(new{flow.Id,Allowed=parent.AllowedEnvironments,Ancestors=ancestors.Order(),Inputs=wireInputs.Where(p=>signature.Inputs.Any(input=>input.Name==p.Key&&input.Type.Kind=="graph")).ToDictionary(p=>p.Key,p=>p.Value)},ContractSchemas.JsonOptions)):null;
        if(!FlowOptimizations.ValidationReuse || !parent.StaticValidated || !staticTarget&&!parent.DynamicValidated.Contains(dynamicKey!))
        {
            Preflight(flow,parent.Session,parent.Bundle,wireInputs,ancestors,preparations:parent.Preparations,allowedEnvironments:parent.AllowedEnvironments);
            if(dynamicKey is not null)parent.DynamicValidated.Add(dynamicKey);
        }
        var child=StartCore(flow,parent.Session,parent.Owner,inputs,parent.Bundle,parent,nodeId,nativeInputs);
        child.CallKey=callKey==""?null:callKey;parent.Calls.Add(callId,child);return child;
    }
    public InvocationInfo Invoke(Guid id,string? sessionId,string? owner,GraphCall call)
    {
        lock(gate)
        {
            var parent=Find(id);Authorize(parent,sessionId,owner);
            if(!parent.Attempts.TryGetValue(call.SegmentId,out var attempt)||attempt!=call.AttemptId)throw new ProtocolException(409,"stale_result","Graph call does not match the pending browser attempt.");
            var segment=parent.Plan.Segments.Single(item=>item.Id==call.SegmentId);
            var node=parent.Plan.Nodes.Single(item=>item.Id==segment.NodeIds.Single());
            if(node.Graph is null||node.Graph.Operation!="invoke"&&!GraphControls.IsControl(node.Graph.Operation))throw new ProtocolException(400,"invocation","Segment is not a graph invocation.");
            var signature=GraphControls.IsControl(node.Graph.Operation)?GraphControls.SlotSignature(node.Graph,GraphControls.SlotForCall(node.Graph,call.CallKey)):node.Graph.Signature;
            return Info(StartChild(parent,node.Id,call.Reference,signature,call.Inputs,callKey:call.CallKey));
        }
    }
    private static CodecDefinition[] MergeCodecs(CodecDefinition[] existing,CodecDefinition[] added)
    {
        var result=existing.ToList();
        foreach(var codec in added)
        {
            var prior=result.FirstOrDefault(c=>c.TypeId==codec.TypeId&&c.Version==codec.Version);
            if(prior is null)result.Add(codec);
            else if(!TransportContracts.Equivalent(prior,codec))throw new ProtocolException(400,"codec_mismatch","Conflicting generated codec.");
        }
        return result.ToArray();
    }
    private static void RequireTransport(IEnumerable<FlowParameter> parameters,string context)
    {
        if(parameters.Any(p=>!TransportContracts.IsTransportable(p.Type)))
            throw new ProtocolException(400,"local_value",$"{context} require transportable values. Project native entities explicitly.");
    }
    private static Dictionary<string,JsonElement> ToWire(IEnumerable<FlowParameter> parameters,IReadOnlyDictionary<string,object> values)
        =>parameters.Where(p=>TransportContracts.IsTransportable(p.Type)&&values.ContainsKey(p.Name)).ToDictionary(p=>p.Name,p=>FlowValues.Encode(p.Type,values[p.Name]));

    private static void ValidateGraphValues(GraphBundleSnapshot? bundle,IEnumerable<FlowParameter> parameters,IReadOnlyDictionary<string,JsonElement> values,NodeCatalog catalog)
    {
        foreach(var parameter in parameters.Where(parameter=>parameter.Type.Kind=="graph"))
        {
            if(bundle is null)throw new ProtocolException(400,"bundle_required","Graph values require a workspace snapshot.");
            bundle.Resolve(values[parameter.Name],parameter.Type.Signature!,catalog);
        }
    }
    private static IEnumerable<Execution> Descendants(Execution item)
    {
        yield return item;
        foreach(var child in item.Children)foreach(var nested in Descendants(child))yield return nested;
    }
    private static InvocationInfo Info(Execution item)=>new(item.Id,item.Plan.FlowId,item.Parent?.Id,item.CallNodeId,item.State,item.Error,[..item.Plan.SkippedNodeIds],item.State=="completed"?Clone(item.Outputs):[],item.CallKey,item.HybridEnvironment);
    public BrowserWork Next(Guid id,string? sessionId,string? owner)
    {
        lock(gate)
        {
            SweepCore();var execution=Find(id);Authorize(execution,sessionId,owner);
            foreach(var invocation in Descendants(execution))if(!Terminal(invocation))invocation.Changed=Now;
            var work=Terminal(execution)?[]:Descendants(execution).Where(item=>!Terminal(item)).SelectMany(item=>item.Plan.Segments.Where(segment=>item.Attempts.ContainsKey(segment.Id))
                .Select(segment=>new BrowserWorkItem(Clone(segment),item.Attempts[segment.Id],Incoming(item,segment),item.Id))).ToArray();
            var first=work.FirstOrDefault();
            return new(Snapshot(execution),first?.Segment,first?.AttemptId,first?.Wires,work,Descendants(execution).Select(item=>new InvocationWork(Info(item),item.Inputs.Where(pair=>item.Plan.Interface.Inputs.Any(p=>p.Name==pair.Key&&item.Plan.Nodes.Any(n=>n.Id==p.NodeId&&n.Environment=="browser"))).ToDictionary(pair=>pair.Key,pair=>pair.Value.Clone()))).ToArray(),execution.Revision);
        }
    }

    /// <summary>Full authoritative snapshots, with atomic subscribe/read and no network I/O under the lock.
    /// Intermediate revisions may coalesce: outstanding attempts and final status remain in the snapshot.</summary>
    public async Task<BrowserWork> WaitForWorkAsync(Guid id, string sessionId, string owner, long afterRevision, CancellationToken cancellation)
    {
        if(afterRevision < -1)throw new ProtocolException(400,"revision","Invalid execution revision.");
        while(true)
        {
            cancellation.ThrowIfCancellationRequested();
            Task changed;
            lock(gate)
            {
                var work=Next(id,sessionId,owner);
                var execution=Find(id);
                if(execution.Parent is not null)throw new ProtocolException(400,"stream_root","Work subscriptions must target the root execution.");
                if(afterRevision>execution.Revision)throw new ProtocolException(409,"revision","Execution revision is ahead of the server.");
                if(afterRevision<execution.Revision||Terminal(execution))return work;
                changed=execution.NextChange.Task;
            }
            // Renew a live subscription's lease even while a dialog or server node is running.
            // This timer never emits a network message or starts/repeats a segment.
            try { await changed.WaitAsync(TimeSpan.FromSeconds(10),cancellation).ConfigureAwait(false); }
            catch(TimeoutException) { }
        }
    }
    public ExecutionSnapshot Result(Guid id,string? sessionId,string? owner,BrowserResult result)
    {
        lock(gate)
        {
            SweepCore();var execution=Find(id);Authorize(execution,sessionId,owner);
            ApplyResult(execution,result);
            return Snapshot(execution);
        }
    }
    /// <summary>One authenticated root reconciliation for a bounded batch of completed browser attempts.</summary>
    public BrowserWork Results(Guid id,string? sessionId,string? owner,BrowserResultItem[] results)
    {
        lock(gate)
        {
            SweepCore();var root=Find(id);Authorize(root,sessionId,owner);
            if(root.Parent is not null)throw new ProtocolException(400,"batch_root","Results must target the root execution.");
            if(results.Length is <1 or >256)throw new ProtocolException(400,"batch_size","Expected 1 to 256 results.");
            var descendants=Descendants(root).ToDictionary(item=>item.Id);
            var seen=new HashSet<(Guid,string)>();
            var fingerprints=new Dictionary<(Guid,string),string>();
            foreach(var item in results)
            {
                if(!descendants.TryGetValue(item.ExecutionId,out var execution))throw new ProtocolException(400,"batch_execution","Result belongs to another execution tree.");
                if(!seen.Add((item.ExecutionId,item.Result.SegmentId)))throw new ProtocolException(400,"batch_duplicate","Duplicate segment result.");
                Authorize(execution,sessionId,owner);
                var fingerprint=Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(item.Result,ContractSchemas.JsonOptions)));
                fingerprints[(item.ExecutionId,item.Result.SegmentId)]=fingerprint;
                if(execution.AcceptedResults.TryGetValue(item.Result.SegmentId,out var accepted))
                {
                    if(accepted!=fingerprint)throw new ProtocolException(409,"stale_result","Repeated result differs from the accepted attempt.");
                    continue;
                }
                // A sibling failure can terminate an already-running browser attempt.
                if(!Terminal(execution))ApplyResult(execution,item.Result,validateOnly:true);
            }
            foreach(var item in results)
            {
                var execution=descendants[item.ExecutionId];
                if(!Terminal(execution)&&!execution.AcceptedResults.ContainsKey(item.Result.SegmentId))
                {
                    ApplyResult(execution,item.Result);
                    execution.AcceptedResults[item.Result.SegmentId]=fingerprints[(item.ExecutionId,item.Result.SegmentId)];
                }
            }
            return Next(id,sessionId,owner);
        }
    }
    private void ApplyResult(Execution execution,BrowserResult result,bool validateOnly=false)
    {
            if(Terminal(execution) || !execution.Attempts.TryGetValue(result.SegmentId,out var attempt) || attempt!=result.AttemptId)
                throw new ProtocolException(409,"stale_result","Result does not match the pending segment attempt.");
            var segment=execution.Plan.Segments.Single(segment=>segment.Id==result.SegmentId);
            var invokingNode=segment.NodeIds.Count==1?execution.Plan.Nodes.Single(node=>node.Id==segment.NodeIds[0]):null;
            if(result.Error is null&&invokingNode?.Graph?.Operation=="invoke"&&(!execution.Calls.TryGetValue(invokingNode.Id,out var childCall)||childCall.State!="completed"))
                throw new ProtocolException(409,"invocation_incomplete","A browser graph call cannot finish before its child invocation succeeds.");
            if(result.Error is null&&invokingNode?.Graph is {} graphControl&&GraphControls.IsControl(graphControl.Operation))
            {
                var calls=execution.Calls.Where(pair=>pair.Key.StartsWith(invokingNode.Id+"|",StringComparison.Ordinal)).Select(pair=>pair.Value).ToArray();
                if(calls.Any(child=>!Terminal(child)))throw new ProtocolException(409,"invocation_incomplete","Graph control has running children.");
                if(graphControl.Operation=="while")
                {
                    var lastKey=invokingNode.Id+"|condition:"+(calls.Length/2);
                    if(calls.Length%2!=1||calls.Any(child=>child.State!="completed")||!execution.Calls.TryGetValue(lastKey,out var last)||!last.NativeOutputs.TryGetValue("value",out var value)||value is not false)
                        throw new ProtocolException(409,"invocation_incomplete","While must finish with a false condition.");
                }
                if(graphControl.Operation=="retry")
                {
                    if(calls.Length==0||!execution.Calls.TryGetValue(invokingNode.Id+"|body:"+(calls.Length-1),out var lastAttempt)||lastAttempt.State!="completed"||calls.Where(call=>call!=lastAttempt).Any(call=>call.State!="failed"))throw new ProtocolException(409,"invocation_incomplete","Retry must finish with a successful final attempt.");
                }
                else if(graphControl.Operation=="try")
                {
                    if(!execution.Calls.TryGetValue(invokingNode.Id+"|finally",out var final)||final.State!="completed"||execution.Calls.TryGetValue(invokingNode.Id+"|catch",out var caught)&&caught.State!="completed")
                        throw new ProtocolException(409,"invocation_incomplete","Try must finish its recovery and Finally before returning success.");
                }
                else if(calls.Any(child=>child.State!="completed")||graphControl.Operation is "ifElse" or "switch"&&calls.Length!=1)
                    throw new ProtocolException(409,"invocation_incomplete","Graph control cannot ignore failed or missing calls.");
            }
            if(result.Error is { ExecutionId: {} originId } reportedOrigin && originId!=execution.Id)
            {
                var origins=invokingNode is null?Array.Empty<Execution>():execution.Calls.Where(pair=>pair.Key==invokingNode.Id||pair.Key.StartsWith(invokingNode.Id+"|",StringComparison.Ordinal)).Select(pair=>pair.Value);
                var origin=FindChildFailure(origins,reportedOrigin);
                if(origin is null)throw new ProtocolException(400,"node","Error origin does not match this graph call.");
                result=result with{Error=origin};
            }
            else if(result.Error?.NodeId is {} errorNode && !segment.NodeIds.Contains(errorNode))throw new ProtocolException(400,"node","Error refers to another segment.");
            if(validateOnly)return;
            if(result.Error is {} reported)
            {
                Fail(execution,reported with{Code=reported.Code=="failed"?"browser_failed":reported.Code});return;
            }
            string? nodeId=null;
            try
            {
                var outputs=result.Outputs??new Dictionary<string,JsonElement>();
                var parameters=execution.Plan.Interface.Outputs.Where(parameter=>segment.NodeIds.Contains(parameter.NodeId)).ToArray();
                FlowInterfaces.RequireValues(parameters,outputs,"/outputs",new(execution.Context.Nodes.Types));
                ValidateGraphValues(execution.Bundle,parameters,outputs,execution.BaseCatalog);
                var expected=segment.Outgoing.Where(index=>execution.Plan.Connections[index].Boundary).ToArray();
                if(!expected.Select(index=>index.ToString()).ToHashSet().SetEquals(result.Wires.Keys))
                    throw new InvalidOperationException("Result boundaries do not match the pending segment.");
                foreach(var index in expected)
                {
                    var edge=execution.Plan.Connections[index];nodeId=edge.Target.NodeId;
                    // Validate all received payloads before allowing a later server segment to run.
                    execution.Codecs.Decode(edge.Codec!,result.Wires[index.ToString()],edge.TargetType);
                }
                foreach(var pair in outputs)
                {
                    execution.Outputs.Add(pair.Key,pair.Value.Clone());
                    execution.NativeOutputs.Add(pair.Key,FlowValues.Decode(parameters.Single(p=>p.Name==pair.Key).Type,pair.Value));
                }
                foreach(var pair in result.Wires) execution.Wires[pair.Key]=pair.Value;
                Record(execution,"browser","segment","completed",segment.Id);
                foreach(var index in expected) Boundary(execution,segment,index);
                execution.Completed.Add(segment.Id);execution.Running.Remove(segment.Id);execution.Attempts.Remove(segment.Id);Advance(execution);
            }
            catch(Exception error) {Fail(execution,new("invalid_result",error.Message,nodeId));}
    }
    public ExecutionSnapshot Cancel(Guid id, string? sessionId, string? owner)
    {
        lock(gate)
        {
            var execution=Find(id);Authorize(execution,sessionId,owner);
            if(!Terminal(execution)) Fail(execution,new("cancelled","Execution cancelled.",null));
            return Snapshot(execution);
        }
    }
    public void CloseSession(string id,string? owner)
    {
        lock(gate)
        {
            if(!sessions.TryGetValue(id,out var session)) return;
            if(session.Owner!=owner) throw new ProtocolException(403,"session_owner","Session belongs to another browser.");
            sessions.Remove(id);
            foreach(var execution in executions.Values.Where(item=>item.Session==session && !Terminal(item)))
                Fail(execution,new("session_lost","Browser session was closed.",null));
        }
    }
    public void Sweep() {lock(gate) SweepCore();}
    private void SweepCore()
    {
        foreach(var execution in executions.Values.Where(item=>!Terminal(item)))
        {
            if(execution.Session is {} session && session.Expires<=Now) Fail(execution,new("session_lost","Browser session lease expired.",null));
            else if(execution.State=="waiting_for_browser" && execution.Changed+Lease<=Now) Fail(execution,new("browser_timeout","Browser segment did not return a result in time.",null));
        }
        foreach(var id in sessions.Where(pair=>pair.Value.Expires<=Now).Select(pair=>pair.Key).ToArray()) sessions.Remove(id);
        foreach(var id in executions.Where(pair=>Terminal(pair.Value) && pair.Value.Changed+TimeSpan.FromMinutes(5)<=Now).Select(pair=>pair.Key).ToArray()) executions.Remove(id);
    }
    private Session RequireSession(string? id,string? owner)
    {
        if(id is null || !sessions.TryGetValue(id,out var session) || session.Expires<=Now)
            throw new ProtocolException(409,"session_required","An active browser session is required before starting.");
        if(owner is null || session.Owner!=owner) throw new ProtocolException(403,"session_owner","Session belongs to another browser.");
        session.Expires=Now+Lease;return session;
    }
    private void Authorize(Execution execution,string? id,string? owner)
    {
        if (owner is null || execution.Owner != owner) throw new ProtocolException(403,"execution_owner","Execution belongs to another user.");
        if(execution.Session is not {} session) return;
        if(id!=session.Id || owner is null || owner!=session.Owner) throw new ProtocolException(403,"session_owner","Execution is bound to another browser session.");
        if(!Terminal(execution)) session.Expires=Now+Lease;
    }
    private Execution Find(Guid id) => executions.TryGetValue(id,out var value)?value:throw new ProtocolException(404,"execution","Execution not found.");
    private static bool Terminal(Execution item) => item.State is "completed" or "failed";
    private static ExecutionSnapshot Snapshot(Execution item) => new(item.Id,item.State,item.Error,item.Completed.ToArray(),Descendants(item).SelectMany(current=>current.Events).OrderBy(trace=>trace.Timestamp).ThenBy(trace=>trace.Id,StringComparer.Ordinal).ToArray(),item.State=="completed"?item.Outputs.ToDictionary(p=>p.Key,p=>p.Value.Clone()):new(),item.State=="completed"&&item.Plan.Interface.Control.Output,Descendants(item).Select(Info).ToArray());
    private static T Clone<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value,ContractSchemas.JsonOptions),ContractSchemas.JsonOptions)!;
    private static Dictionary<string,string> Incoming(Execution item,ExecutionSegment segment) => segment.Incoming.Where(index=>item.Plan.Connections[index].Boundary)
        .ToDictionary(index=>index.ToString(),index=>item.Wires[index.ToString()]);
    private static ExecutionFailure? FindChildFailure(IEnumerable<Execution> calls,ExecutionFailure reported)
    {
        foreach(var child in calls)
        {
            if(child.Error is {} error&&error.ExecutionId==reported.ExecutionId&&error.GraphId==reported.GraphId&&error.NodeId==reported.NodeId)return error;
            var nested=FindChildFailure(child.Children,reported);if(nested is not null)return nested;
        }
        return null;
    }
    private static ExecutionFailure? FindOrigin(Exception error)
    {
        for(Exception? current=error;current is not null;current=current.InnerException)
            if(current is FlowExecutionException origin)return origin.Failure;
        return null;
    }
    private void Fail(Execution item,ExecutionFailure error)
    {
        if(Terminal(item))return;
        error=error with {GraphId=error.GraphId??item.Plan.FlowId,ExecutionId=error.ExecutionId??item.Id};
        foreach(var child in item.Children.Where(child=>!Terminal(child)).ToArray())Fail(child,error with{NodeId=null});
        foreach(var segment in item.Plan.Segments.Where(segment=>item.Running.Contains(segment.Id)))
            Record(item,segment.Environment,"segment","failed",segment.Id,message:error.Message);
        Record(item,"server","execution","failed",node:error.NodeId,message:$"{error.Code}: {error.Message}");
        var failedNode=item.Plan.Nodes.FirstOrDefault(node=>node.Id==error.NodeId);
        if(error.Code!="browser_failed")Log(item,failedNode?.Id,error.Code=="cancelled"?"warning":"error",error.Message);
        item.State="failed";item.Error=error;item.Changed=Now;item.Cancellation.Cancel();
        item.Outputs.Clear();item.NativeOutputs.Clear();item.Attempts.Clear();if(item.Busy==0)Release(item);item.Wires.Clear();
    }
    // Short state transitions are serialized; independent ready segments run concurrently.
    private void Advance(Execution item)
    {
        if(Terminal(item))return;
        item.Changed=Now;
        if(item.Completed.Count==item.Plan.Segments.Length)
        {
            item.Context.Nodes.RequireNativeValues(item.Plan.Interface.Outputs,item.NativeOutputs,"/outputs");
            var designationErrors=FlowDesignations.Registry.ValidateOutputs(item.Flow,item.BaseCatalog,item.Outputs);
            if(designationErrors.Count>0){Fail(item,new("designation_output",string.Join("; ",designationErrors.Select(error=>error.Path+": "+error.Message)),null));return;}
            item.State="completed";Record(item,"server","execution","completed",message:"Ausführung abgeschlossen.");
            Release(item);item.Wires.Clear();return;
        }
        foreach(var segment in item.Plan.Segments.Where(segment=>!item.Completed.Contains(segment.Id)&&!item.Running.Contains(segment.Id)&&segment.Dependencies.All(item.Completed.Contains)))
        {
            item.Running.Add(segment.Id);
            if(segment.Environment=="browser")
            {
                item.Attempts.Add(segment.Id,Token());
                Record(item,"browser","segment","waiting",segment.Id,message:"Warten auf Browser-Ausführung.");
            }
            else RunServer(item,segment,Incoming(item,segment));
        }
        item.State=item.Attempts.Count>0?"waiting_for_browser":"running";
    }
    private void RunServer(Execution item,ExecutionSegment segment,Dictionary<string,string> wires)
    {
        item.Busy++;
        Record(item,"server","segment","running",segment.Id);
        var queued=item.Profiling?System.Diagnostics.Stopwatch.GetTimestamp():0;
        _=Task.Run(async () =>
        {
            var started=System.Diagnostics.Stopwatch.GetTimestamp();
            var released=false;
            try
            {
                var result=await item.Runtime.ExecuteAsync(segment.Id,wires,item.Cancellation.Token,onNode:trace=>
                {
                    lock(gate) if(!Terminal(item)) Record(item,"server","node",trace.Status,segment.Id,trace.NodeId,message:trace.Message,duration:trace.DurationMs,profile:trace.Profile);
                },onLog:entry=>{lock(gate)if(!Terminal(item))Log(item,entry.NodeId,entry.Level,entry.Message);},onProfile:item.Profiling?profile=>{lock(gate)if(!Terminal(item))Record(item,"server","profile","segment",segment.Id,duration:profile["totalMs"],profile:profile);}:null);
                var completed=item.Profiling?System.Diagnostics.Stopwatch.GetTimestamp():0;
                lock(gate)
                {
                    if(item.Profiling)Record(item,"server","profile","dispatch",segment.Id,profile:new Dictionary<string,double>{{"queueMs",System.Diagnostics.Stopwatch.GetElapsedTime(queued,started).TotalMilliseconds},{"resultLockMs",System.Diagnostics.Stopwatch.GetElapsedTime(completed).TotalMilliseconds}});
                    item.Busy--;released=true;
                    if(Terminal(item)) {if(item.Busy==0)Release(item);return;}
                    Record(item,"server","segment","completed",segment.Id,duration:System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds);
                    foreach(var index in segment.Outgoing.Where(index=>item.Plan.Connections[index].Boundary)) Boundary(item,segment,index);
                    ValidateGraphValues(item.Bundle,item.Plan.Interface.Outputs.Where(parameter=>segment.NodeIds.Contains(parameter.NodeId)).ToArray(),result.Outputs,item.BaseCatalog);
                    foreach(var pair in result.Outputs)item.Outputs.Add(pair.Key,pair.Value);
                    foreach(var pair in result.NativeOutputs)item.NativeOutputs.Add(pair.Key,pair.Value);
                    foreach(var pair in result.Wires) item.Wires[pair.Key]=pair.Value;
                    item.Completed.Add(segment.Id);item.Running.Remove(segment.Id);Advance(item);
                }
            }
            catch(Exception error)
            {
                lock(gate)
                {
                    if(!released)item.Busy--;
                    if(!Terminal(item)) Fail(item,FindOrigin(error)??(error is SegmentExecutionException segmentError
                        ? new(segmentError.Code,segmentError.Message,segmentError.NodeId) : new("failed",error.Message,null)));
                    else if(item.Busy==0)Release(item);
                }
            }
        });
    }
    private static void Release(Execution item)
    {
        if(item.Released||item.Busy!=0)return;
        // Cancellation can finish a browser parent while a native child is still unwinding.
        if(Descendants(item).Any(child=>child.Busy!=0))return;
        item.Released=true;
        item.Runtime.Dispose();
        var sink=item.LogSink;item.LogSink=null;sink?.Dispose();
        _=CompleteRelease(item);
        if(item.Parent is {} parent&&Terminal(parent))Release(parent);
    }
    private static async Task CompleteRelease(Execution item)
    {
        try{await item.Context.DisposeAsync();item.Completion.TrySetResult(new Dictionary<string,object>(item.NativeOutputs));}
        catch(Exception error){item.Completion.TrySetException(error);}
    }
    private void Log(Execution item,string? node,string level,string message)
    {
        Record(item,"server","log",level,node:node,message:message);
        item.LogSink?.Write(node,level,message);
    }
    private void Record(Execution item,string environment,string kind,string status,string? segment=null,string? node=null,int? connection=null,string? message=null,double? duration=null,IReadOnlyDictionary<string,double>? profile=null)
    {
        item.Events.Add(new($"server-{item.Id}-{item.Events.Count}",Now,environment,kind,status,segment,node,connection,message,duration,item.Plan.FlowId,item.Id,item.Parent?.Id,item.CallNodeId,profile));
        var root=item;while(root.Parent is not null)root=root.Parent;
        var change=root.NextChange;
        root.Revision++;
        root.NextChange=new(TaskCreationOptions.RunContinuationsAsynchronously);
        change.TrySetResult(root.Revision);
        // Delivery never participates in the state transition; polling is authoritative.
        try { changes?.Changed(root.Owner,root.Id); } catch { /* Notification failure must not fail a flow. */ }
    }
    private void Boundary(Execution item,ExecutionSegment segment,int index)
    {
        var edge=item.Plan.Connections[index];
        var target=item.Plan.Nodes.Single(node=>node.Id==edge.Target.NodeId);
        Record(item,segment.Environment,"boundary",segment.Environment=="server"?"ready":"transferred",segment.Id,connection:index,
            message:$"{edge.Source.NodeId}.{edge.Source.Port} → {edge.Target.NodeId}.{edge.Target.Port} · {segment.Environment} → {target.Environment} · {edge.Codec!.TypeId} (Codec v{edge.Codec.Version})");
    }
    public void Dispose() {lock(gate) {foreach(var execution in executions.Values) {if(!Terminal(execution)) Fail(execution,new("cancelled","Host shutting down.",null));else if(execution.Busy==0) Release(execution);}executions.Clear();sessions.Clear();approvedBundles.Clear();approvedOrder.Clear();validationCache.Clear();validationOrder.Clear();preflightCache.Clear();preflightOrder.Clear();preparedPlans.Clear();preparationOrder.Clear();preparationBytes=0;stableCatalog=null;}}
}

public sealed class SessionReaper(Orchestrator coordinator) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromSeconds(1));
        while(await timer.WaitForNextTickAsync(stoppingToken)) coordinator.Sweep();
    }
}
