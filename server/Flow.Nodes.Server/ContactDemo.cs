using System.Text.Json;
using Adam.Flow2.Runtime;
using Flow.Contracts;

namespace Flow.Nodes.Server;

public sealed class Contact(string id, string name)
{
    public string Id { get; } = id;
    public string Name { get; } = name;
}

public sealed record ContactDto(string Id, string Name,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] double? Age = null);

public sealed class ContactDemo
{
    public static readonly PortType StringType = new("string", typeof(string), new("string"));
    public static readonly PortType ContactType = new("crm.Contact@1", typeof(Contact), new("entity", Name: "crm.Contact@1"));
    public static readonly PortType DtoType = new("crm.ContactDTO@1", typeof(ContactDto), new("object", Fields: new() { ["id"] = new("string"), ["name"] = new("string"), ["age"] = new("optional", Inner: new("number")) }));

    public NodeRegistry Registry { get; }
    public Contact Original { get; } = new("contact-1", "Ada Lovelace");
    public Contact? Inspected { get; private set; }

    public ContactDemo()
    {
        var metadata = EntityNodeFactory.LoadContactMetadata();
        Registry = new(new(1, [EntityNodeFactory.Define(metadata)]));
        var repository = new InMemoryContactRepository([Original]);
        var types = new NodeTypeMap().Add<Contact>(ContactType).Add<ContactDto>(DtoType);
        Registry.Register(() => new GetContactNode(repository), types);
        Registry.Register(() => new InspectContactNode(contact =>
        {
            Inspected = contact;
            if (!ReferenceEquals(Original, Inspected)) throw new InvalidOperationException("Contact identity was lost.");
        }), types);
        Registry.Register<ProjectContactNode>(types);
    }

    public static ServerPlan Plan(string id = "contact-1") => new(
    [
        new("get", "crm.contact.get", 1, new Dictionary<string, InputBinding> { ["id"] = new StringInput(id) }),
        new("inspect", "crm.contact.inspect", 1, new Dictionary<string, InputBinding> { ["contact"] = new OutputInput("get", "contact") }),
        new("project", "crm.contact.toDto", 1, new Dictionary<string, InputBinding> { ["contact"] = new OutputInput("inspect", "contact") })
    ], new("project", "dto"), DemoCodecs.Contact);

    private static Dictionary<string, PortType> Ports(string name, PortType type) => new() { [name] = type };
    private static Dictionary<string, object> Values(string name, object value) => new() { [name] = value };
}
