using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Adam.Flow2.Runtime;
using Flow.Contracts;
using Flow.Nodes.Server;
using Flow.Runtime.Jint;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Flow.Tests;

public class TransportTests
{
    private static readonly TypeDocument Types = ContractSchemas.Parse<TypeDocument>("types", File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "examples/v1/types.json")));
    private static readonly TypeRegistry TypeRegistry = new(Types);
    private static T Model<T>(JsonElement value) => value.Deserialize<T>(ContractSchemas.JsonOptions)!;
    public static IEnumerable<object[]> Cases(string file)
    {
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, $"fixtures/v1/{file}.json")));
        return json.RootElement.EnumerateArray().Select(test => new object[] { test.GetProperty("name").GetString()!, test.GetRawText() }).ToArray();
    }

    [Theory]
    [MemberData(nameof(Cases), "boundaries")]
    public void Boundary_decisions_match_the_browser(string name, string json)
    {
        _ = name; using var document = JsonDocument.Parse(json); var test = document.RootElement;
        var reference = test.GetProperty("codec");
        var errors = TransportContracts.ValidateBoundary(Model<TypeRef>(test.GetProperty("source")), Model<TypeRef>(test.GetProperty("target")),
            reference.ValueKind == JsonValueKind.Null ? null : Model<CodecReference>(reference), Model<CodecCatalog>(test.GetProperty("sender")), Model<CodecCatalog>(test.GetProperty("receiver")), TypeRegistry);
        Assert.Equal(test.GetProperty("codes").EnumerateArray().Select(code => code.GetString()).Order(), errors.Select(error => error.Code).Distinct().Order());
    }

    [Theory]
    [MemberData(nameof(Cases), "payloads")]
    public void Target_rejects_tampering_with_the_same_errors_as_browser(string name, string json)
    {
        _ = name; using var document = JsonDocument.Parse(json); var test = document.RootElement;
        var registry = DemoCodecs.Create(Types);
        var expected = test.GetProperty("codes").EnumerateArray().Select(code => code.GetString()).ToArray();
        if (expected.Length == 0)
        {
            var result = registry.Decode(DemoCodecs.Contact, test.GetProperty("json").GetString()!, ContactDemo.DtoType.ContractType);
            Assert.Equal(new ContactDto("contact-1", "Ada", 37), result);
        }
        else
        {
            var error = Assert.Throws<ContractException>(() => registry.Decode(DemoCodecs.Contact, test.GetProperty("json").GetString()!, ContactDemo.DtoType.ContractType));
            Assert.Equal(expected.Order(), error.Diagnostics.Select(d => d.Code).Distinct().Order());
        }
    }

    [Fact]
    public void Compiler_boundary_validation_also_runs_independently_in_dotnet()
    {
        JsonElement Read(string file) => JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, $"examples/v1/{file}.json")));
        var flow = Read("contact.flow"); var catalog = Read("catalog"); var types = Read("types");
        Assert.Empty(TransportContracts.ValidateFlow(flow, catalog, types, DemoCodecs.Definitions("server"), DemoCodecs.Definitions("browser")));
        var modified = JsonNode.Parse(flow.GetRawText())!;
        modified["connections"]![3]!.AsObject().Remove("codec");
        var errors = TransportContracts.ValidateFlow(JsonSerializer.SerializeToElement(modified), catalog, types, DemoCodecs.Definitions("server"), DemoCodecs.Definitions("browser"));
        Assert.Contains(errors, error => error.Code == "missing_codec");
    }

    [Fact]
    public void Encode_only_implementation_cannot_advertise_a_codec()
    {
        var definition = DemoCodecs.Definitions("server").Codecs[1];
        var registry = new CodecRegistry(Types, "server");
        Assert.Throws<ArgumentNullException>(() => registry.Register(new(definition, typeof(ContactDto), _ => default, null!)));
        Assert.Empty(registry.Catalog.Codecs);
    }

    [Fact]
    public void Missing_target_codec_prevents_any_node_from_executing()
    {
        var ran = false; var nodes = new NodeRegistry();
        nodes.Register(new(new("source", 1, new Dictionary<string, PortType>(), new Dictionary<string, PortType> { ["value"] = ContactDemo.StringType }),
            _ => { ran = true; return new Dictionary<string, object> { ["value"] = "test" }; }));
        var runner = new ServerSegmentRunner(nodes, DemoCodecs.Create(nodes.Types), new(1, "browser", []));
        var plan = new ServerPlan([new("source", "source", 1, new Dictionary<string, InputBinding>())], new("source", "value"), DemoCodecs.String);
        var error = Assert.Throws<ContractException>(() => runner.Execute(plan));
        Assert.Contains(error.Diagnostics, diagnostic => diagnostic.Code == "missing_codec");
        Assert.False(ran);
    }

    private sealed class Canary
    {
        public string Secret => throw new InvalidOperationException("A local entity was serialized or reflected over.");
    }

    [Fact]
    public void Native_entities_are_never_serialized_or_exposed_to_jint()
    {
        var entity = new Canary();
        var nodes = new NodeRegistry(new(1, [new("test.Canary@1", "entity", new())]));
        var native = new PortType("test.Canary@1", typeof(Canary), new("entity", Name: "test.Canary@1"));
        var ports = new Dictionary<string, PortType> { ["entity"] = native };
        nodes.Register(new(new("get", 1, new Dictionary<string, PortType>(), ports), _ => new Dictionary<string, object> { ["entity"] = entity }));
        nodes.Register(new(new("inspect", 1, ports, ports), inputs =>
        {
            Assert.Same(entity, inputs["entity"]); Assert.IsType<Canary>(inputs["entity"]); return inputs;
        }));
        nodes.Register(new(new("project", 1, ports, new Dictionary<string, PortType> { ["value"] = ContactDemo.StringType }), inputs =>
        {
            Assert.Same(entity, inputs["entity"]); return new Dictionary<string, object> { ["value"] = "safe projection" };
        }));
        var plan = new ServerPlan([
            new("get", "get", 1, new Dictionary<string, InputBinding>()),
            new("inspect", "inspect", 1, new Dictionary<string, InputBinding> { ["entity"] = new OutputInput("get", "entity") }),
            new("project", "project", 1, new Dictionary<string, InputBinding> { ["entity"] = new OutputInput("inspect", "entity") })], new("project", "value"), DemoCodecs.String);
        Assert.Equal("safe projection", TestRuntimes.Runner(nodes).Execute(plan).Value.GetString());
    }

    [Fact]
    public void Broken_encoders_and_decoders_are_rejected()
    {
        var definition = DemoCodecs.Definitions("server").Codecs.Single(codec => codec.TypeId == DemoCodecs.Contact.TypeId);
        var brokenEncoder = new CodecRegistry(Types, "server");
        brokenEncoder.Register(new(definition, typeof(ContactDto), _ => JsonSerializer.SerializeToElement(new { id = "1" }), payload => payload.Deserialize<ContactDto>(ContractSchemas.JsonOptions)!));
        Assert.Throws<ContractException>(() => brokenEncoder.Encode(DemoCodecs.Contact, new ContactDto("1", "Ada")));
        var brokenDecoder = new CodecRegistry(Types, "server");
        brokenDecoder.Register(new(definition, typeof(ContactDto), value => JsonSerializer.SerializeToElement(value, ContractSchemas.JsonOptions), _ => new ContactDto("1", null!)));
        var valid = DemoCodecs.Create(Types).Encode(DemoCodecs.Contact, new ContactDto("1", "Ada"));
        Assert.Throws<ContractException>(() => brokenDecoder.Decode(DemoCodecs.Contact, valid, definition.ValueType));
    }

    [Fact]
    public void Local_entity_codec_cannot_be_registered_even_with_an_encoder()
    {
        var definition = DemoCodecs.Definitions("server").Codecs[1] with { ValueType = new("entity", Name: "crm.Contact@1") };
        var error = Assert.Throws<ContractException>(() => new CodecRegistry(Types, "server").Register(new(definition, typeof(Contact), _ => throw new Exception(), _ => throw new Exception())));
        Assert.Contains(error.Diagnostics, diagnostic => diagnostic.Code == "not_transportable");
    }

    [Fact]
    public void Entity_reference_roundtrips_without_rehydrating_a_native_entity()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "fixtures/v1/boundaries.json")));
        var definition = Model<CodecCatalog>(fixture.RootElement.EnumerateArray().Single(test => test.GetProperty("name").GetString() == "entity-ref").GetProperty("sender")).Codecs[0];
        var registry = new CodecRegistry(Types, "server");
        registry.Register(new(definition, typeof(JsonElement), value => (JsonElement)value, payload => payload.Clone()));
        var value = JsonSerializer.SerializeToElement(new { type = "crm.Contact@1", id = "contact-1" });
        var reference = new CodecReference(definition.TypeId, definition.Version);
        var decoded = Assert.IsType<JsonElement>(registry.Decode(reference, registry.Encode(reference, value), definition.ValueType));
        Assert.True(JsonElement.DeepEquals(value, decoded));
    }

    [Fact]
    public async Task Http_demo_roundtrips_input_and_dto_and_rejects_tampered_requests()
    {
        await using var app = new WebApplicationFactory<Program>(); using var client = app.CreateClient();
        var serverCatalog = ContractSchemas.Parse<CodecCatalog>("codecs", await client.GetStringAsync("/api/codecs"));
        var browser = DemoCodecs.Create(Types, "browser");
        Assert.Empty(TransportContracts.ValidateBoundary(ContactDemo.DtoType.ContractType, ContactDemo.DtoType.ContractType, DemoCodecs.Contact, serverCatalog, browser.Catalog, TypeRegistry));
        var input = JsonNode.Parse(browser.Encode(DemoCodecs.String, "contact-1"));
        using var response = await client.PostAsJsonAsync("/api/demo/transport/contact", new { browserCodecs = browser.Catalog, input }, ContractSchemas.JsonOptions);
        response.EnsureSuccessStatusCode();
        var decoded = browser.Decode(DemoCodecs.Contact, await response.Content.ReadAsStringAsync(), ContactDemo.DtoType.ContractType);
        Assert.Equal(new ContactDto("contact-1", "Ada Lovelace"), decoded);
        input!["payload"] = 42;
        using var badPayload = await client.PostAsJsonAsync("/api/demo/transport/contact", new { browserCodecs = browser.Catalog, input }, ContractSchemas.JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, badPayload.StatusCode);
        using var missingCodec = await client.PostAsJsonAsync("/api/demo/transport/contact", new { browserCodecs = new CodecCatalog(1, "browser", []), input }, ContractSchemas.JsonOptions);
        Assert.Equal(HttpStatusCode.BadRequest, missingCodec.StatusCode);
        Assert.Contains("missing_codec", await missingCodec.Content.ReadAsStringAsync());
    }
}
