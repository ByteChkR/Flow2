using System.Text.Json;
using Adam.Flow2.Runtime;
using Flow.Contracts;
using Flow.Nodes.Server;
using Flow.Runtime.Jint;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Flow.Tests;

public class NodeCatalogTests
{
    [Fact]
    public void Get_definition_follows_runtime_metadata_including_version_and_fields()
    {
        var metadata = EntityNodeFactory.LoadContactMetadata() with { TypeId = "crm.Contact@2", GetNodeType = "crm.contact.getV2", NodeVersion = 2 };
        metadata.Fields.Add("nickname", new("optional", Inner: new("string")));
        var registry = new NodeRegistry(new(1, [EntityNodeFactory.Define(metadata)]));
        registry.Register(EntityNodeFactory.CreateGet(metadata, id => new Contact(id, "Ada")));
        Assert.True(registry.Types.Types[0].Fields.ContainsKey("nickname"));
        var definition = Assert.Single(registry.Catalog.Nodes);
        Assert.Equal("crm.Contact@2", definition.Outputs["contact"].Name);
        Assert.Equal(2, definition.Version);
        Assert.Equal("crm.contact.getV2", definition.Type);
        Assert.Throws<InvalidOperationException>(() => registry.Resolve(definition.Type, 1));
        Assert.Throws<InvalidOperationException>(() => registry.Resolve(definition.Type, 2, "browser"));
        Assert.IsType<Contact>(registry.Resolve(definition.Type, 2, "server").Execute(new Dictionary<string, object> { ["id"] = "contact-2" })["contact"]);
    }

    [Fact]
    public void Registered_versions_remain_independent_and_duplicates_fail()
    {
        var registry = new NodeRegistry();
        RegisteredNode Create(int version) => new(new("echo", version, new Dictionary<string, PortType>(),
            new Dictionary<string, PortType> { ["value"] = ContactDemo.StringType }), _ => new Dictionary<string, object> { ["value"] = version.ToString() });
        registry.Register(Create(1)); registry.Register(Create(2));
        Assert.Throws<ArgumentException>(() => registry.Register(Create(1)));
        foreach (var version in new[] { 1, 2 })
        {
            var plan = new ServerPlan([new("echo", "echo", version, new Dictionary<string, InputBinding>())], new("echo", "value"), DemoCodecs.String);
            Assert.Equal(version.ToString(), TestRuntimes.Runner(registry).Execute(plan).Value.GetString());
        }
    }

    [Fact]
    public void Jint_rejects_a_browser_step_before_invocation()
    {
        var demo = new ContactDemo();
        var plan = ContactDemo.Plan();
        var steps = plan.Steps.ToArray(); steps[0] = steps[0] with { Environment = "browser" };
        Assert.Throws<InvalidOperationException>(() => TestRuntimes.Runner(demo.Registry).Execute(plan with { Steps = steps }));
        Assert.Null(demo.Inspected);
    }

    [Fact]
    public void Jint_allows_an_unconnected_optional_input()
    {
        var registry = new NodeRegistry();
        registry.Register(new(new("optional", 1,
            new Dictionary<string, PortType> { ["value"] = new("optional-string", typeof(string), new("optional", Inner: new("string"))) },
            new Dictionary<string, PortType> { ["value"] = ContactDemo.StringType }),
            inputs => new Dictionary<string, object> { ["value"] = inputs.TryGetValue("value", out var value) ? value : "default" }));
        var plan = new ServerPlan([new("optional", "optional", 1, new Dictionary<string, InputBinding>())], new("optional", "value"), DemoCodecs.String);
        Assert.Equal("default", TestRuntimes.Runner(registry).Execute(plan).Value.GetString());
    }

    [Fact]
    public void Catalog_is_a_detached_schema_valid_snapshot()
    {
        var registry = new ContactDemo().Registry;
        var catalog = registry.Catalog;
        catalog.Nodes[0].Outputs["contact"] = new("number");
        Assert.Equal("entity", registry.Catalog.Nodes[0].Outputs["contact"].Kind);
        Assert.Empty(ContractSchemas.Validate("catalog", JsonSerializer.SerializeToElement(registry.Catalog, ContractSchemas.JsonOptions)));
        Assert.Empty(ContractSchemas.Validate("types", JsonSerializer.SerializeToElement(registry.Types, ContractSchemas.JsonOptions)));
    }

    [Fact]
    public async Task Http_endpoints_publish_only_the_declarative_runtime_catalog()
    {
        await using var app = new WebApplicationFactory<Program>();
        using var client = app.CreateClient();
        var catalogJson = await client.GetStringAsync("/api/catalog");
        var typesJson = await client.GetStringAsync("/api/types");
        var catalog = ContractSchemas.Parse<NodeCatalog>("catalog", catalogJson);
        var types = ContractSchemas.Parse<TypeDocument>("types", typesJson);
        Assert.Equal(4, catalog.Nodes.Length);
        Assert.Contains(catalog.Nodes, node => node.Type == "input.contactId" && node.Environments.SequenceEqual(["server"]));
        Assert.Equal("crm.Contact@1", Assert.Single(types.Types).Id);
        Assert.Contains(catalog.Nodes, node => node.Type == "crm.contact.get" && node.Environments.SequenceEqual(["server"]));
        Assert.DoesNotContain("execute", catalogJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("clrType", catalogJson, StringComparison.OrdinalIgnoreCase);
        var published = new ContactDemo(); Flow.Api.Orchestrator.RegisterInput(published);
        Assert.Equal(JsonSerializer.Serialize(published.Registry.Catalog, ContractSchemas.JsonOptions), catalogJson);
    }
}
