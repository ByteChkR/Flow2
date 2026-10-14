using System.Reflection;
using System.Text.Json;
using Flow.Contracts;

namespace Adam.Flow2.Runtime;

[AttributeUsage(AttributeTargets.Class, Inherited = false)]
public sealed class FlowNodeAttribute(string type) : Attribute
{
    public string Type { get; } = type;
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

/// <summary>Explicit CLR mappings for native entities and DTOs; primitives need no registration.</summary>
public sealed class NodeTypeMap
{
    private readonly Dictionary<Type, PortType> mappings = new()
    {
        [typeof(string)] = new("string", typeof(string), new("string")),
        [typeof(double)] = new("number", typeof(double), new("number")),
        [typeof(bool)] = new("boolean", typeof(bool), new("boolean"))
    };
    public NodeTypeMap Add<T>(PortType type)
    {
        if (type.ClrType != typeof(T)) throw new ArgumentException("CLR mapping does not match T.");
        mappings[typeof(T)] = type; return this;
    }
    public PortType Resolve(Type type) => mappings.TryGetValue(type, out var mapped) ? mapped
        : throw new InvalidOperationException($"No flow type mapping for {type}. Register an explicit native/DTO mapping.");
}

public static class NodeAuthoring
{
    public static void Register<T>(this NodeRegistry registry, NodeTypeMap? types = null) where T : class, IFlowNode, new()
        => registry.Register<T>(() => new T(), types);

    /// <summary>Factory must return a fresh instance per call. Captured services retain the caller's scope.</summary>
    public static void Register<T>(this NodeRegistry registry, Func<T> factory, NodeTypeMap? types = null) where T : class, IFlowNode
        => registry.Register(Create(factory, types));

    public static RegisteredNode Create<T>(Func<T> factory, NodeTypeMap? types = null) where T : class, IFlowNode
    {
        ArgumentNullException.ThrowIfNull(factory);
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
                var nullable = Nullable.GetUnderlyingType(property.PropertyType);
                if (nullable is not null && !port.Optional) throw new InvalidOperationException($"{property.Name}: nullable ports require Optional=true (absence, not JSON null).");
                if (port.Optional && property.PropertyType.IsValueType && nullable is null)
                    throw new InvalidOperationException($"{property.Name}: optional value ports need Nullable<T>.");
                var mapped = types.Resolve(nullable ?? property.PropertyType);
                return port.Optional ? mapped with { ContractType = new("optional", Inner: mapped.ContractType) } : mapped;
            }
            if (input is not null) inputs.Add((property, input, Port(input)));
            if (output is not null) outputs.Add((property, output, Port(output)));
            if (config is not null)
            {
                var kind = property.PropertyType == typeof(string) ? "string" : property.PropertyType == typeof(double) ? "number" : property.PropertyType == typeof(bool) ? "boolean" : throw new InvalidOperationException("Configuration fields support string, double and bool.");
                var value = JsonSerializer.SerializeToElement(config.DefaultValue, ContractSchemas.JsonOptions);
                // Verify that the default is both a valid wire value and assignable to the actual property.
                _ = value.Deserialize(property.PropertyType, ContractSchemas.JsonOptions);
                configs.Add((property, config, new(kind, value, config.Label, config.Description, config.Order, config.Options)));
            }
        }
        // ToDictionary deliberately rejects duplicate stable IDs before execution.
        var configuration = configs.Count == 0 ? null : configs.ToDictionary(p => p.Attribute.Id, p => p.Field);
        var definition = new NodeDefinition(attribute.Type, attribute.Version,
            inputs.ToDictionary(p => p.Attribute.Id, p => p.Type), outputs.ToDictionary(p => p.Attribute.Id, p => p.Type),
            new(attribute.Label, attribute.Description, attribute.Category,
                inputs.ToDictionary(p => p.Attribute.Id, p => new PortMetadata(p.Attribute.Label, p.Attribute.Description, p.Attribute.Order)),
                outputs.ToDictionary(p => p.Attribute.Id, p => new PortMetadata(p.Attribute.Label, p.Attribute.Description, p.Attribute.Order))), configuration);
        IReadOnlyDictionary<string, object> Invoke(IReadOnlyDictionary<string, object> values, IReadOnlyDictionary<string, JsonElement> config)
        {
            var errors = NodeAuthoringContracts.ValidateConfig(configuration, config);
            if (errors.Count != 0) throw new ContractException(errors);
            var instance = factory() ?? throw new InvalidOperationException("Node factory returned null.");
            try
            {
                foreach (var (property, port, _) in inputs)
                {
                    if (values.TryGetValue(port.Id, out var value)) property.SetValue(instance, value);
                    else if (!port.Optional) throw new InvalidOperationException($"Missing input {port.Id}.");
                    else property.SetValue(instance, null);
                }
                foreach (var (property, field, descriptor) in configs)
                    property.SetValue(instance, (config.TryGetValue(field.Id, out var value) ? value : descriptor.Default).Deserialize(property.PropertyType, ContractSchemas.JsonOptions));
                instance.Execute();
                var result = new Dictionary<string, object>();
                foreach (var (property, port, _) in outputs)
                {
                    var value = property.GetValue(instance);
                    if (value is not null) result.Add(port.Id, value);
                    else if (!port.Optional) throw new InvalidOperationException($"Required output {port.Id} is null.");
                }
                return result;
            }
            finally { (instance as IDisposable)?.Dispose(); }
        }
        return new(definition, values => Invoke(values, new Dictionary<string, JsonElement>()), Invoke);
    }
}
