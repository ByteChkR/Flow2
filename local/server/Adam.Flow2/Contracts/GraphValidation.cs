using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Adam.Flow2.Contracts;

public sealed record GraphValidationIdentity(string ContentHash, string Fingerprint, string[] Dependencies, Diagnostic[] Diagnostics);
public sealed record GraphValidationReceipt(string ContentHash, string Fingerprint, string ValidationVersion, DateTimeOffset ValidatedAt, Diagnostic[] Diagnostics)
{
    public bool IsValidFor(GraphValidationIdentity identity, string version) => Diagnostics.Length == 0
        && identity.Diagnostics.Length == 0 && ValidationVersion == version && Fingerprint == identity.Fingerprint;
}

/// <summary>Server-authored identities. Presentation metadata lives outside the execution document.</summary>
public static class GraphValidation
{
    // Bump when validation semantics change independently of the runtime contract version.
    public const string Version = "flow2-validation-v1";
    public static string Hash(JsonNode? value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Canonical(value)))).ToLowerInvariant();
    private static string Canonical(JsonNode? value) => value switch
    {
        JsonObject obj => "{" + string.Join(",", obj.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => System.Text.Json.JsonSerializer.Serialize(p.Key) + ":" + Canonical(p.Value))) + "}",
        JsonArray array => "[" + string.Join(",", array.Select(Canonical)) + "]",
        _ => value?.ToJsonString() ?? "null"
    };
    public static string ContentHash(JsonObject graph)
    {
        var execution = (JsonObject)graph.DeepClone();
        // Version is optimistic bookkeeping, not execution semantics. Node order remains significant.
        execution.Remove("version");
        void StripReferenceRevisions(JsonNode? node)
        {
            if(node is JsonObject obj)
            {
                if(obj["graphId"] is JsonValue && obj.All(p=>p.Key is "graphId" or "revision"))obj.Remove("revision");
                foreach(var child in obj.ToArray())StripReferenceRevisions(child.Value);
            }
            else if(node is JsonArray array)foreach(var child in array)StripReferenceRevisions(child);
        }
        StripReferenceRevisions(execution);
        return Hash(execution);
    }
    public static IEnumerable<string> References(JsonNode? value, string? parentKey = null)
    {
        if(value is JsonObject obj)
        {
            if(obj["graphId"] is JsonValue id && id.TryGetValue<string>(out var text)
                && (parentKey == "config" || obj["operation"] is JsonValue || obj.All(p=>p.Key is "graphId" or "revision")))yield return text;
            foreach(var child in obj)foreach(var reference in References(child.Value,child.Key))yield return reference;
        }
        else if(value is JsonArray array)foreach(var child in array)foreach(var reference in References(child))yield return reference;
    }
    public static IReadOnlyDictionary<string,GraphValidationIdentity> Analyze(IReadOnlyDictionary<string,JsonObject> graphs,string basis)
    {
        var hashes=graphs.ToDictionary(p=>p.Key,p=>ContentHash(p.Value),StringComparer.Ordinal);
        var dependencies=graphs.ToDictionary(p=>p.Key,p=>References(p.Value).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray(),StringComparer.Ordinal);
        var result=new Dictionary<string,GraphValidationIdentity>(StringComparer.Ordinal);
        foreach(var root in graphs.Keys)
        {
            var reached=new HashSet<string>(StringComparer.Ordinal);
            var visiting=new HashSet<string>(StringComparer.Ordinal);
            var diagnostics=new List<Diagnostic>();
            void Visit(string id)
            {
                if(visiting.Contains(id)){diagnostics.Add(new("graph_recursion",$"/graphs/{root}",$"Rekursiver Graph-Aufruf: {id}."));return;}
                if(reached.Contains(id))return;
                reached.Add(id);
                if(!dependencies.TryGetValue(id,out var children)){diagnostics.Add(new("graph_missing",$"/graphs/{root}",$"Referenzierter Graph fehlt: {id}."));return;}
                if(visiting.Count>=32){diagnostics.Add(new("graph_depth",$"/graphs/{root}","Maximale Graph-Aufruftiefe überschritten."));return;}
                visiting.Add(id);foreach(var child in children)Visit(child);visiting.Remove(id);
            }
            Visit(root);
            var closure=new JsonObject();foreach(var id in reached.Order(StringComparer.Ordinal))closure[id]=hashes.GetValueOrDefault(id);
            var fingerprint=Hash(new JsonObject{["version"]=Version,["basis"]=basis,["root"]=root,["closure"]=closure});
            result[root]=new(hashes[root],fingerprint,dependencies[root],diagnostics.ToArray());
        }
        return result;
    }
    /// <summary>Includes transitive callers using old and new edges, including deleted dependencies.</summary>
    public static IReadOnlySet<string> Affected(IReadOnlyDictionary<string,GraphValidationIdentity> before,IReadOnlyDictionary<string,GraphValidationIdentity> after)
    {
        var changed=before.Keys.Concat(after.Keys).Where(id=>!before.TryGetValue(id,out var old)||!after.TryGetValue(id,out var next)||old.Fingerprint!=next.Fingerprint).ToHashSet(StringComparer.Ordinal);
        var reverse=new Dictionary<string,HashSet<string>>(StringComparer.Ordinal);
        foreach(var graph in before.Concat(after))foreach(var dependency in graph.Value.Dependencies)
        {if(!reverse.TryGetValue(dependency,out var callers))reverse[dependency]=callers=[];callers.Add(graph.Key);}
        var queue=new Queue<string>(changed);while(queue.TryDequeue(out var id))if(reverse.TryGetValue(id,out var callers))foreach(var caller in callers)if(changed.Add(caller))queue.Enqueue(caller);
        return changed;
    }
}
