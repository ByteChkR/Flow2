using Adam.Flow2.Contracts;
using Adam.Flow2.Nodes;
using Adam.Flow2.Runtime;

namespace Adam.Flow2.Hosting;

/// <summary>Portable built-in nodes. Applications can implement IFlowRuntimeFactory to add scoped business nodes.</summary>
public sealed class StandardFlowRegistry : IFlowRuntimeFactory
{
    private readonly Lazy<FlowRuntimeContext> metadata = new(() => Build(), LazyThreadSafetyMode.ExecutionAndPublication);
    public string PreparationVersion { get; } = Guid.NewGuid().ToString("N");
    public FlowRuntimeContext Create() => CreateCore(null);
    public FlowRuntimeContext CreateForFlow(FlowDocument flow) => CreateCore(flow);
    public FlowRuntimeContext CreateExecution(FlowRuntimeContext? parent = null) => CreateCore(null);
    public FlowRuntimeContext CreateExecutionForFlow(FlowDocument flow, FlowRuntimeContext? parent = null) => CreateCore(flow);
    public FlowRuntimeContext CreateIsolatedExecutionForFlow(FlowDocument flow, FlowRuntimeContext parent) => CreateCore(flow);
    private FlowRuntimeContext CreateCore(FlowDocument? flow)
    {
        var selected = FlowOptimizations.RegistrationFilter ? flow : null;
        if (!FlowOptimizations.RegistryMetadata) return Build(selected);
        return new(metadata.Value.Nodes.ForkMetadata(selected), metadata.Value.Codecs.Fork());
    }
    private static FlowRuntimeContext Build(FlowDocument? flow = null)
    {
        var types = new TypeDocument(1, []);
        var nodes = new NodeRegistry(types);
        if (flow is not null) nodes.LimitRegistrations(flow);
        var codecs = new CodecRegistry(types, "server");
        CommonNodeRegistration.RegisterCommonCodecs(codecs);
        CommonNodeRegistration.RegisterCommonNodes(nodes);
        codecs.RegisterValues(nodes.Catalog);
        return new(nodes, codecs);
    }
}
