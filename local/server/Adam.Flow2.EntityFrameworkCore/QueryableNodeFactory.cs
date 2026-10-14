using System.Linq.Expressions;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;
using Microsoft.EntityFrameworkCore;

namespace Adam.Flow2.EntityFrameworkCore;

/// <summary>Specializes query nodes to inferred scalar/entity/record types within one execution registry.</summary>
public sealed class QueryableNodeFactory
{
    private readonly ExpressionGraphCompiler compiler;
    public QueryableNodeFactory(NodeRegistry nodes) => compiler = new(nodes.Types, nodes.EntityTypes, new ProjectionTypes());
    public RegisteredNode Create(FlowNode node)
    {
        _ = QueryNodes.Definition(node);
        try { return (RegisteredNode)GetType().GetMethod(nameof(CreateTyped), BindingFlags.Instance | BindingFlags.NonPublic)!.MakeGenericMethod(Resolve(node.Query!.Element)).Invoke(this, [node])!; }
        catch(TargetInvocationException error) when(error.InnerException is not null) { ExceptionDispatchInfo.Capture(error.InnerException).Throw(); throw; }
    }
    private Type Resolve(TypeRef type) => type.Kind switch
    {
        "queryable" => typeof(IQueryable<>).MakeGenericType(Resolve(type.Items!)),
        "orderedQueryable" => typeof(IOrderedQueryable<>).MakeGenericType(Resolve(type.Items!)),
        "array" => typeof(List<>).MakeGenericType(Resolve(type.Items!)),
        _ => compiler.ResolveType(type)
    };
    private PortType Port(TypeRef type) => new(type.Kind, Resolve(type), type);
    private RegisteredNode CreateTyped<T>(FlowNode node)
    {
        var binding = node.Query!;
        var contract = QueryNodes.Definition(node);
        var definition = new Adam.Flow2.Runtime.NodeDefinition(contract.Type, contract.Version,
            contract.Inputs.ToDictionary(pair => pair.Key, pair => Port(pair.Value)),
            contract.Outputs.ToDictionary(pair => pair.Key, pair => Port(pair.Value)), contract.Metadata, contract.Config, contract.Control, Query: binding,NodeId:node.Id);
        LambdaExpression? Compile(IReadOnlyDictionary<string, JsonElement> config, IReadOnlyDictionary<string, object>? inputs = null)
        {
            if(!QueryNodes.HasExpression(binding))return null;
            var json = config.TryGetValue("expression", out var value) ? value.GetString()! : contract.Config!["expression"].Default.GetString()!;
            var graph = ContractSchemas.Parse<ExpressionGraph>("expression", json);
            if(!TransportContracts.Equivalent(graph.Parameter,binding.Element))throw Error("parameter", "Expression parameter differs from the query element type.");
            if(!TransportContracts.Equivalent(ExpressionParameters.Describe(graph), binding.Parameters ?? []))throw Error("parameters", "Expression parameters differ from query inputs.");
            var expression = compiler.CompileTyped(graph, inputs);
            if(binding.Operation is "select" or "groupBy" && !TransportContracts.Equivalent(expression.ResultType,binding.Result))
                throw Error("result", "Declared query result differs from its inferred expression type.");
            if((QueryNodes.Predicate(binding.Operation)||binding.Operation=="any"&&binding.Predicate) && expression.Lambda.ReturnType != typeof(bool))throw Error("result", "Predicate must return Bool.");
            if(binding.Operation is "orderBy" or "thenBy")
            {
                var type = expression.ResultType.Kind == "nullable" ? expression.ResultType.Inner! : expression.ResultType;
                if(type.Kind is not ("scalar" or "string"))throw Error("result", "Sort key must be scalar.");
            }
            return expression.Lambda;
        }
        return new(definition, _ => throw new InvalidOperationException("Query nodes require their async configured executor."),
            ExecuteAsync: async (inputs, config, cancellation) =>
            {
                cancellation.ThrowIfCancellationRequested();
                var source = (IQueryable<T>)inputs["query"];
                var lambda = Compile(config, inputs);
                object? result;
                switch(binding.Operation)
                {
                    case "skip": case "take":
                        var count = (int)inputs["count"];
                        if(count < 0)throw new ArgumentOutOfRangeException("count", "Count must not be negative.");
                        result = binding.Operation == "skip" ? source.Skip(count) : source.Take(count); break;
                    case "count": result = await source.CountAsync(cancellation); break;
                    case "any": result = binding.Predicate ? await source.AnyAsync((Expression<Func<T,bool>>)lambda!,cancellation) : await source.AnyAsync(cancellation); break;
                    case "first": result = await source.FirstAsync(cancellation); break;
                    case "firstOrDefault": result = await source.FirstOrDefaultAsync(cancellation); break;
                    case "toList": result = await source.ToListAsync(cancellation); break;
                    case "all": result = await source.AllAsync((Expression<Func<T,bool>>)lambda!,cancellation); break;
                    case "where": result = source.Where((Expression<Func<T,bool>>)lambda!); break;
                    case "select":
                        result = source.Provider.CreateQuery(Expression.Call(typeof(Queryable), "Select", [typeof(T), lambda!.ReturnType], source.Expression, Expression.Quote(lambda)));
                        break;
                    case "groupBy":
                        result=source.Provider.CreateQuery(Expression.Call(typeof(Queryable),"GroupBy",[typeof(T),lambda!.ReturnType],source.Expression,Expression.Quote(lambda)));
                        break;
                    case "orderBy": case "thenBy":
                        var method = binding.Operation == "orderBy" ? "OrderBy" : "ThenBy";
                        if(config.TryGetValue("descending",out var descending)&&descending.GetBoolean())method += "Descending";
                        result = source.Provider.CreateQuery(Expression.Call(typeof(Queryable),method,[typeof(T),lambda!.ReturnType],source.Expression,Expression.Quote(lambda)));
                        break;
                    default: throw new InvalidOperationException("Unknown query operation.");
                }
                cancellation.ThrowIfCancellationRequested();
                return new Dictionary<string,object> { [contract.Outputs.Keys.Single()] = result! };
            }, ValidateConfiguration: config => Compile(config));
    }
    private static ContractException Error(string path,string message) => new([new("query_expression","/expression/"+path,message)]);
}
