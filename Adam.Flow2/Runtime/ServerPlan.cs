using Flow.Contracts;

namespace Adam.Flow2.Runtime;

public abstract record InputBinding;
public sealed record StringInput(string Value) : InputBinding;
public sealed record OutputInput(string NodeId, string Port) : InputBinding;
public sealed record NodeStep(string Id, string Type, int Version, IReadOnlyDictionary<string, InputBinding> Inputs, string Environment = "server");
public sealed record ServerPlan(IReadOnlyList<NodeStep> Steps, OutputInput Result, CodecReference? ResultCodec = null);

public static class ServerPlanValidator
{
    // First milestone: an explicitly ordered server segment, not yet a general DAG compiler.
    public static void Validate(ServerPlan plan, NodeRegistry registry, CodecRegistry codecs, CodecCatalog targetCodecs)
    {
        var outputs = new Dictionary<string, IReadOnlyDictionary<string, PortType>>();
        foreach (var step in plan.Steps)
        {
            if (string.IsNullOrWhiteSpace(step.Id) || outputs.ContainsKey(step.Id))
                throw new InvalidOperationException($"Invalid or duplicate node ID: {step.Id}.");
            var definition = registry.Resolve(step.Type, step.Version, step.Environment).Definition;
            if (step.Inputs.Keys.Any(key => !definition.Inputs.ContainsKey(key)) ||
                definition.Inputs.Any(port => port.Value.ContractType.Kind != "optional" && !step.Inputs.ContainsKey(port.Key)))
                throw new InvalidOperationException($"Node {step.Id}: input ports do not match the catalog.");
            foreach (var (port, binding) in step.Inputs)
            {
                var target = definition.Inputs[port];
                if (binding is StringInput literal)
                {
                    if (!registry.IsAssignable(new("string", typeof(string), new("string")), target))
                        throw new InvalidOperationException($"Node {step.Id}.{port}: string is not assignable to {target.Id}.");
                    registry.Validate(target, literal.Value);
                }
                else if (binding is OutputInput reference)
                {
                    var source = Resolve(reference, outputs);
                    if (!registry.IsAssignable(source, target))
                        throw new InvalidOperationException($"Node {step.Id}.{port}: {source.Id} is not assignable to {target.Id}.");
                }
                else throw new InvalidOperationException($"Node {step.Id}.{port}: unsupported binding.");
            }
            outputs.Add(step.Id, definition.Outputs);
        }
        var result = Resolve(plan.Result, outputs);
        var errors = TransportContracts.ValidateBoundary(result.ContractType, result.ContractType, plan.ResultCodec,
            codecs.Catalog, targetCodecs, new TypeRegistry(registry.Types));
        if (errors.Count != 0) throw new ContractException(errors);
    }

    private static PortType Resolve(OutputInput reference,
        Dictionary<string, IReadOnlyDictionary<string, PortType>> outputs) =>
        outputs.TryGetValue(reference.NodeId, out var ports) && ports.TryGetValue(reference.Port, out var type)
            ? type : throw new InvalidOperationException($"Unknown or forward output reference: {reference.NodeId}.{reference.Port}.");
}
