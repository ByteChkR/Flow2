using System.Linq.Expressions;
namespace Adam.Flow2.Runtime;
/// <summary>Host-installed provider translation. Never configured by graph documents.</summary>
public static class QueryExpressionProviders { public static Func<Expression,Expression,Expression>? Like { get; set; } }
