using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Security.Cryptography;
using Adam.Flow2.Contracts;
using Adam.Flow2.Hosting;
using Microsoft.AspNetCore.SignalR;

namespace Adam.Flow2.AspNetCore;

/// <summary>Transport adapter only. Hosts authenticate every operation and configure WebSockets/limits.</summary>
public abstract class FlowExecutionHub(Orchestrator coordinator) : Hub
{
    private const string StateKey = "Flow2.Connection";
    private sealed class ConnectionState(string owner)
    {
        public string Owner { get; } = owner;
        public HashSet<string> Sessions { get; } = [];
        public int Streams;
        public Dictionary<string, Receipt> Receipts { get; } = new();
        public long ReceiptBytes;
    }
    private sealed record Receipt(string Fingerprint, JsonElement Reply);
    protected abstract (string Owner, DateTimeOffset ExpiresAt) Authenticate();
    protected virtual IDisposable? EnterExecutionIdentity(string owner) => null;
    private ConnectionState State => Context.Items.TryGetValue(StateKey, out var state) && state is ConnectionState connection
        ? connection : throw new HubException("Flow2 connection is not authenticated.");

    private (ConnectionState State, DateTimeOffset ExpiresAt) Identity()
    {
        var identity = Authenticate();
        var state = State;
        if (string.IsNullOrEmpty(identity.Owner) || identity.Owner != state.Owner || identity.ExpiresAt <= DateTimeOffset.UtcNow)
            throw new HubException("Flow2 authentication expired or changed.");
        return (state, identity.ExpiresAt);
    }

    public override Task OnConnectedAsync()
    {
        var identity = Authenticate();
        if (string.IsNullOrEmpty(identity.Owner) || identity.ExpiresAt <= DateTimeOffset.UtcNow)
            throw new HubException("Flow2 authentication required.");
        Context.Items[StateKey] = new ConnectionState(identity.Owner);
        return base.OnConnectedAsync();
    }

    private static void RequireSession(ConnectionState state, string session)
    {
        if (!state.Sessions.Contains(session)) throw new ProtocolException(403, "session_owner", "Session does not belong to this connection.");
    }
    private JsonElement Command(string? session, Func<ConnectionState, object?> action)
    {
        var (state, _) = Identity();
        lock (state)
        {
            try
            {
                if (session is not null) RequireSession(state, session);
                using var identity = EnterExecutionIdentity(state.Owner);
                return SerializeBounded(new { ok = true, value = action(state) });
            }
            catch (ProtocolException error) { return Failure(error.Status, error.Code, error.Message); }
            catch (ContractException error) { return JsonSerializer.SerializeToElement(new { ok = false, status = 400, errors = error.Diagnostics }, ContractSchemas.JsonOptions); }
            catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException)
            { return Failure(400, "invalid_request", error.Message); }
        }
    }
    private static JsonElement Failure(int status, string code, string message) =>
        JsonSerializer.SerializeToElement(new { ok = false, status, code, message }, ContractSchemas.JsonOptions);
    private static JsonElement SerializeBounded(object value)
    {
        var result=JsonSerializer.SerializeToElement(value,ContractSchemas.JsonOptions);
        if(System.Text.Encoding.UTF8.GetByteCount(result.GetRawText())>2*1024*1024)
            throw new ProtocolException(413,"reply_limit","Flow2 reply exceeds the transport limit.");
        return result;
    }

    private JsonElement Once(string requestId, string operation, string? session, JsonElement body, Func<JsonElement> action)
    {
        var (state, _) = Identity();
        if (!Guid.TryParseExact(requestId, "D", out var parsedId)) return Failure(400,"request_id","A UUID request ID is required.");
        requestId=parsedId.ToString("D");
        var fingerprint=Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new{operation,session,body},ContractSchemas.JsonOptions)));
        lock(state)
        {
            if(state.Receipts.TryGetValue(requestId,out var previous))
                return previous.Fingerprint==fingerprint?previous.Reply:Failure(409,"request_conflict","Request ID was already used with different content.");
            // Reserve the maximum possible reply before executing an operation with effects.
            if(state.Receipts.Count>=512||state.ReceiptBytes>7*1024*1024)
                return Failure(429,"receipt_limit","Request receipt capacity reached. Open a new connection after active runs complete.");
            var reply=action();
            var bytes=System.Text.Encoding.UTF8.GetByteCount(reply.GetRawText());
            if(bytes>1024*1024)
            {
                reply=Failure(413,"reply_limit","Operation reply exceeds the transport limit. Close this session; do not restart the action automatically.");
                bytes=System.Text.Encoding.UTF8.GetByteCount(reply.GetRawText());
            }
            // No eviction while the connection lives: an old request must never become a new action.
            state.Receipts.Add(requestId,new(fingerprint,reply));state.ReceiptBytes+=bytes;
            return reply;
        }
    }

    public JsonElement Hello()
    {
        var (_, expiresAt) = Identity();
        return JsonSerializer.SerializeToElement(new { protocolVersion = 1, transport = "signalr", expiresAt, maxSessions = 8 }, ContractSchemas.JsonOptions);
    }

    public JsonElement OpenSession(string requestId, JsonElement body) => Once(requestId,"openSession",null,body,()=>Command(null, state =>
    {
        if (state.Sessions.Count >= 8) throw new ProtocolException(429, "session_limit", "At most eight sessions per connection.");
        var value = JsonSerializer.SerializeToElement(new FlowExecutionProtocol(coordinator).OpenSession(body, state.Owner), ContractSchemas.JsonOptions);
        state.Sessions.Add(value.GetProperty("sessionId").GetString()!);
        return value;
    }));
    public JsonElement Start(string requestId, string session, JsonElement body) => Once(requestId,"start",session,body,()=>Command(session, state =>
    {
        if (!body.TryGetProperty("sessionId", out var supplied) || supplied.GetString() != session)
            throw new ProtocolException(400, "session", "Start session does not match its connection.");
        return new FlowExecutionProtocol(coordinator).Start(body, state.Owner);
    }));
    public JsonElement Results(string session, Guid executionId, JsonElement body) => Command(session, state =>
        new FlowExecutionProtocol(coordinator).Results(executionId, session, state.Owner, body));
    public JsonElement Invoke(string requestId, string session, Guid executionId, JsonElement body) => Once(requestId,"invoke/"+executionId,session,body,()=>Command(session, state =>
        new FlowExecutionProtocol(coordinator).Invoke(executionId, session, state.Owner, body)));
    public JsonElement Cancel(string session, Guid executionId) => Command(session, state => coordinator.Cancel(executionId, session, state.Owner));
    public JsonElement CloseSession(string session) => Command(session, state =>
    {
        coordinator.CloseSession(session, state.Owner);
        state.Sessions.Remove(session);
        return null;
    });

    public async IAsyncEnumerable<JsonElement> Watch(string session, Guid executionId, long afterRevision,
        [EnumeratorCancellation] CancellationToken cancellation)
    {
        var (state, expiresAt) = Identity();
        lock (state)
        {
            RequireSession(state, session);
            if (state.Streams >= 8) throw new HubException("Flow2 stream limit reached.");
            state.Streams++;
        }
        try
        {
            using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellation, Context.ConnectionAborted);
            var remaining = expiresAt - DateTimeOffset.UtcNow;
            if (remaining <= TimeSpan.Zero) throw new HubException("Flow2 authentication expired.");
            lifetime.CancelAfter(remaining);
            while (true)
            {
                var work = await coordinator.WaitForWorkAsync(executionId, session, state.Owner, afterRevision, lifetime.Token);
                yield return SerializeBounded(work);
                if (work.Execution.State is "completed" or "failed") yield break;
                afterRevision = work.Revision;
            }
        }
        finally { lock (state) state.Streams--; }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue(StateKey, out var value) && value is ConnectionState state)
        {
            lock (state)
            {
                foreach (var session in state.Sessions)
                    try { coordinator.CloseSession(session, state.Owner); } catch (ProtocolException) { }
                state.Sessions.Clear();
                state.Receipts.Clear();state.ReceiptBytes=0;
            }
        }
        await base.OnDisconnectedAsync(exception);
    }
}
