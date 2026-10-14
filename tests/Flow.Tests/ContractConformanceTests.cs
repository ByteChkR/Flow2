using System.Text.Json;
using System.Text.Json.Nodes;
using Flow.Contracts;

namespace Flow.Tests;

public class ContractConformanceTests
{
    private static JsonElement Read(string path) => JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, path))).RootElement.Clone();
    private static T Model<T>(JsonElement value) => value.Deserialize<T>(ContractSchemas.JsonOptions)!;
    private static readonly JsonElement Types = Read("examples/v1/types.json");
    private static readonly JsonElement Catalog = Read("examples/v1/catalog.json");
    private static readonly TypeRegistry Registry = new(Model<TypeDocument>(Types));

    public static IEnumerable<object[]> Cases(string file) => Read($"fixtures/v1/{file}.json").EnumerateArray()
        .Select(value => new object[] { value.GetProperty("name").GetString()!, value.GetRawText() });

    [Theory]
    [MemberData(nameof(Cases), "assignability")]
    public void Assignability_matches_shared_expectations(string name, string json)
    {
        _ = name;
        using var document = JsonDocument.Parse(json);
        var test = document.RootElement;
        var source = ContractSchemas.Parse<TypeRef>("type", test.GetProperty("source").GetRawText());
        var target = ContractSchemas.Parse<TypeRef>("type", test.GetProperty("target").GetRawText());
        Assert.Equal(test.GetProperty("expected").GetBoolean(), Registry.IsAssignable(source, target));
    }

    [Theory]
    [MemberData(nameof(Cases), "flows")]
    public void Flow_validation_matches_shared_error_codes(string name, string json)
    {
        _ = name;
        using var document = JsonDocument.Parse(json);
        var test = document.RootElement;
        var result = FlowValidator.Validate(test.GetProperty("flow"), test.TryGetProperty("catalog", out var catalog) ? catalog : Catalog,
            test.TryGetProperty("types", out var types) ? types : Types);
        Assert.Equal(test.GetProperty("codes").EnumerateArray().Select(code => code.GetString()).Order(), result.Select(d => d.Code).Distinct().Order());
    }

    [Theory]
    [MemberData(nameof(Cases), "values")]
    public void Values_match_shared_expectations(string name, string json)
    {
        _ = name;
        using var document = JsonDocument.Parse(json);
        var test = document.RootElement;
        var type = ContractSchemas.Parse<TypeRef>("type", test.GetProperty("type").GetRawText());
        var value = test.TryGetProperty("value", out var item) ? item : default;
        Assert.Equal(test.GetProperty("expected").GetBoolean(), Registry.ValidateValue(type, value).Count == 0);
    }

    [Theory]
    [MemberData(nameof(Cases), "schemas")]
    public void Schemas_match_shared_expectations(string name, string json)
    {
        _ = name;
        using var document = JsonDocument.Parse(json);
        var test = document.RootElement;
        Assert.Equal(test.GetProperty("valid").GetBoolean(), ContractSchemas.Validate(test.GetProperty("schema").GetString()!, test.GetProperty("value")).Count == 0);
    }

    [Theory]
    [MemberData(nameof(Cases), "parsing")]
    public void Parsing_matches_json_number_semantics(string name, string json)
    {
        _ = name;
        using var document = JsonDocument.Parse(json);
        var test = document.RootElement;
        if (test.GetProperty("valid").GetBoolean())
            Assert.NotNull(ContractSchemas.Parse<FlowDocument>("flow", test.GetProperty("json").GetString()!));
        else
            Assert.Throws<ContractException>(() => ContractSchemas.Parse<FlowDocument>("flow", test.GetProperty("json").GetString()!));
    }

    [Theory]
    [InlineData("flow", "contact.flow")]
    [InlineData("flow", "backend.flow")]
    [InlineData("types", "types")]
    [InlineData("catalog", "catalog")]
    public void Typed_models_preserve_all_json_contents(string schema, string file)
    {
        var original = Read($"examples/v1/{file}.json");
        var json = original.GetRawText();
        object model = schema switch
        {
            "flow" => ContractSchemas.Parse<FlowDocument>(schema, json),
            "types" => ContractSchemas.Parse<TypeDocument>(schema, json),
            "catalog" => ContractSchemas.Parse<NodeCatalog>(schema, json),
            _ => throw new InvalidOperationException()
        };
        var serialized = JsonSerializer.Serialize(model, ContractSchemas.JsonOptions);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(json), JsonNode.Parse(serialized)));
    }
}
