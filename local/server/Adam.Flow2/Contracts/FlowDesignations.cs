using System.Text.Json;

namespace Adam.Flow2.Contracts;

public sealed record DesignationPorts(Dictionary<string, TypeRef> Required, bool AllowAdditional);
public sealed record FlowDesignation(string Id, int Version, string Name, string Description,
    string[] Environments, DesignationPorts? Inputs = null, DesignationPorts? Outputs = null,
    string[]? Validators = null);
public sealed record DesignationContext(FlowDocument Flow, FlowInterface Signature, NodeCatalog Catalog);
public sealed record DesignationValidator(string Id, int Version,
    Func<DesignationContext, IReadOnlyList<Diagnostic>>? Validate = null,
    Func<DesignationContext, IReadOnlyDictionary<string, JsonElement>, IReadOnlyList<Diagnostic>>? ValidateInputs = null,
    Func<DesignationContext, IReadOnlyDictionary<string, JsonElement>, IReadOnlyList<Diagnostic>>? ValidateOutputs = null);

/// <summary>Application-owned definitions. Imported graph files cannot register executable validators.</summary>
public sealed class DesignationRegistry
{
    private readonly Dictionary<string, FlowDesignation> definitions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, DesignationValidator> validators = new(StringComparer.Ordinal);
    private readonly object gate = new();
    private static T Clone<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, ContractSchemas.JsonOptions), ContractSchemas.JsonOptions)!;

    public void RegisterValidator(DesignationValidator validator)
    {
        lock (gate)
        {
            if (string.IsNullOrEmpty(validator.Id) || validator.Version < 1 || !validators.TryAdd(validator.Id, validator))
                throw new ArgumentException($"Invalid or duplicate designation validator: {validator.Id}");
        }
    }

    public void Register(FlowDesignation definition)
    {
        lock (gate)
        {
            if (string.IsNullOrEmpty(definition.Id) || definition.Id.Length > 128 || string.IsNullOrEmpty(definition.Name) || definition.Version < 1 || definitions.ContainsKey(definition.Id))
                throw new ArgumentException($"Invalid or duplicate flow designation: {definition.Id}");
            if (definition.Environments.Length == 0 || definition.Environments.Any(value => value is not ("server" or "browser")))
                throw new ArgumentException($"Invalid designation environments: {definition.Id}");
            foreach (var id in definition.Validators ?? [])
                if (!validators.ContainsKey(id)) throw new ArgumentException($"Unknown designation validator: {id}");
            definitions.Add(definition.Id, Clone(definition));
        }
    }

    public FlowDesignation? Get(string id) { lock (gate) return definitions.TryGetValue(id, out var value) ? Clone(value) : null; }
    public FlowDesignation[] List() { lock (gate) return definitions.Values.Select(Clone).ToArray(); }
    public string Fingerprint
    {
        get
        {
            lock (gate) return JsonSerializer.Serialize(new {
                Definitions = definitions.Values.OrderBy(value => value.Id, StringComparer.Ordinal),
                Validators = validators.Values.OrderBy(value => value.Id, StringComparer.Ordinal).Select(value => new { value.Id, value.Version })
            }, ContractSchemas.JsonOptions);
        }
    }

    public IReadOnlyList<Diagnostic> ValidateUse(FlowDocument flow, NodeCatalog catalog,
        string? designation = null, string environment = "server",
        IReadOnlyDictionary<string, JsonElement>? inputs = null,
        IReadOnlyList<FlowDocument>? graphs = null, string[]? allowedEnvironments = null)
    {
        var errors = new List<Diagnostic>();
        if (designation is not null && flow.Designation != designation)
            errors.Add(new("designation_required", "/flow/designation", $"Expected flow designation: {designation}"));
        if (flow.Designation is null && graphs?.Any(graph=>graph.Designation is not null) != true && allowedEnvironments is null) return errors;
        var checkedGraphs = new HashSet<string>();
        void Visit(FlowDocument source, string runtime, string[] inherited, HashSet<string> ancestors, string path, IReadOnlyDictionary<string, JsonElement>? values)
        {
            if (ancestors.Contains(source.Id)) { errors.Add(new("designation_recursion", path, "Recursive graph calls are not supported.")); return; }
            if (ancestors.Count >= 32) { errors.Add(new("designation_depth", path, "Graph invocation depth exceeded.")); return; }
            var key = JsonSerializer.Serialize(new { source.Id, runtime, inherited, values }, ContractSchemas.JsonOptions);
            if (!checkedGraphs.Add(key)) return;
            var current = GraphContracts.MaterializeHybrid(source, runtime);
            errors.AddRange(Validate(current, catalog, values).Select(error => error with { Path = path + error.Path }));
            var own = current.Designation is {} designationId ? Get(designationId)?.Environments : null;
            var allowed = own is null ? inherited : inherited.Intersect(own).ToArray();
            var next = new HashSet<string>(ancestors) { source.Id };
            foreach (var node in current.Nodes)
            {
                if (!allowed.Contains(node.Environment)) errors.Add(new("designation_environment", $"{path}/flow/nodes/{node.Id}", $"Runtime {node.Environment} is not allowed by the calling context."));
                if (node.Graph is null || (node.Graph.Operation != "invoke" && !GraphControls.IsControl(node.Graph.Operation))) continue;
                var slots = GraphControls.IsControl(node.Graph.Operation) ? GraphControls.Slots(node.Graph) : ["graph"];
                var ids = new HashSet<string>();
                if (node.Graph.GraphId is {} targetId) ids.Add(targetId);
                foreach (var edge in current.Connections.Where(edge => edge.Target.NodeId == node.Id && slots.Contains(edge.Target.Port)))
                {
                    var sourceNode = current.Nodes.FirstOrDefault(item => item.Id == edge.Source.NodeId);
                    if (sourceNode?.Graph?.Operation == "reference" && sourceNode.Graph.GraphId is {} referenceId) ids.Add(referenceId);
                    if (sourceNode?.Value?.Operation == "input" && sourceNode.Value.Type.Kind=="graph" && values is not null && sourceNode.Config.TryGetValue("name", out var name) && name.ValueKind == JsonValueKind.String && values.TryGetValue(name.GetString()!, out var value) && value.ValueKind == JsonValueKind.Object && value.TryGetProperty("graphId", out var graphId) && graphId.ValueKind == JsonValueKind.String) ids.Add(graphId.GetString()!);
                }
                foreach (var id in ids)
                {
                    var target = graphs?.FirstOrDefault(item => item.Id == id);
                    if (target is not null) Visit(target, node.Environment, allowed, next, $"{path}/calls/{node.Id}/{id}", null);
                    else errors.Add(new("designation_graph_missing", $"{path}/calls/{node.Id}/{id}", $"Missing graph: {id}"));
                }
            }
        }
        Visit(flow, environment, allowedEnvironments ?? ["server", "browser"], [], "", inputs);
        return errors;
    }

    public IReadOnlyList<Diagnostic> ValidateOutputs(FlowDocument flow, NodeCatalog catalog, IReadOnlyDictionary<string, JsonElement> outputs)
    {
        if(flow.Designation is null)return [];
        var definition=Get(flow.Designation);
        if(definition is null)return [new("designation_unknown","/flow/designation",$"Unknown flow designation: {flow.Designation}")];
        var context=new DesignationContext(flow,FlowInterfaces.Describe(flow,catalog),catalog);
        var errors=new List<Diagnostic>();
        foreach(var id in definition.Validators??[]){DesignationValidator validator;lock(gate)validator=validators[id];errors.AddRange(validator.ValidateOutputs?.Invoke(context,outputs)??[]);}
        return errors;
    }

    public IReadOnlyList<Diagnostic> Validate(FlowDocument flow, NodeCatalog catalog, IReadOnlyDictionary<string, JsonElement>? inputs = null)
    {
        if (flow.Designation is null) return [];
        var definition = Get(flow.Designation);
        if (definition is null) return [new("designation_unknown", "/flow/designation", $"Unknown flow designation: {flow.Designation}")];
        var signature = FlowInterfaces.Describe(flow, catalog);
        var diagnostics = new List<Diagnostic>();
        foreach (var node in flow.Nodes)
            if (!definition.Environments.Contains(node.Environment))
                diagnostics.Add(new("designation_environment", $"/flow/nodes/{node.Id}", $"{definition.Name}: runtime {node.Environment} is not allowed."));
        foreach (var (direction, contract, actualPorts) in new[] { ("inputs", definition.Inputs, signature.Inputs), ("outputs", definition.Outputs, signature.Outputs) })
        {
            if (contract is null) continue;
            foreach (var (name, type) in contract.Required)
            {
                var actual = actualPorts.FirstOrDefault(port => port.Name == name);
                if (actual is null || !TransportContracts.Equivalent(actual.Type, type))
                    diagnostics.Add(new("designation_port", $"/flow/{direction}/{name}", $"{definition.Name}: required port {name} is missing or has an incompatible type."));
            }
            if (!contract.AllowAdditional)
                foreach (var port in actualPorts.Where(port => !contract.Required.ContainsKey(port.Name)))
                    diagnostics.Add(new("designation_extra_port", $"/flow/{direction}/{port.Name}", $"{definition.Name}: additional port {port.Name} is not allowed."));
        }
        var context = new DesignationContext(flow, signature, catalog);
        foreach (var id in definition.Validators ?? [])
        {
            DesignationValidator validator;
            lock (gate) validator = validators[id];
            diagnostics.AddRange(validator.Validate?.Invoke(context) ?? []);
            if (inputs is not null) diagnostics.AddRange(validator.ValidateInputs?.Invoke(context, inputs) ?? []);
        }
        return diagnostics;
    }
}

public static class FlowDesignations
{
    public static DesignationRegistry Registry { get; } = new();
}
