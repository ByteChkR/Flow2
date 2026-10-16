using System.Text.Json;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

// The shared type describes the contract; CLR adapters stay server-local.
public sealed record PortType(string Id, Type ClrType, TypeRef ContractType, bool Dynamic = false)
{
    private static bool AcceptsNull(TypeRef type) => type.Kind is "nullable" or "null" || type.Kind == "optional" && AcceptsNull(type.Inner!);
    public void Validate(object value)
    {
        if (value is null && AcceptsNull(ContractType)) return;
        if (!ClrType.IsInstanceOfType(value))
            throw new InvalidOperationException($"Expected {Id}, received {value?.GetType().Name ?? "null"}.");
    }
}

public sealed record NodeDefinition(string Type, int Version,
    IReadOnlyDictionary<string, PortType> Inputs, IReadOnlyDictionary<string, PortType> Outputs,
    NodeMetadata? Metadata = null, Dictionary<string, ConfigField>? Config = null, ControlFlow? Control = null, string? FlowPort = null, GraphNodeBinding? Graph = null, QueryNodeBinding? Query = null, ValueNodeBinding? Value = null, string? NodeId = null, EfNodeBinding? Ef = null)
{
    public Adam.Flow2.Contracts.NodeDefinition ToContract() => new(Type, Version, ["server"],
        Inputs.ToDictionary(p => p.Key, p => p.Value.ContractType), Outputs.ToDictionary(p => p.Key, p => p.Value.ContractType), Metadata, Config, Control, FlowPort, Graph, Query, Value, NodeId, Ef);
}

public sealed record RegisteredNode(NodeDefinition Definition,
    Func<IReadOnlyDictionary<string, object>, IReadOnlyDictionary<string, object>> Execute,
    Func<IReadOnlyDictionary<string, object>, IReadOnlyDictionary<string, JsonElement>, IReadOnlyDictionary<string, object>>? ExecuteConfigured = null,
    Func<IReadOnlyDictionary<string, object>, IReadOnlyDictionary<string, JsonElement>, CancellationToken, ValueTask<IReadOnlyDictionary<string, object>>>? ExecuteAsync = null,
    Func<IReadOnlyDictionary<string, object>, IReadOnlyDictionary<string, JsonElement>, CancellationToken, FlowNodeContext, ValueTask<IReadOnlyDictionary<string, object>>>? ExecuteWithContextAsync = null,
    Action<IReadOnlyDictionary<string, JsonElement>>? ValidateConfiguration = null);

public sealed class NodeRegistry
{
    private readonly Dictionary<(string Type, int Version, string Environment, string? NodeId), RegisteredNode> nodes = new();
    private readonly TypeDocument types;
    private readonly TypeRegistry typeRegistry;
    private readonly Func<IServiceProvider>? services;
    private readonly Dictionary<string, Type> entities = new();
    private readonly Dictionary<string,Type> queryElements = new();

    public NodeRegistry(TypeDocument? types = null, Func<IServiceProvider>? services = null)
    {
        this.services = services;
        this.types = Clone(types ?? new(1, []));
        typeRegistry = new(this.types);
    }

    // Only share our privately owned, already validated type snapshot. Public getters
    // return defensive copies; nodes, CLR mappings and service delegates stay isolated.
    private NodeRegistry(TypeDocument frozenTypes, TypeRegistry validatedTypes, Func<IServiceProvider>? services = null)
    {
        types = frozenTypes;
        typeRegistry = validatedTypes;
        this.services = services;
    }
    public NodeRegistry ForkEmptyMetadata() => new(types, typeRegistry);
    /// <summary>Fresh registrations and service binding; only frozen type metadata is shared.</summary>
    public NodeRegistry ForkEmptyExecution(Func<IServiceProvider>? services = null) => new(types, typeRegistry, services);
    public IReadOnlyList<Diagnostic> ValidateCodecs(CodecCatalog codecs) => TransportContracts.ValidateCatalog(codecs, typeRegistry);
    internal TypeRegistry ValidatedTypes => typeRegistry;

    internal IServiceProvider ExecutionServices() => services?.Invoke()
        ?? throw new InvalidOperationException("DI nodes require an execution service scope. Metadata registries cannot execute them.");

    private static T Clone<T>(T value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, ContractSchemas.JsonOptions), ContractSchemas.JsonOptions)!;
    public TypeDocument Types => Clone(types);
    public EntityDefinition GetEntityDefinition(string id) => Clone(types.Types.Single(type => type.Id == id));
    public IReadOnlyDictionary<string,Type> EntityTypes => new Dictionary<string,Type>(entities);
    public Func<string,object,object,bool>? EntityEquals { get; set; }
    public Func<string,object,uint>? EntityHash { get; set; }
    public Func<FlowNode,RegisteredNode>? EfFactory { private get; set; }
    public Func<FlowNode,RegisteredNode>? QueryFactory { private get; set; }
    public Func<FlowNode,RegisteredNode>? TemplateFactory { private get; set; }
    public void PrepareQueries(FlowDocument flow, CodecRegistry codecs)
    {
        foreach(var node in flow.Nodes.Where(node=>node.Ef is not null))
        {
            if(nodes.ContainsKey((node.Type,node.TypeVersion,"server",node.Id)))continue;
            Register((EfFactory??throw new InvalidOperationException("EF execution is unavailable."))(node));
        }
        foreach(var node in flow.Nodes.Where(node => node.Query is not null))
        {
            var definition = QueryNodes.Definition(node);
            if(nodes.TryGetValue((node.Type,node.TypeVersion,"server",node.Id),out var existing))
            {
                if(!TransportContracts.Equivalent(existing.Definition.ToContract(),definition))throw new InvalidOperationException("Conflicting query specialization.");
                continue;
            }
            Register((QueryFactory ?? throw new InvalidOperationException("Query execution is not registered."))(node));
        }
        foreach(var node in flow.Nodes.Where(node => TemplateNodes.Operation(node.Type) is not null))
        {
            var parameters = TemplateNodes.ParameterType(node);
            if(!codecs.Catalog.Codecs.Any(codec=>TransportContracts.Equivalent(codec.ValueType,parameters)))codecs.RegisterValue(parameters);
            var expected = TemplateNodes.Definition(node.Type, parameters) with {NodeId=node.Id};
            if(nodes.TryGetValue((node.Type,node.TypeVersion,"server",node.Id),out var existing))
            {
                if(!TransportContracts.Equivalent(existing.Definition.ToContract(), expected))throw new InvalidOperationException("Conflicting template specialization.");
            }
            else Register((TemplateFactory ?? throw new InvalidOperationException("Template service is not registered."))(node));
        }
        codecs.RegisterValues(Catalog);
    }
    public NodeCatalog Catalog => Clone(new NodeCatalog(1, nodes.Values.Select(n => n.Definition.ToContract()).ToArray()));

    private HashSet<string>? registrationFilter;
    private HashSet<string> specializedTypes=[];
    public bool Wants(string type) => registrationFilter is null || registrationFilter.Contains(type);
    public void LimitRegistrations(FlowDocument flow){registrationFilter = flow.Nodes.Select(node => node.Type).ToHashSet(StringComparer.Ordinal);specializedTypes=flow.Nodes.Where(n=>n.Value is not null||n.Query is not null||n.Ef is not null||n.Graph is not null||TemplateNodes.Operation(n.Type) is not null).Select(n=>n.Type).ToHashSet(StringComparer.Ordinal);}

    // Fork metadata and CLR mappings, never an execution scope. Delegates in a metadata fork
    // are for validation only; execution factories bind their own service-dependent delegates.
    public NodeRegistry ForkMetadata(FlowDocument? flow = null)
    {
        var fork = ForkEmptyMetadata();
        fork.CopyNativeMappings(this);
        foreach (var (key, node) in nodes)
        {
            if (flow is not null && !flow.Nodes.Any(item => item.Type == key.Type && item.TypeVersion == key.Version && (key.NodeId is null || key.NodeId==item.Id))) continue;
            var contract = Clone(node.Definition.ToContract());
            fork.nodes.Add(key, node with { Definition = node.Definition with {
                Inputs = node.Definition.Inputs.ToDictionary(p => p.Key, p => p.Value with { ContractType = contract.Inputs[p.Key] }),
                Outputs = node.Definition.Outputs.ToDictionary(p => p.Key, p => p.Value with { ContractType = contract.Outputs[p.Key] }),
                Metadata = contract.Metadata, Config = contract.Config, Control = contract.Control,
                Graph = contract.Graph, Query = contract.Query, Value = contract.Value, Ef=contract.Ef
            }});
        }
        return fork;
    }
    public void CopyNativeMappings(NodeRegistry source)
    {
        foreach (var pair in source.entities) entities[pair.Key] = pair.Value;
        foreach (var pair in source.queryElements) queryElements[pair.Key] = pair.Value;
    }

    public void Register(RegisteredNode node)
    {
        if (!Wants(node.Definition.Type)||node.Definition.NodeId is null&&specializedTypes.Contains(node.Definition.Type)) return;
        var metadata = NodeDescriptions.Describe(node.Definition.ToContract());
        var errors = ContractSchemas.Validate("catalog", JsonSerializer.SerializeToElement(new NodeCatalog(1, [metadata]), ContractSchemas.JsonOptions)).ToList();
        if (errors.Count != 0) throw new ContractException(errors);
        errors.AddRange(NodeAuthoringContracts.Validate(metadata));
        foreach (var type in metadata.Inputs.Values.Concat(metadata.Outputs.Values)) errors.AddRange(typeRegistry.Check(type));
        if (errors.Count != 0) throw new ContractException(errors);
        var definition = node.Definition with
        {
            Metadata = metadata.Metadata is null ? null : Clone(metadata.Metadata),
            Config = metadata.Config is null ? null : Clone(metadata.Config),
            Inputs = node.Definition.Inputs.ToDictionary(p => p.Key, p => p.Value with { ContractType = Clone(p.Value.ContractType) }),
            Outputs = node.Definition.Outputs.ToDictionary(p => p.Key, p => p.Value with { ContractType = Clone(p.Value.ContractType) })
        };
        foreach (var port in definition.Inputs.Values.Concat(definition.Outputs.Values))
            if (!port.Dynamic) CollectEntityTypes(port.ContractType, port.ClrType);
        nodes.Add((definition.Type, definition.Version, "server", definition.NodeId), node with { Definition = definition });
    }

    public void DecorateExecutors(Func<RegisteredNode, RegisteredNode> decorate)
    {
        foreach(var key in nodes.Keys.ToArray()) nodes[key] = decorate(nodes[key]);
    }

    public RegisteredNode Resolve(string type, int version, string environment = "server", string? nodeId = null) =>
        (nodes.TryGetValue((type, version, environment, nodeId), out var node) || nodes.TryGetValue((type, version, environment, null), out node))
            ? node : nodeId is null && nodes.Values.Where(n=>n.Definition.Type==type&&n.Definition.Version==version).Take(2).ToArray() is [var single] ? single : throw new InvalidOperationException($"Unknown node: {type}@{version} in {environment}.");

    public void ValidatePorts(IReadOnlyDictionary<string, PortType> ports, IReadOnlyDictionary<string, object> values)
    {
        if (values.Keys.Any(key => !ports.ContainsKey(key))) throw new InvalidOperationException("Node output ports do not match the catalog.");
        foreach (var (port, type) in ports)
        {
            if (values.TryGetValue(port, out var value)) Validate(type, value);
            else if (type.ContractType.Kind != "optional") throw new InvalidOperationException($"Missing required port {port}.");
        }
    }

    public bool IsAssignable(PortType source, PortType target) =>
        (source.Dynamic || target.ClrType.IsAssignableFrom(source.ClrType)) && typeRegistry.IsAssignable(source.ContractType, target.ContractType);

    /// <summary>Apply a declared CLR adapter after a wire or dynamic graph port, retaining already-native instances.</summary>
    public object Adapt(PortType type, object value)
    {
        if (value is null || type.ClrType.IsInstanceOfType(value)) { Validate(type,value!); return value!; }
        if (!TransportContracts.IsTransportable(type.ContractType)) throw new InvalidOperationException("Native entity adapters cannot serialize values.");
        ValidateNative(type.ContractType,value);
        var adapted=FlowValues.Decode(type.ContractType,FlowValues.Encode(type.ContractType,value),type.ClrType);
        Validate(type,adapted);
        return adapted;
    }

    public void Validate(PortType type, object value)
    {
        type.Validate(value);
        ValidateNative(type.ContractType, value);
    }

    public void RegisterEntity<T>(string name) where T : class => RegisterEntity(name, typeof(T));
    private void RegisterEntity(string name, Type type)
    {
        if (typeRegistry.Check(new("entity", Name: name)).Count != 0) throw new InvalidOperationException($"Unknown entity {name}.");
        if (entities.TryGetValue(name, out var previous) && previous != type) throw new InvalidOperationException($"Conflicting CLR mappings for {name}.");
        entities[name] = type;
    }
    private void CollectEntityTypes(TypeRef type, Type native)
    {
        if(type.Kind=="grouping")
        {
            var grouping=native.GetInterfaces().Append(native).FirstOrDefault(item=>item.IsGenericType&&item.GetGenericTypeDefinition()==typeof(IGrouping<,>))
                ??throw new InvalidOperationException("Grouping port requires IGrouping<TKey,TElement>.");
            var arguments=grouping.GetGenericArguments();
            queryElements[JsonSerializer.Serialize(type,ContractSchemas.JsonOptions)]=grouping;
            queryElements[JsonSerializer.Serialize(type.Items,ContractSchemas.JsonOptions)]=arguments[1];
            CollectEntityTypes(type.Key!,arguments[0]);CollectEntityTypes(type.Items!,arguments[1]);return;
        }
        if(type.Kind=="enumerable")
        {
            var element=native.GetInterfaces().Append(native).First(item=>item.IsGenericType&&item.GetGenericTypeDefinition()==typeof(IEnumerable<>)).GetGenericArguments()[0];
            queryElements[JsonSerializer.Serialize(type.Items,ContractSchemas.JsonOptions)]=element;
            CollectEntityTypes(type.Items!,element);return;
        }
        if(type.Kind is "queryable" or "orderedQueryable")
        {
            var element=native.GetInterfaces().Append(native).FirstOrDefault(item=>item.IsGenericType&&item.GetGenericTypeDefinition()==typeof(IQueryable<>))?.GetGenericArguments()[0]
                ?? throw new InvalidOperationException("Queryable ports require IQueryable<T>.");
            var key=JsonSerializer.Serialize(type.Items,ContractSchemas.JsonOptions);
            if(queryElements.TryGetValue(key,out var previous)&&previous!=element)throw new InvalidOperationException("Conflicting query element CLR types.");
            queryElements[key]=element;
            CollectEntityTypes(type.Items!,element);
        }
        else if (type.Kind == "entity" && native != typeof(object)) RegisterEntity(type.Name!, native);
        else if (type.Kind is "nullable" or "optional") CollectEntityTypes(type.Inner!, Nullable.GetUnderlyingType(native) ?? native);
        else if (type.Kind == "array")
        {
            var element = native.IsArray ? native.GetElementType() : native.GetInterfaces().Append(native)
                .FirstOrDefault(item => item.IsGenericType && item.GetGenericTypeDefinition() == typeof(IEnumerable<>))?.GetGenericArguments()[0];
            if (element is not null) CollectEntityTypes(type.Items!, element);
        }
    }

    public void RequireNativeValues(FlowParameter[] parameters, IReadOnlyDictionary<string, object> values, string path = "/inputs")
    {
        foreach (var parameter in parameters)
        {
            if (values.TryGetValue(parameter.Name, out var value)) ValidateNative(parameter.Type, value, $"{path}/{parameter.Name}");
            else if (parameter.Type.Kind != "optional") throw new InvalidOperationException($"{path}/{parameter.Name}: missing required value.");
        }
        if (values.Keys.Any(name => !parameters.Any(parameter => parameter.Name == name))) throw new InvalidOperationException($"{path}: unknown flow parameter.");
    }

    // Validation must never serialize entities or replace native object identities.
    public void ValidateNative(TypeRef type, object? value, string path = "")
    {
        var unknown = typeRegistry.Check(type, path);
        if (unknown.Count != 0) throw new ContractException(unknown);
        if (type.Kind == "optional") { ValidateNative(type.Inner!, value, path); return; }
        if (type.Kind == "nullable") { if (value is not null) ValidateNative(type.Inner!, value, path); return; }
        if(type.Kind=="grouping")
        {
            if(!queryElements.TryGetValue(JsonSerializer.Serialize(type,ContractSchemas.JsonOptions),out var grouping)||!grouping.IsInstanceOfType(value))throw new InvalidOperationException($"{path}: expected registered grouping type.");
            return;
        }
        if(type.Kind=="enumerable")
        {
            if(!queryElements.TryGetValue(JsonSerializer.Serialize(type.Items,ContractSchemas.JsonOptions),out var element)||!typeof(IEnumerable<>).MakeGenericType(element).IsInstanceOfType(value))throw new InvalidOperationException($"{path}: expected registered enumerable element type.");
            return;
        }
        if(type.Kind is "queryable" or "orderedQueryable")
        {
            var key=JsonSerializer.Serialize(type.Items,ContractSchemas.JsonOptions);
            if(value is not IQueryable query||!queryElements.TryGetValue(key,out var element)||query.ElementType!=element)
                throw new InvalidOperationException($"{path}: expected registered IQueryable element type.");
            if(type.Kind=="orderedQueryable" && !typeof(IOrderedQueryable<>).MakeGenericType(element).IsInstanceOfType(value))
                throw new InvalidOperationException($"{path}: expected an ordered query.");
            return; // Never enumerate, invoke a provider, or inspect entity properties.
        }
        if (type.Kind == "entity")
        {
            if (!entities.TryGetValue(type.Name!, out var native) || !native.IsInstanceOfType(value))
                throw new InvalidOperationException($"{path}: expected registered native entity {type.Name}.");
            return;
        }
        if(type.Kind=="dictionary")
        {
            ValidateNative(DictionaryContract.Shape(type.Items!),value,path);
            var keys=new HashSet<string>(StringComparer.Ordinal);
            foreach(var entry in (System.Collections.IEnumerable)value!){FlowValues.TryField(entry!,"key",out var key);if(!keys.Add((string)key!))throw new InvalidOperationException($"{path}: duplicate dictionary key: {key}");}
            return;
        }
        if (type.Kind == "array")
        {
            if (value is not System.Collections.IEnumerable items || value is string || value is System.Collections.IDictionary)
                throw new InvalidOperationException($"{path}: expected list.");
            // Sequences and IQueryable will receive their own contracts; validation must not run a query.
            if (value is not System.Collections.ICollection && !value.GetType().GetInterfaces().Any(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IReadOnlyCollection<>)))
                throw new InvalidOperationException($"{path}: array contracts require a materialized collection.");
            var index = 0;
            foreach (var item in items) ValidateNative(type.Items!, item, $"{path}/{index++}");
            return;
        }
        if(type.Kind=="pageConfig") { var pageErrors=ContractSchemas.Validate("page-config",FlowValues.Encode(type,value));if(pageErrors.Count>0)throw new ContractException(pageErrors);return; }
        if (type.Kind == "object")
        {
            if (value is null) throw new InvalidOperationException($"{path}: expected record.");
            foreach (var (name, field) in type.Fields!)
                if (FlowValues.TryField(value, name, out var item)) ValidateNative(field, item, $"{path}/{name}");
                else if (field.Kind != "optional") throw new InvalidOperationException($"{path}/{name}: missing required field.");
            return;
        }
        var errors = typeRegistry.ValidateValue(type, FlowValues.Encode(type, value), path);
        if (errors.Count != 0) throw new ContractException(errors);
    }
}
