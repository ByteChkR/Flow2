using Adam.Flow2.Runtime;
namespace Flow.Nodes.Server;

[FlowNode("crm.contact.get", Label = "Kontakt laden", Category = "Kontakte", Description = "Lädt eine native Contact-Entity anhand ihrer ID.")]
public sealed class GetContactNode(InMemoryContactRepository repository) : IFlowNode
{
    [FlowInput("id", Label = "Kontakt-ID", Description = "ID des Kontakts im Repository; eine unbekannte ID führt zu einem Fehler.")]
    public string Id { get; set; } = "";
    [FlowOutput("contact", Label = "Kontakt")]
    public Contact Contact { get; private set; } = null!;
    public void Execute() => Contact = repository.GetById(Id);
}

[FlowNode("crm.contact.inspect", Label = "Kontakt prüfen", Category = "Kontakte", Description = "Prüft im Demo-Flow die Referenzidentität der Entity.")]
public sealed class InspectContactNode(Action<Contact> inspect) : IFlowNode
{
    [FlowInput("contact", Label = "Kontakt", Description = "Native Kontakt-Instanz aus derselben Backend-Laufzeit.")]
    public Contact Input { get; set; } = null!;
    [FlowOutput("contact", Label = "Kontakt")]
    public Contact Output { get; private set; } = null!;
    public void Execute() { inspect(Input); Output = Input; }
}

[FlowNode("crm.contact.toDto", Label = "Kontakt als DTO", Category = "Kontakte", Description = "Projiziert die lokale Entity für eine JSON-Übergabe.")]
public sealed class ProjectContactNode : IFlowNode
{
    [FlowInput("contact", Label = "Kontakt", Description = "Native Kontakt-Instanz aus derselben Backend-Laufzeit.")]
    public Contact Contact { get; set; } = null!;
    [FlowOutput("dto", Label = "Kontakt-DTO")]
    public ContactDto Dto { get; private set; } = null!;
    public void Execute() => Dto = new(Contact.Id, Contact.Name);
}

[FlowNode("input.contactId", Label = "Kontakt-ID", Category = "Eingaben", Description = "Liefert die konfigurierte Kontakt-ID aus initialValue.")]
public sealed class ContactIdNode : IFlowNode
{
    [FlowConfig("initialValue", "contact-1", Label = "Kontakt-ID")]
    public string InitialValue { get; set; } = "";
    [FlowOutput("id", Label = "Kontakt-ID")]
    public string Id { get; private set; } = "";
    public void Execute() => Id = InitialValue;
}
