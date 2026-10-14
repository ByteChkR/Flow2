using System.Linq.Expressions;
using System.Reflection;
using System.Text.Json;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

/// <summary>Builds provider-visible expressions from explicitly allowed operations and registered fields.</summary>
public sealed partial class ExpressionGraphCompiler(TypeDocument types, IReadOnlyDictionary<string, Type> entities, ProjectionTypes? projectionTypes = null)
{
    private readonly ProjectionTypes projections = projectionTypes ?? new();
    public sealed record CompiledExpression(LambdaExpression Lambda, TypeRef ResultType);
    private sealed record Typed(Expression Value, TypeRef Type);
    public Expression<Func<T, TResult>> Compile<T, TResult>(ExpressionGraph graph)
    {
        var lambda = Compile(graph);
        if (lambda.Parameters[0].Type != typeof(T) || lambda.ReturnType != typeof(TResult))
            throw Error(graph.Result, $"Expression signature does not match {typeof(T).Name} → {typeof(TResult).Name}.");
        return Expression.Lambda<Func<T, TResult>>(lambda.Body, lambda.Parameters);
    }

    public LambdaExpression Compile(ExpressionGraph graph)
    {
        if(ExpressionParameters.Describe(graph).Count != 0)throw Error("", "External values require a parameterized query binding.");
        return CompileTyped(graph).Lambda;
    }
    public Type ResolveType(TypeRef type) => Resolve(type);
    public CompiledExpression CompileTyped(ExpressionGraph graph, IReadOnlyDictionary<string, object>? arguments = null)
    {
        if (graph.SchemaVersion != 1 || graph.Nodes.Length is 0 or > 512)
            throw Error("", "Expression graph requires version 1 and between 1 and 512 nodes.");
        _ = ExpressionParameters.Describe(graph);
        var nodes = new Dictionary<string, ExpressionNode>(StringComparer.Ordinal);
        foreach (var node in graph.Nodes)
            if (string.IsNullOrWhiteSpace(node.Id) || !nodes.TryAdd(node.Id, node)) throw Error(node.Id, "Duplicate or empty expression node ID.");
        var parameter = Expression.Parameter(Resolve(graph.Parameter), "item");
        var compiled = new Dictionary<string, Typed>(StringComparer.Ordinal);
        var visiting = new HashSet<string>(StringComparer.Ordinal);
        Typed Build(string id)
        {
            if (compiled.TryGetValue(id, out var cached)) return cached;
            if (!nodes.TryGetValue(id, out var node)) throw Error(id, "Missing expression node.");
            if (!visiting.Add(id)) throw Error(id, "Expression cycle.");
            Typed Input(string name) => node.Inputs.TryGetValue(name, out var source) ? Build(source) : throw Error(id, $"Missing input {name}.");
            void Shape(params string[] names)
            {
                if (!node.Inputs.Keys.Order(StringComparer.Ordinal).SequenceEqual(names.Order(StringComparer.Ordinal)))
                    throw Error(id, "Unexpected expression inputs.");
                if (node.Operation is not ("external" or "property" or "optionalProperty" or "sum" or "min" or "max") && node.Member is not null || (node.Operation is not ("constant" or "external") && node.Type is not null || node.Operation != "constant" && node.Value.ValueKind != JsonValueKind.Undefined))
                    throw Error(id, "Unexpected expression metadata.");
            }
            Typed result;
            try
            {
                switch (node.Operation)
                {
                    case "external":
                        Shape();
                        var externalType = Resolve(node.Type!);
                        if(arguments is null) result = new(Expression.Default(externalType), node.Type!);
                        else
                        {
                            if(!arguments.TryGetValue("arg_" + node.Member, out var argument))throw Error(id, "Missing external parameter.");
                            if(argument is null ? node.Type!.Kind != "nullable" : !(Nullable.GetUnderlyingType(externalType) ?? externalType).IsInstanceOfType(argument))throw Error(id, "External parameter type mismatch.");
                            // A captured member is recognized as a parameter by EF, preserving query plan reuse.
                            var boxType = typeof(QueryArgument<>).MakeGenericType(externalType);
                            var box = Activator.CreateInstance(boxType)!;
                            boxType.GetField("Value")!.SetValue(box, argument);
                            result = new(Expression.Field(Expression.Constant(box, boxType), "Value"), node.Type!);
                        }
                        break;
                    case "parameter": Shape(); result = new(parameter, graph.Parameter); break;
                    case "groupKey": case "groupElements":
                        Shape("value"); var group = Input("value");
                        if(group.Type.Kind != "grouping")throw Error(id,"Grouping input required.");
                        result = node.Operation == "groupKey"
                            ? new(Expression.Property(group.Value,"Key"),group.Type.Key!)
                            : new(group.Value,new("enumerable",Items:group.Type.Items));
                        break;
                    case "count": case "sum": case "min": case "max":
                        Shape("value"); var sequence = Input("value");
                        if(sequence.Type.Kind is not ("grouping" or "enumerable"))throw Error(id,"Group or enumerable input required.");
                        var element = sequence.Type.Items!;var elementClr = Resolve(element);
                        if(node.Operation == "count")
                        {
                            result = new(Expression.Call(typeof(Enumerable),"Count",[elementClr],sequence.Value),new("scalar",Name:"core.Integer"));break;
                        }
                        var aggregateParameter = Expression.Parameter(elementClr,"element");
                        Expression aggregateValue = aggregateParameter;var aggregateType = element;
                        if(node.Member is not null)
                        {
                            var aggregateFields = element.Kind == "entity" ? types.Types.SingleOrDefault(type=>type.Id==element.Name)?.Fields : element.Kind == "object" ? element.Fields : null;
                            if(aggregateFields is null || !aggregateFields.TryGetValue(node.Member,out aggregateType!))throw Error(id,"Aggregate field is not registered.");
                            var aggregateProperty=elementClr.GetProperty(node.Member,BindingFlags.Instance|BindingFlags.Public);
                            if(aggregateProperty?.GetMethod?.IsPublic!=true || aggregateProperty.GetIndexParameters().Length!=0 || aggregateProperty.PropertyType!=Resolve(aggregateType))throw Error(id,"Invalid aggregate property.");
                            aggregateValue=Expression.Property(aggregateParameter,aggregateProperty);
                        }
                        var numeric=aggregateType.Kind=="nullable"?aggregateType.Inner!:aggregateType;
                        if(numeric.Kind!="scalar"||numeric.Name is not ("core.Integer" or "core.Decimal"))throw Error(id,"Aggregate requires Integer or Decimal values.");
                        var aggregateName=node.Operation switch{"sum"=>"Sum","min"=>"Min",_=>"Max"};
                        result=new(Expression.Call(typeof(Enumerable),aggregateName,[elementClr],sequence.Value,Expression.Lambda(aggregateValue,aggregateParameter)),aggregateType);
                        break;
                    case "record":
                        Shape(node.Inputs.Keys.ToArray());
                        if (node.Inputs.Count is 0 or > 64 || node.Inputs.Keys.Any(name => !ProjectionTypes.ValidField(name)))
                            throw Error(id, "Record requires 1–64 identifier fields.");
                        var members = node.Inputs.OrderBy(pair => pair.Key, StringComparer.Ordinal).ToDictionary(pair => pair.Key, pair => Build(pair.Value));
                        var record = new TypeRef("object", Fields: members.ToDictionary(pair => pair.Key, pair => pair.Value.Type));
                        var recordType = Resolve(record);
                        result = new(Expression.MemberInit(Expression.New(recordType), members.Select(pair => Expression.Bind(recordType.GetProperty(pair.Key)!, pair.Value.Value))), record);
                        break;
                    case "constant":
                        Shape();
                        if (node.Type is null || node.Value.ValueKind == JsonValueKind.Undefined || !Scalar(node.Type))
                            throw Error(id, "Constant requires a scalar type and value.");
                        var constantType = Resolve(node.Type);
                        if (new TypeRegistry(types).ValidateValue(node.Type, node.Value).Count != 0)
                            throw Error(id, "Constant value does not match its declared type.");
                        var value = FlowValues.Decode(node.Type, node.Value, constantType);
                        var constant = Expression.Constant(value, value is null ? constantType : Nullable.GetUnderlyingType(constantType) ?? constantType);
                        result = new(constant.Type == constantType ? constant : Expression.Convert(constant, constantType), node.Type);
                        break;
                    case "property": case "optionalProperty":
                        Shape("value");
                        var owner = Input("value");
                        var ownerType = owner.Type.Kind == "nullable" ? owner.Type.Inner! : owner.Type;
                        var fields = ownerType.Kind == "entity"
                            ? types.Types.SingleOrDefault(type => type.Id == ownerType.Name)?.Fields
                            : ownerType.Kind == "object" ? ownerType.Fields : null;
                        if (node.Member is null || fields is null || !fields.TryGetValue(node.Member, out var field))
                            throw Error(id, "Property is not registered for this type.");
                        var property = owner.Value.Type.GetProperty(node.Member, BindingFlags.Instance | BindingFlags.Public);
                        if (property?.GetMethod?.IsPublic != true || property.GetIndexParameters().Length != 0 || property.PropertyType != Resolve(field))
                            throw Error(id, "Registered property does not match its CLR accessor.");
                        Expression access = Expression.Property(owner.Value, property);
                        if (owner.Type.Kind == "nullable" || node.Operation == "optionalProperty")
                        {
                            var resultType = field.Kind == "nullable" ? field : new TypeRef("nullable", Inner: field);
                            var resultClr = Resolve(resultType);
                            if (access.Type != resultClr) access = Expression.Convert(access, resultClr);
                            access = Expression.Condition(Expression.Equal(owner.Value, Expression.Constant(null, owner.Value.Type)),
                                Expression.Default(resultClr), access);
                            result = new(access, resultType);
                        }
                        else result = new(access, field);
                        break;
                    case "ternary":
                        Shape("condition", "whenTrue", "whenFalse");
                        var condition = Input("condition"); RequireBool(condition, id);
                        var whenTrue = Input("whenTrue"); var whenFalse = Input("whenFalse");
                        TypeRef branchType;
                        if (TransportContracts.Equivalent(whenTrue.Type, whenFalse.Type)) branchType = whenTrue.Type;
                        else if (whenTrue.Type.Kind == "nullable" && TransportContracts.Equivalent(whenTrue.Type.Inner!, whenFalse.Type)) branchType = whenTrue.Type;
                        else if (whenFalse.Type.Kind == "nullable" && TransportContracts.Equivalent(whenFalse.Type.Inner!, whenTrue.Type)) branchType = whenFalse.Type;
                        else throw Error(id, "Conditional branches require the same type (optionally nullable).");
                        var branchClr = Resolve(branchType);
                        Expression Branch(Typed branch) => branch.Value.Type == branchClr ? branch.Value : Expression.Convert(branch.Value, branchClr);
                        result = new(Expression.Condition(condition.Value, Branch(whenTrue), Branch(whenFalse)), branchType);
                        break;
                    case "not":
                        Shape("value"); var operand = Input("value"); RequireBool(operand, id);
                        result = new(Expression.Not(operand.Value), Bool); break;
                    case "isNull":
                        Shape("value"); var nullable = Input("value");
                        if (nullable.Type.Kind != "nullable") throw Error(id, "Null test requires a nullable value.");
                        result = new(Expression.Equal(nullable.Value, Expression.Constant(null, nullable.Value.Type)), Bool); break;
                    case "equal": case "notEqual": case "greaterThan": case "lessThan": case "greaterOrEqual": case "lessOrEqual":
                    case "and": case "or": case "xor":
                        Shape("left", "right"); var left = Input("left"); var right = Input("right");
                        if (!TransportContracts.Equivalent(left.Type, right.Type)) throw Error(id, "Operands must have the same type.");
                        if (node.Operation is "and" or "or" or "xor") { RequireBool(left, id); RequireBool(right, id); }
                        else if (!Scalar(left.Type)) throw Error(id, "Comparison requires scalar operands.");
                        var operation = node.Operation switch
                        {
                            "equal" => ExpressionType.Equal, "notEqual" => ExpressionType.NotEqual,
                            "greaterThan" => ExpressionType.GreaterThan, "lessThan" => ExpressionType.LessThan,
                            "greaterOrEqual" => ExpressionType.GreaterThanOrEqual, "lessOrEqual" => ExpressionType.LessThanOrEqual,
                            "and" => ExpressionType.AndAlso, "or" => ExpressionType.OrElse, _ => ExpressionType.ExclusiveOr
                        };
                        result = new(Expression.MakeBinary(operation, left.Value, right.Value), Bool); break;
                    default:
                        if (!TextInputs.TryGetValue(node.Operation, out var textInputs)) throw Error(id, $"Operation {node.Operation} is not allowed in an expression graph.");
                        Shape(textInputs);
                        result = CompileText(node, Input);
                        break;
                }
            }
            catch (ContractException) { throw; }
            catch (Exception error) when (error is ArgumentException or InvalidOperationException or FormatException or OverflowException)
            { throw Error(id, error.Message); }
            visiting.Remove(id); compiled.Add(id, result); return result;
        }
        var output = Build(graph.Result);
        // Validate disconnected nodes too: hiding an invalid operation must not make it admissible.
        foreach (var node in graph.Nodes) Build(node.Id);
        return new(Expression.Lambda(output.Value, parameter), output.Type);
    }
    private sealed class QueryArgument<T> { public QueryArgument() {} public T Value = default!; }
    private static readonly TypeRef Bool = new("scalar", Name: "core.Bool");
    private static bool Scalar(TypeRef type) => type.Kind is "scalar" or "string" || type.Kind == "nullable" && Scalar(type.Inner!);
    private static void RequireBool(Typed value, string id)
    { if (!TransportContracts.Equivalent(value.Type, Bool)) throw Error(id, "Boolean operand required."); }
    private Type Resolve(TypeRef type)
    {
        if(type.Kind=="grouping")return typeof(IGrouping<,>).MakeGenericType(Resolve(type.Key!),Resolve(type.Items!));
        if(type.Kind=="enumerable")return typeof(IEnumerable<>).MakeGenericType(Resolve(type.Items!));
        if (type.Kind == "object") return projections.Resolve(type, Resolve);
        if (type.Kind == "entity" && types.Types.Any(entity => entity.Id == type.Name) && entities.TryGetValue(type.Name!, out var entity)) return entity;
        if (type.Kind == "nullable")
        {
            var inner = Resolve(type.Inner!);
            return inner.IsValueType ? typeof(Nullable<>).MakeGenericType(inner) : inner;
        }
        if (type.Kind is "scalar" or "string") return FlowValues.ClrType(type);
        throw Error("", $"Unsupported expression type {type.Kind}.");
    }
    private static ContractException Error(string node, string message) => new([new("expression", $"/expression/nodes/{node}", message)]);
}
