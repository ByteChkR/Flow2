using Adam.Flow2.Runtime;
using System.Security.Cryptography;
using System.Text.Json;
using Flow.Contracts;
using Flow.Nodes.Server;
using Flow.Runtime.Jint;

namespace Flow.Api;

public sealed class ProtocolException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}
public sealed record ExecutionFailure(string Code, string Message, string? NodeId);
public sealed record ExecutionSnapshot(Guid ExecutionId, string State, ExecutionFailure? Error, string[] CompletedSegments, ExecutionTrace[] Events);
public sealed record BrowserWork(ExecutionSnapshot Execution, ExecutionSegment? Segment, string? AttemptId, Dictionary<string,string>? Wires);
public sealed record BrowserResult(string SegmentId, string AttemptId, Dictionary<string,string> Wires, ExecutionFailure? Error = null);

/// <summary>In-memory PoC coordinator. All transitions are serialized; native runtime contexts never leave this process.</summary>
public sealed class Orchestrator(TimeProvider clock) : IDisposable
{
    public static readonly TimeSpan Lease = TimeSpan.FromSeconds(30);
    private readonly object gate = new();
    private readonly Dictionary<string, Session> sessions = new();
    private readonly Dictionary<Guid, Execution> executions = new();
    private sealed record Session(string Id, string Owner, NodeCatalog Nodes, CodecCatalog Codecs)
    {
        public DateTimeOffset Expires { get; set; }
    }
    private sealed class Execution(Guid id, Session? session, CompiledExecution runtime, Adam.Flow2.Runtime.CodecRegistry codecs, DateTimeOffset now)
    {
        public Guid Id { get; } = id;
        public Session? Session { get; } = session;
        public CompiledExecution Runtime { get; } = runtime;
        public Adam.Flow2.Runtime.CodecRegistry Codecs { get; } = codecs;
        public ExecutionPlan Plan { get; } = runtime.Plan;
        public string State { get; set; } = "created";
        public int Index { get; set; }
        public Dictionary<string,string> Wires { get; } = new();
        public List<string> Completed { get; } = [];
        public List<ExecutionTrace> Events { get; } = [];
        public ExecutionFailure? Error { get; set; }
        public string? Attempt { get; set; }
        public DateTimeOffset Changed { get; set; } = now;
    }
    private static string Token() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private DateTimeOffset Now => clock.GetUtcNow();

    public string CreateSession(string owner, NodeCatalog nodes, CodecCatalog codecs)
    {
        lock(gate)
        {
            SweepCore();
            var demo = new ContactDemo();
            var errors = ContractSchemas.Validate("catalog",JsonSerializer.SerializeToElement(nodes,ContractSchemas.JsonOptions))
                .Concat(TransportContracts.ValidateCatalog(codecs,new TypeRegistry(demo.Registry.Types))).ToArray();
            if(errors.Length!=0) throw new ContractException(errors);
            if(codecs.Environment!="browser" || nodes.Nodes.Any(node=>node.Environments.Any(env=>env!="browser")))
                throw new ProtocolException(400,"environment","Expected browser capabilities.");
            // Freeze declarations for this session; a later request cannot substitute capabilities.
            var frozenNodes=JsonSerializer.Deserialize<NodeCatalog>(JsonSerializer.Serialize(nodes,ContractSchemas.JsonOptions),ContractSchemas.JsonOptions)!;
            var frozenCodecs=JsonSerializer.Deserialize<CodecCatalog>(JsonSerializer.Serialize(codecs,ContractSchemas.JsonOptions),ContractSchemas.JsonOptions)!;
            var id=Token();sessions.Add(id,new(id,owner,frozenNodes,frozenCodecs){Expires=Now+Lease});return id;
        }
    }
    public ExecutionSnapshot Start(FlowDocument flow, string? sessionId, string? owner)
    {
        lock(gate)
        {
            SweepCore();
            // Binding is required before compilation or any server node is invoked, even for server-first interactive flows.
            Session? session=null;
            if(flow.Mode=="interactive") session=RequireSession(sessionId,owner);
            var demo=new ContactDemo(); RegisterInput(demo);
            var codecs=DemoCodecs.Create(demo.Registry.Types);
            var id=Guid.NewGuid();
            var runtime=new CompiledExecution(id,flow,session?.Nodes ?? new(1,[]),session?.Codecs ?? new(1,"browser",[]),demo.Registry,codecs);
            var execution=new Execution(id,session,runtime,codecs,Now);
            executions.Add(id,execution);
            if(session is not null) Record(execution,"browser","session","bound",message:"Browser-Session gebunden.");
            Record(execution,"server","execution","running",message:"Ausführung gestartet.");
            Advance(execution);return Snapshot(execution);
        }
    }
    public BrowserWork Next(Guid id,string? sessionId,string? owner)
    {
        lock(gate)
        {
            SweepCore();var execution=Find(id);Authorize(execution,sessionId,owner);
            if(execution.State!="waiting_for_browser") return new(Snapshot(execution),null,null,null);
            var segment=execution.Plan.Segments[execution.Index];
            return new(Snapshot(execution),Clone(segment),execution.Attempt,Incoming(execution,segment));
        }
    }
    public ExecutionSnapshot Result(Guid id,string? sessionId,string? owner,BrowserResult result)
    {
        lock(gate)
        {
            SweepCore();var execution=Find(id);Authorize(execution,sessionId,owner);
            if(execution.State!="waiting_for_browser" || execution.Plan.Segments[execution.Index].Id!=result.SegmentId || execution.Attempt!=result.AttemptId)
                throw new ProtocolException(409,"stale_result","Result does not match the pending segment attempt.");
            var segment=execution.Plan.Segments[execution.Index];
            if(result.Error is {} reported)
            {
                if(reported.NodeId is not null && !segment.NodeIds.Contains(reported.NodeId)) throw new ProtocolException(400,"node","Error refers to another segment.");
                Fail(execution,new("browser_failed",reported.Message,reported.NodeId));return Snapshot(execution);
            }
            string? nodeId=null;
            try
            {
                var expected=segment.Outgoing.Where(index=>execution.Plan.Connections[index].Boundary).ToArray();
                if(!expected.Select(index=>index.ToString()).ToHashSet().SetEquals(result.Wires.Keys))
                    throw new InvalidOperationException("Result boundaries do not match the pending segment.");
                foreach(var index in expected)
                {
                    var edge=execution.Plan.Connections[index];nodeId=edge.Target.NodeId;
                    // Validate all received payloads before allowing a later server segment to run.
                    execution.Codecs.Decode(edge.Codec!,result.Wires[index.ToString()],edge.TargetType);
                }
                foreach(var pair in result.Wires) execution.Wires[pair.Key]=pair.Value;
                Record(execution,"browser","segment","completed",segment.Id);
                foreach(var index in expected) Boundary(execution,segment,index);
                execution.Completed.Add(segment.Id);execution.Index++;Advance(execution);
            }
            catch(Exception error) {Fail(execution,new("invalid_result",error.Message,nodeId));}
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
        if(execution.Session is not {} session) return;
        if(id!=session.Id || owner is null || owner!=session.Owner) throw new ProtocolException(403,"session_owner","Execution is bound to another browser session.");
        if(!Terminal(execution)) session.Expires=Now+Lease;
    }
    private Execution Find(Guid id) => executions.TryGetValue(id,out var value)?value:throw new ProtocolException(404,"execution","Execution not found.");
    private static bool Terminal(Execution item) => item.State is "completed" or "failed";
    private static ExecutionSnapshot Snapshot(Execution item) => new(item.Id,item.State,item.Error,item.Completed.ToArray(),item.Events.ToArray());
    private static T Clone<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value,ContractSchemas.JsonOptions),ContractSchemas.JsonOptions)!;
    private static Dictionary<string,string> Incoming(Execution item,ExecutionSegment segment) => segment.Incoming.Where(index=>item.Plan.Connections[index].Boundary)
        .ToDictionary(index=>index.ToString(),index=>item.Wires[index.ToString()]);
    private void Fail(Execution item,ExecutionFailure error) {
        if(item.Index<item.Plan.Segments.Length)
        {
            var segment=item.Plan.Segments[item.Index];
            Record(item,segment.Environment,"segment","failed",segment.Id,message:error.Message);
        }
        Record(item,"server","execution","failed",item.Index<item.Plan.Segments.Length?item.Plan.Segments[item.Index].Id:null,error.NodeId,message:$"{error.Code}: {error.Message}");
        item.State="failed";item.Error=error;item.Changed=Now;item.Runtime.Dispose();item.Wires.Clear();}
    private void Advance(Execution item)
    {
        item.State="running";item.Changed=Now;
        try
        {
            while(item.Index<item.Plan.Segments.Length)
            {
                var segment=item.Plan.Segments[item.Index];
                if(segment.Environment=="browser") {item.State="waiting_for_browser";item.Attempt=Token();item.Changed=Now;Record(item,"browser","segment","waiting",segment.Id,message:"Warten auf Browser-Ausführung.");return;}
                Record(item,"server","segment","running",segment.Id);
                var started=System.Diagnostics.Stopwatch.GetTimestamp();
                var result=item.Runtime.Execute(segment.Id,Incoming(item,segment),onNode:trace=>
                    Record(item,"server","node",trace.Status,segment.Id,trace.NodeId,message:trace.Message,duration:trace.DurationMs));
                Record(item,"server","segment","completed",segment.Id,duration:System.Diagnostics.Stopwatch.GetElapsedTime(started).TotalMilliseconds);
                foreach(var index in segment.Outgoing.Where(index=>item.Plan.Connections[index].Boundary)) Boundary(item,segment,index);
                foreach(var pair in result.Wires) item.Wires[pair.Key]=pair.Value;
                item.Completed.Add(segment.Id);item.Index++;
            }
            item.State="completed";Record(item,"server","execution","completed",message:"Ausführung abgeschlossen.");item.Changed=Now;item.Runtime.Dispose();item.Wires.Clear();
        }
        catch(SegmentExecutionException error) {Fail(item,new(error.Code,error.Message,error.NodeId));}
    }
    private void Record(Execution item,string environment,string kind,string status,string? segment=null,string? node=null,int? connection=null,string? message=null,double? duration=null)
        => item.Events.Add(new($"server-{item.Events.Count}",Now,environment,kind,status,segment,node,connection,message,duration));
    private void Boundary(Execution item,ExecutionSegment segment,int index)
    {
        var edge=item.Plan.Connections[index];
        var target=item.Plan.Nodes.Single(node=>node.Id==edge.Target.NodeId);
        Record(item,segment.Environment,"boundary",segment.Environment=="server"?"ready":"transferred",segment.Id,connection:index,
            message:$"{edge.Source.NodeId}.{edge.Source.Port} → {edge.Target.NodeId}.{edge.Target.Port} · {segment.Environment} → {target.Environment} · {edge.Codec!.TypeId} (Codec v{edge.Codec.Version})");
    }
    public static void RegisterInput(ContactDemo demo) => demo.Registry.Register<ContactIdNode>();
    public void Dispose() {lock(gate) {foreach(var execution in executions.Values) execution.Runtime.Dispose();executions.Clear();sessions.Clear();}}
}

public sealed class SessionReaper(Orchestrator coordinator) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer=new PeriodicTimer(TimeSpan.FromSeconds(1));
        while(await timer.WaitForNextTickAsync(stoppingToken)) coordinator.Sweep();
    }
}
