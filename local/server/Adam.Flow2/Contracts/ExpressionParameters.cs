namespace Adam.Flow2.Contracts;

/// <summary>External expression values are explicit typed inputs of the enclosing query node.</summary>
public static class ExpressionParameters
{
    public static bool IsScalar(TypeRef type) => type.Kind is "string" or "scalar" || type.Kind == "nullable" && IsScalar(type.Inner!);
    public static Dictionary<string, TypeRef> Describe(ExpressionGraph graph)
    {
        var result = new Dictionary<string, TypeRef>(StringComparer.Ordinal);
        foreach (var node in graph.Nodes.Where(node => node.Operation == "external"))
        {
            if (node.Member is null || !System.Text.RegularExpressions.Regex.IsMatch(node.Member, "^[A-Za-z_][A-Za-z0-9_]{0,63}$") || node.Type is null || !IsScalar(node.Type) ||
                (result.TryGetValue(node.Member, out var previous) && !TransportContracts.Equivalent(previous, node.Type)))
                throw new ContractException([new("query_parameter", "/expression", "External parameter names and scalar types must be consistent.")]);
            result[node.Member] = node.Type;
        }
        return result;
    }
}
