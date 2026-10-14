using Adam.Flow2.Runtime;
using Adam.Flow2.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Adam.Flow2.Hosting;

public sealed record FlowRuntimeContext(
    NodeRegistry Nodes,
    CodecRegistry Codecs,
    FlowExecutionServices? Services = null,
    bool OwnsServices = false) : IAsyncDisposable
{
    public ValueTask DisposeAsync() => OwnsServices && Services is not null
        ? Services.DisposeAsync()
        : ValueTask.CompletedTask;
}

/// <summary>One lazily-created DI scope per root or isolated parallel body, shared by sequential descendants.</summary>
public sealed class FlowExecutionServices(IServiceScopeFactory factory) : IAsyncDisposable
{
    private readonly object gate = new();
    private AsyncServiceScope? scope;
    private bool disposed;

    public IServiceProvider Provider
    {
        get
        {
            lock (gate)
            {
                ObjectDisposedException.ThrowIf(disposed, this);
                scope ??= factory.CreateAsyncScope();
                return scope.Value.ServiceProvider;
            }
        }
    }

    public ValueTask DisposeAsync()
    {
        lock (gate)
        {
            if (disposed) return ValueTask.CompletedTask;
            disposed = true;
            return scope?.DisposeAsync() ?? ValueTask.CompletedTask;
        }
    }
}

public interface IFlowRuntimeFactory
{
    // Metadata creation must not resolve scoped dependencies or instantiate nodes.
    // A stable token promises immutable node/type/codec registrations for this factory version.
    string? PreparationVersion => null;
    FlowRuntimeContext Create();
    FlowRuntimeContext CreateForFlow(FlowDocument flow) => Create();
    FlowRuntimeContext CreateExecutionForFlow(FlowDocument flow, FlowRuntimeContext? parent = null) => CreateExecution(parent);
    // Parallel children own an independent scope while inheriting the trusted run identity.
    FlowRuntimeContext CreateIsolatedExecutionForFlow(FlowDocument flow, FlowRuntimeContext parent) => CreateExecutionForFlow(flow);
    FlowRuntimeContext CreateExecution(FlowRuntimeContext? parent = null) => Create();
}
