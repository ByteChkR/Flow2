using System.Text.Json;
using Adam.Flow2.Runtime;
using Flow.Contracts;

namespace Flow.Nodes.Server;

public sealed record EntityMetadata(string TypeId, string GetNodeType, int NodeVersion, Dictionary<string, TypeRef> Fields);

public static class EntityNodeFactory
{
    public static EntityMetadata LoadContactMetadata()
    {
        using var stream = typeof(EntityNodeFactory).Assembly.GetManifestResourceStream("Metadata.contact.metadata.json")
            ?? throw new InvalidOperationException("Missing Contact metadata resource.");
        return JsonSerializer.Deserialize<EntityMetadata>(stream, ContractSchemas.JsonOptions)!;
    }

    public static EntityDefinition Define(EntityMetadata metadata) => new(metadata.TypeId, "entity", metadata.Fields);

    public static RegisteredNode CreateGet<T>(EntityMetadata metadata, Func<string, T> getById) where T : class
    {
        var entity = new PortType(metadata.TypeId, typeof(T), new("entity", Name: metadata.TypeId));
        return new(new(metadata.GetNodeType, metadata.NodeVersion,
            new Dictionary<string, PortType> { ["id"] = ContactDemo.StringType },
            new Dictionary<string, PortType> { ["contact"] = entity }),
            inputs => new Dictionary<string, object> { ["contact"] = getById((string)inputs["id"]) });
    }
}

public sealed class InMemoryContactRepository
{
    private readonly Dictionary<string, Contact> contacts;
    public InMemoryContactRepository(IEnumerable<Contact> contacts) => this.contacts = contacts.ToDictionary(contact => contact.Id, StringComparer.Ordinal);
    public Contact GetById(string id) => contacts.TryGetValue(id, out var contact) ? contact : throw new InvalidOperationException("Contact not found.");
}
