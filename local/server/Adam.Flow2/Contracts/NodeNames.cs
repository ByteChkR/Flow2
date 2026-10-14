namespace Adam.Flow2.Contracts;

public static class NodeNames
{
    // Explicit built-in families; runtime policy does not infer capabilities from user-authored prefixes.
    public static bool IsDataOperation(string type) => DataOperations.Contains(type);
    private static readonly HashSet<string> DataOperations = new(StringComparer.Ordinal)
    {
        "Backend.EF.Source", "Backend.EF.GetById", "Backend.EF.Create", "Backend.EF.SetFields", "Backend.EF.Delete", "Backend.EF.SaveChanges",
        "Backend.Query.Any", "Backend.Query.First", "Backend.Query.FirstOrDefault", "Backend.Query.ToList", "Backend.Query.Where",
        "Backend.Query.All", "Backend.Query.OrderBy", "Backend.Query.ThenBy", "Backend.Query.Select", "Backend.Query.GroupBy",
        "Backend.Query.Skip", "Backend.Query.Take", "Backend.Query.Count",
        "Backend.Template.Execute", "Backend.Template.ById", "Backend.Template.Default", "Backend.Template.FromModel", "Backend.Document.Upload"
    };
    public static string Value(string operation) => operation switch
    {
        "ternary" => "Standard.Values.Ternary",
        "input" => "Standard.Flow.Input",
        "output" => "Standard.Flow.Output",
        "null" => "Standard.Values.Null",
        "isNull" => "Standard.Values.IsNull",
        "isMissing" => "Standard.Values.IsMissing",
        "require" => "Standard.Values.Require",
        "dictCreate" => "Standard.Values.Dictionary.Create",
        "dictGet" => "Standard.Values.Dictionary.Get",
        "dictTryGet" => "Standard.Values.Dictionary.TryGet",
        "dictSet" => "Standard.Values.Dictionary.Set",
        "dictRemove" => "Standard.Values.Dictionary.Remove",
        "dictContainsKey" => "Standard.Values.Dictionary.ContainsKey",
        "dictKeys" => "Standard.Values.Dictionary.Keys",
        "dictValues" => "Standard.Values.Dictionary.Values",
        "hasField" => "Standard.Values.Record.HasField",
        "removeField" => "Standard.Values.Record.RemoveField",
        "merge" => "Standard.Values.Record.Merge",
        "getProperty" => "Standard.Values.Record.GetProperty",
        "record" => "Standard.Values.Record.Create",
        "withFields" => "Standard.Values.Record.WithFields",
        "list" => "Standard.Values.List.Create",
        "count" => "Standard.Values.List.Count",
        "getItem" => "Standard.Values.List.GetItem",
        "addItem" => "Standard.Values.List.AddItem",
        "addRange" => "Standard.Values.List.AddRange",
        "insertItem" => "Standard.Values.List.InsertItem",
        "insertRange" => "Standard.Values.List.InsertRange",
        "setItem" => "Standard.Values.List.SetItem",
        "removeAt" => "Standard.Values.List.RemoveAt",
        "removeRange" => "Standard.Values.List.RemoveRange",
        "clear" => "Standard.Values.List.Clear",
        "removeItem" => "Standard.Values.List.RemoveItem",
        "removeAll" => "Standard.Values.List.RemoveAll",
        "tryGetItem" => "Standard.Values.List.TryGetItem",
        "first" => "Standard.Values.List.First",
        "last" => "Standard.Values.List.Last",
        "tryFirst" => "Standard.Values.List.TryFirst",
        "tryLast" => "Standard.Values.List.TryLast",
        "single" => "Standard.Values.List.Single",
        "trySingle" => "Standard.Values.List.TrySingle",
        "contains" => "Standard.Values.List.Contains",
        "indexOf" => "Standard.Values.List.IndexOf",
        "lastIndexOf" => "Standard.Values.List.LastIndexOf",
        "isEmpty" => "Standard.Values.List.IsEmpty",
        "skip" => "Standard.Values.List.Skip",
        "take" => "Standard.Values.List.Take",
        "slice" => "Standard.Values.List.Slice",
        "reverse" => "Standard.Values.List.Reverse",
        "chunk" => "Standard.Values.List.Chunk",
        "flatten" => "Standard.Values.List.Flatten",
        "sort" => "Standard.Values.List.Sort",
        "distinct" => "Standard.Values.List.Distinct",
        "union" => "Standard.Values.List.Union",
        "intersect" => "Standard.Values.List.Intersect",
        "except" => "Standard.Values.List.Except",
        "zip" => "Standard.Values.List.Zip",
        "sum" => "Standard.Values.List.Sum",
        "average" => "Standard.Values.List.Average",
        "min" => "Standard.Values.List.Min",
        "max" => "Standard.Values.List.Max",




        "jsonFrom" => "Standard.JSON.FromValue",
        "jsonTo" => "Standard.JSON.ToValue",
        "coalesce" => "Standard.Values.Coalesce",
        _ => throw new ArgumentException("Unknown node operation",nameof(operation))
    };
    public static string Graph(string operation) => operation switch
    {
        "reference" => "Standard.Flow.Reference",
        "invoke" => "Standard.Flow.Invoke",
        "if" => "Standard.Flow.If",
        "ifElse" => "Standard.Flow.IfElse",
        "switch" => "Standard.Flow.Switch",
        "forEach" => "Standard.Flow.ForEach",
        "aggregate" => "Standard.Flow.Aggregate",
        "flatMap" => "Standard.Flow.FlatMap",
        "any" => "Standard.Flow.Any",
        "all" => "Standard.Flow.All",
        "find" => "Standard.Flow.Find",
        "findIndex" => "Standard.Flow.FindIndex",
        "takeWhile" => "Standard.Flow.TakeWhile",
        "skipWhile" => "Standard.Flow.SkipWhile",
        "sortBy" => "Standard.Flow.SortBy",
        "distinctBy" => "Standard.Flow.DistinctBy",
        "groupBy" => "Standard.Flow.GroupBy",
        "minBy" => "Standard.Flow.MinBy",
        "maxBy" => "Standard.Flow.MaxBy",
        "joinByKey" => "Standard.Flow.JoinByKey",
        "leftJoinByKey" => "Standard.Flow.LeftJoinByKey",
        "groupJoinByKey" => "Standard.Flow.GroupJoinByKey",
        "partition" => "Standard.Flow.Partition",

        "map" => "Standard.Flow.Map",
        "filter" => "Standard.Flow.Filter",
        "try" => "Standard.Flow.Try",
        "parallelMap" => "Standard.Flow.ParallelMap",
        "timeout" => "Standard.Flow.Timeout",
        "retry" => "Standard.Flow.Retry",
        "repeat" => "Standard.Flow.Repeat",
        "while" => "Standard.Flow.While",
        _ => throw new ArgumentException("Unknown node operation",nameof(operation))
    };
    public static string Query(string operation) => operation switch
    {
        "any" => "Backend.Query.Any",
        "first" => "Backend.Query.First",
        "firstOrDefault" => "Backend.Query.FirstOrDefault",
        "toList" => "Backend.Query.ToList",
        "where" => "Backend.Query.Where",
        "all" => "Backend.Query.All",
        "orderBy" => "Backend.Query.OrderBy",
        "thenBy" => "Backend.Query.ThenBy",
        "select" => "Backend.Query.Select",
        "groupBy" => "Backend.Query.GroupBy",
        "skip" => "Backend.Query.Skip",
        "take" => "Backend.Query.Take",
        "count" => "Backend.Query.Count",
        _ => throw new ArgumentException("Unknown node operation",nameof(operation))
    };
    public static string Template(string operation) => operation switch
    {
        "execute" => "Backend.Template.Execute",
        "byId" => "Backend.Template.ById",
        "default" => "Backend.Template.Default",
        "fromModel" => "Backend.Template.FromModel",
        _ => throw new ArgumentException("Unknown node operation",nameof(operation))
    };
}
