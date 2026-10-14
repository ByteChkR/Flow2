using System.Reflection;
using System.Text.Json;
using Adam.Flow2.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace Adam.Flow2.Runtime;

[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class FlowNodeAttribute(string type) : Attribute
{
    public string Type { get; } = type;
    public bool ControlInput { get; set; }
    public bool ControlOutput { get; set; }
    public bool IsStart { get; set; }
    public string? FlowPort { get; set; }
    public int Version { get; set; } = 1;
    public string? Label { get; set; }
    public string? Description { get; set; }
    public string? Category { get; set; }
}
public abstract class FlowPortAttribute(string id) : Attribute
{
    public string Id { get; } = id;
    public string? Label { get; set; }
    public string? Description { get; set; }
    public int Order { get; set; }
    public bool Optional { get; set; }
    public bool AllowNull { get; set; }
}
[AttributeUsage(AttributeTargets.Property)]
public sealed class FlowInputAttribute(string id) : FlowPortAttribute(id);
[AttributeUsage(AttributeTargets.Property)]
public sealed class FlowOutputAttribute(string id) : FlowPortAttribute(id);
[AttributeUsage(AttributeTargets.Property)]
public sealed class FlowConfigAttribute(string id, object defaultValue) : Attribute
{
    public string Id { get; } = id;
    public object DefaultValue { get; } = defaultValue;
    public string? Label { get; set; }
    public string? Description { get; set; }
    public int Order { get; set; }
    public string[]? Options { get; set; }
}
public interface IFlowNode { void Execute(); }
public interface IAsyncFlowNode { ValueTask ExecuteAsync(CancellationToken cancellationToken); }

/// <summary>Explicit CLR mappings for native entities and DTOs; primitives need no registration.</summary>
public sealed class NodeTypeMap
{
    private readonly Dictionary<Type, PortType> mappings = new()
    {
        [typeof(string)] = new("string", typeof(string), new("string")),
        [typeof(decimal)] = Scalar<decimal>("core.Decimal"),
        [typeof(double)] = new("number", typeof(double), new("number")),
        [typeof(bool)] = Scalar<bool>("core.Bool"),
        [typeof(int)] = Scalar<int>("core.Integer"),
        [typeof(DateTimeOffset)] = Scalar<DateTimeOffset>("core.DateTimeOffset"),
        [typeof(TimeSpan)] = Scalar<TimeSpan>("core.TimeSpan"),
        [typeof(Guid)] = Scalar<Guid>("core.Guid")
    };
    private static PortType Scalar<T>(string name) => new(name, typeof(T), new("scalar", Name: name));
    public NodeTypeMap Add<T>(PortType type)
    {
        if (type.ClrType != typeof(T)) throw new ArgumentException("CLR mapping does not match T.");
        mappings[typeof(T)] = type; return this;
    }
    public PortType Resolve(Type type)
    {
        if(mappings.TryGetValue(type,out var mapped))return mapped;
        if(Nullable.GetUnderlyingType(type) is {} underlying)return new(type.Name,type,new("nullable",Inner:Resolve(underlying).ContractType));
        var element=type.IsArray&&type.GetArrayRank()==1?type.GetElementType():null;
        if(type.IsGenericType&&new[]{typeof(List<>),typeof(IList<>),typeof(IReadOnlyList<>),typeof(ICollection<>),typeof(IReadOnlyCollection<>)}.Contains(type.GetGenericTypeDefinition()))element=type.GetGenericArguments()[0];
        if(element is not null)return new(type.Name,type,new("array",Items:Resolve(element).ContractType));
        if(type.IsGenericType&&type.GetGenericTypeDefinition()==typeof(IQueryable<>))return new(type.Name,type,new("queryable",Items:Resolve(type.GetGenericArguments()[0]).ContractType));
        if(type.IsGenericType&&type.GetGenericTypeDefinition()==typeof(IOrderedQueryable<>))return new(type.Name,type,new("orderedQueryable",Items:Resolve(type.GetGenericArguments()[0]).ContractType));
        throw new InvalidOperationException($"No flow type mapping for {type}. Register an explicit native/DTO mapping.");
    }
}

public static class NodeAuthoring
{
    private static bool IsOptionalWrapper(Type type) => type.IsGenericType && type.GetGenericTypeDefinition() == typeof(FlowOptional<>);
    /// <summary>Uses the execution scope configured once on the registry.</summary>
    public static void RegisterFromServices<T>(this NodeRegistry registry, NodeTypeMap? types = null) where T : class
        => registry.RegisterFromServices<T>(registry.ExecutionServices, types);

    /// <summary>Creates a fresh node per invocation using the execution's service scope.</summary>
    public static void RegisterFromServices<T>(this NodeRegistry registry, Func<IServiceProvider> services, NodeTypeMap? types = null) where T : class
    {
        ArgumentNullException.ThrowIfNull(services);
        registry.Register<T>(() => ActivatorUtilities.CreateInstance<T>(services()), types);
    }

    public static void Register<T>(this NodeRegistry registry, NodeTypeMap? types = null) where T : class, new()
        => registry.Register<T>(() => new T(), types);

    /// <summary>Factory must return a fresh instance per call. Captured services retain the caller's scope.</summary>
    public static void Register<T>(this NodeRegistry registry, Func<T> factory, NodeTypeMap? types = null) where T : class
        => registry.Register(Create(factory, types));

    public static RegisteredNode Create<T>(Func<T> factory, NodeTypeMap? types = null) where T : class
    {
        ArgumentNullException.ThrowIfNull(factory);
        if (!typeof(IFlowNode).IsAssignableFrom(typeof(T)) && !typeof(IAsyncFlowNode).IsAssignableFrom(typeof(T)))
            throw new InvalidOperationException("Nodes must implement IFlowNode or IAsyncFlowNode.");
        types ??= new();
        var attribute = typeof(T).GetCustomAttribute<FlowNodeAttribute>() ?? throw new InvalidOperationException($"{typeof(T).Name} needs [FlowNode].");
        var inputs = new List<(PropertyInfo Property, FlowInputAttribute Attribute, PortType Type)>();
        var outputs = new List<(PropertyInfo Property, FlowOutputAttribute Attribute, PortType Type)>();
        var configs = new List<(PropertyInfo Property, FlowConfigAttribute Attribute, ConfigField Field)>();
        foreach (var property in typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static))
        {
            var input = property.GetCustomAttribute<FlowInputAttribute>();
            var output = property.GetCustomAttribute<FlowOutputAttribute>();
            var config = property.GetCustomAttribute<FlowConfigAttribute>();
            var count = (input is null ? 0 : 1) + (output is null ? 0 : 1) + (config is null ? 0 : 1);
            if (count == 0) continue;
            if (count != 1 || property.GetIndexParameters().Length != 0 || property.GetMethod?.IsStatic == true || property.SetMethod?.IsStatic == true)
                throw new InvalidOperationException($"Invalid annotated property {property.Name}.");
            if ((input is not null || config is not null) && property.SetMethod?.IsPublic != true)
                throw new InvalidOperationException($"{property.Name} needs a public setter.");
            if (output is not null && property.GetMethod?.IsPublic != true)
                throw new InvalidOperationException($"{property.Name} needs a public getter.");
            PortType Port(FlowPortAttribute port)
            {
                var wrapper = IsOptionalWrapper(property.PropertyType);
                var valueType = wrapper ? property.PropertyType.GetGenericArguments()[0] : property.PropertyType;
                var nullable = Nullable.GetUnderlyingType(valueType);
                var info = new NullabilityInfoContext().Create(property);
                if (wrapper) info = info.GenericTypeArguments[0];
                // Existing Optional=true ports use null as their absence marker. FlowOptional<T>
                // gives nodes a separate presence bit, so optional + explicit null remains lossless.
                var optional = port.Optional || wrapper;
                var allowNull = port.AllowNull || ((!port.Optional || wrapper) &&
                    (nullable is not null || (input is not null ? info.WriteState : info.ReadState) == NullabilityState.Nullable));
                if (optional && allowNull && !wrapper) throw new InvalidOperationException($"{property.Name}: optional nullable ports require FlowOptional<T> to distinguish null from absence.");
                if ((allowNull || (optional && !wrapper)) && valueType.IsValueType && nullable is null)
                    throw new InvalidOperationException($"{property.Name}: nullable value ports need Nullable<T>; optional ports may also use FlowOptional<T>.");
                var mapped = types.Resolve(nullable ?? valueType);
                TypeRef CollectionItems(TypeRef contract,NullabilityInfo annotation)
                {
                    if(contract.Kind!="array")return contract;
                    var itemInfo=annotation.ElementType??annotation.GenericTypeArguments.SingleOrDefault();
                    if(itemInfo is null)return contract;
                    var item=CollectionItems(contract.Items!,itemInfo);
                    if(item.Kind is not ("nullable" or "optional" or "null")&&(input is not null?itemInfo.WriteState:itemInfo.ReadState)==NullabilityState.Nullable)
                        item=new("nullable",Inner:item);
                    return contract with {Items=item};
                }
                mapped=mapped with {ContractType=CollectionItems(mapped.ContractType,info)};
                if (allowNull) mapped = mapped with { ContractType = new("nullable", Inner: mapped.ContractType) };
                return optional ? mapped with { ContractType = new("optional", Inner: mapped.ContractType) } : mapped;
            }
            if (input is not null) inputs.Add((property, input, Port(input)));
            if (output is not null) outputs.Add((property, output, Port(output)));
            if (config is not null)
            {
                var mapped = types.Resolve(property.PropertyType).ContractType;
                if (mapped.Kind is not ("scalar" or "string" or "number" or "boolean")) throw new InvalidOperationException($"{property.Name}: configuration requires a scalar type.");
                var value = JsonSerializer.SerializeToElement(config.DefaultValue, ContractSchemas.JsonOptions);
                if (mapped.Kind == "scalar") value = ScalarValues.Parse(mapped.Name!, value);
                // Decode through the same contract used by flow values and boundary codecs.
                _ = FlowValues.Decode(mapped, value, property.PropertyType);
                configs.Add((property, config, new(mapped.Kind, value, config.Label, config.Description, config.Order, config.Options, mapped.Name)));
            }
        }
        // ToDictionary deliberately rejects duplicate stable IDs before execution.
        var configuration = configs.Count == 0 ? null : configs.ToDictionary(p => p.Attribute.Id, p => p.Field);
        var definition = new NodeDefinition(attribute.Type, attribute.Version,
            inputs.ToDictionary(p => p.Attribute.Id, p => p.Type), outputs.ToDictionary(p => p.Attribute.Id, p => p.Type),
            new(attribute.Label, attribute.Description, attribute.Category,
                inputs.ToDictionary(p => p.Attribute.Id, p => new PortMetadata(p.Attribute.Label, p.Attribute.Description, p.Attribute.Order)),
                outputs.ToDictionary(p => p.Attribute.Id, p => new PortMetadata(p.Attribute.Label, p.Attribute.Description, p.Attribute.Order))), configuration,
            attribute.ControlInput || attribute.ControlOutput || attribute.IsStart ? new(attribute.ControlInput, attribute.ControlOutput, attribute.IsStart) : null, attribute.FlowPort);
        async ValueTask<IReadOnlyDictionary<string, object>> InvokeWithContextAsync(IReadOnlyDictionary<string, object> values, IReadOnlyDictionary<string, JsonElement> config, CancellationToken cancellationToken, FlowNodeContext context)
        {
            var errors = NodeAuthoringContracts.ValidateConfig(configuration, config);
            if (errors.Count != 0) throw new ContractException(errors);
            var instance = factory() ?? throw new InvalidOperationException("Node factory returned null.");
            try
            {
                if(instance is IContextualFlowNode contextual)contextual.Context=context;
                foreach (var (property, port, type) in inputs)
                {
                    if (values.TryGetValue(port.Id, out var value))
                        property.SetValue(instance, IsOptionalWrapper(property.PropertyType) ? Activator.CreateInstance(property.PropertyType, new object?[]{value}) : value);
                    else if (type.ContractType.Kind != "optional") throw new InvalidOperationException($"Missing input {port.Id}.");
                    else property.SetValue(instance, IsOptionalWrapper(property.PropertyType) ? Activator.CreateInstance(property.PropertyType) : null);
                }
                foreach (var (property, field, descriptor) in configs)
                    property.SetValue(instance, FlowValues.Decode(new(descriptor.Type, Name: descriptor.Scalar), config.TryGetValue(field.Id, out var value) ? value : descriptor.Default, property.PropertyType));
                cancellationToken.ThrowIfCancellationRequested();
                if (instance is IAsyncFlowNode asynchronous) await asynchronous.ExecuteAsync(cancellationToken);
                else ((IFlowNode)instance).Execute();
                cancellationToken.ThrowIfCancellationRequested();
                var result = new Dictionary<string, object>();
                foreach (var (property, port, type) in outputs)
                {
                    var value = property.GetValue(instance);
                    if (value is IFlowOptional optional)
                    {
                        if (!optional.HasValue) continue;
                        result.Add(port.Id, optional.UntypedValue!);
                    }
                    else if (value is not null || type.ContractType.Kind == "nullable") result.Add(port.Id, value!);
                    else if (type.ContractType.Kind != "optional") throw new InvalidOperationException($"Required output {port.Id} is null.");
                }
                return result;
            }
            finally { if (instance is IAsyncDisposable asynchronousDisposable) await asynchronousDisposable.DisposeAsync(); else (instance as IDisposable)?.Dispose(); }
        }
        ValueTask<IReadOnlyDictionary<string,object>> InvokeAsync(IReadOnlyDictionary<string,object> values,IReadOnlyDictionary<string,JsonElement> config,CancellationToken token)
            =>InvokeWithContextAsync(values,config,token,new("",FlowLogger.None));
        IReadOnlyDictionary<string, object> Invoke(IReadOnlyDictionary<string, object> values, IReadOnlyDictionary<string, JsonElement> config)
        {
            if (typeof(IAsyncFlowNode).IsAssignableFrom(typeof(T))) throw new InvalidOperationException("Use async execution for this node.");
            return InvokeAsync(values, config, default).GetAwaiter().GetResult();
        }
        return new(definition, values => Invoke(values, new Dictionary<string, JsonElement>()), Invoke, InvokeAsync, InvokeWithContextAsync);
    }
}
