using System.Text.Json;
using Adam.Flow2.Runtime;
using Flow.Contracts;

namespace Flow.Nodes.Server;

public static class DemoCodecs
{
    public static readonly CodecReference String = new("core.String@1", 1);
    public static readonly CodecReference Contact = new("crm.ContactDTO@1", 1);

    public static CodecCatalog Definitions(string environment)
    {
        using var stream = typeof(DemoCodecs).Assembly.GetManifestResourceStream("Demo.codecs.json")!;
        using var reader = new StreamReader(stream);
        return ContractSchemas.Parse<CodecCatalog>("codecs", reader.ReadToEnd()) with { Environment = environment };
    }

    public static CodecRegistry Create(TypeDocument types, string environment = "server")
    {
        var registry = new CodecRegistry(types, environment);
        foreach (var definition in Definitions(environment).Codecs)
        {
            if (definition.TypeId == String.TypeId)
                registry.Register(new(definition, typeof(string), value => JsonSerializer.SerializeToElement((string)value), payload => payload.GetString()!));
            else if (definition.TypeId == Contact.TypeId)
                registry.Register(new(definition, typeof(ContactDto), value => JsonSerializer.SerializeToElement((ContactDto)value, ContractSchemas.JsonOptions),
                    payload => payload.Deserialize<ContactDto>(ContractSchemas.JsonOptions)!));
            else throw new InvalidOperationException("Unimplemented demo codec.");
        }
        return registry;
    }
}
