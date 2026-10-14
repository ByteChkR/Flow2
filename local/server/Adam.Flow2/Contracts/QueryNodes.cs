using System.Text.Json;

namespace Adam.Flow2.Contracts;

/// <summary>Concrete query contracts derived from document bindings, never executable client code.</summary>
public static class QueryNodes
{
    public static readonly string[] Operations = ["any", "first", "firstOrDefault", "toList", "where", "all", "orderBy", "thenBy", "select", "groupBy", "skip", "take", "count"];
    public static string NodeType(string id, string operation) => NodeNames.Query(operation);
    public static bool Predicate(string operation) => operation is "where" or "all";
    public static bool HasExpression(QueryNodeBinding binding) => binding.Operation=="any"?binding.Predicate:HasExpression(binding.Operation);
    public static bool HasExpression(string operation) => Predicate(operation) || operation is "orderBy" or "thenBy" or "select" or "groupBy";
    public static NodeDefinition Definition(FlowNode node) => NodeDescriptions.Describe(DefinitionCore(node));
    private static NodeDefinition DefinitionCore(FlowNode node)
    {
        var binding = node.Query ?? throw new InvalidOperationException("Missing query binding.");
        if (!Operations.Contains(binding.Operation) || node.Type != NodeType(node.Id, binding.Operation) || node.TypeVersion != 1 || node.Graph is not null || node.Environment != "server" ||
            (binding.Operation is "select" or "groupBy" ? binding.Result is null : binding.Result is not null))
            throw new ContractException([new("query_binding", $"/flow/nodes/{node.Id}", "Invalid query binding.")]);
        var input = new TypeRef(binding.Operation == "thenBy" ? "orderedQueryable" : "queryable", Items: binding.Element);
        var result = binding.Operation switch
        {
            "any" or "all" => new("scalar", Name: "core.Bool"),
            "count" => new("scalar", Name: "core.Integer"),
            "first" => binding.Element,
            "firstOrDefault" => binding.Element.Kind is "string" or "entity" or "object" or "array" or "grouping" or "enumerable" ? new("nullable", Inner: binding.Element) : binding.Element,
            "toList" => new("array", Items: binding.Element),
            "where" or "skip" or "take" => new("queryable", Items: binding.Element),
            "orderBy" or "thenBy" => new("orderedQueryable", Items: binding.Element),
            "groupBy" => new("queryable", Items: new("grouping", Key: binding.Result, Items: binding.Element)),
            "select" => new("queryable", Items: binding.Result),
            _ => throw new InvalidOperationException()
        };
        var deferred = binding.Operation is "skip" or "take" or "where" or "select" or "orderBy" or "thenBy" or "groupBy";
        Dictionary<string,ConfigField>? config = null;
        if (HasExpression(binding) || binding.Operation=="any")
        {
            var graph = DefaultExpression(binding);
            config = new() { ["expression"] = new("string", JsonSerializer.SerializeToElement(JsonSerializer.Serialize(graph, ContractSchemas.JsonOptions)), (Predicate(binding.Operation)||binding.Operation=="any") ? "Bedingung" : binding.Operation == "select" ? "Projektion" : binding.Operation == "groupBy" ? "Gruppenschlüssel" : "Sortierschlüssel") };
            if(binding.Operation is "orderBy" or "thenBy") config["descending"] = new("boolean", JsonSerializer.SerializeToElement(false), "Absteigend");
        }
        var inputs = new Dictionary<string, TypeRef> { ["query"] = input };
        if (binding.Operation is "skip" or "take") inputs["count"] = new("scalar", Name: "core.Integer");
        foreach (var (name, type) in binding.Operation=="any"&&!binding.Predicate?[]:binding.Parameters ?? [])
        {
            if (!HasExpression(binding) || !System.Text.RegularExpressions.Regex.IsMatch(name, "^[A-Za-z_][A-Za-z0-9_]{0,63}$") || !ExpressionParameters.IsScalar(type))
                throw new ContractException([new("query_parameter", "/query/parameters", "Query parameters require identifier names and scalar types.")]);
            inputs["arg_" + name] = type;
        }
        return new(node.Type, 1, ["server"], inputs, new() { [deferred ? "query" : "value"] = result },
            new(Label: binding.Operation, Category: "Query"), config, deferred ? null : new(true, true, false), Query: binding,NodeId:node.Id);
    }
    public static ExpressionGraph DefaultExpression(QueryNodeBinding binding) => binding.Operation == "select"
        ? new(1, binding.Element, [new("item", "parameter", [])], "item")
        : new(1, binding.Element, [new("item", "parameter", []), new("result", "constant", [], Type: new("scalar", Name: (Predicate(binding.Operation)||binding.Operation=="any") ? "core.Bool" : "core.Integer"), Value: (Predicate(binding.Operation)||binding.Operation=="any") ? JsonSerializer.SerializeToElement(true) : JsonSerializer.SerializeToElement(0))], "result");
}
