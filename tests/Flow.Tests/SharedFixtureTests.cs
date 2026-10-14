using System.Text.Json.Nodes;

namespace Flow.Tests;

public class SharedFixtureTests
{
    [Fact]
    public void Reads_and_roundtrips_the_same_fixture_as_vitest()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "fixtures", "tooling", "json-roundtrip.json");
        var value = JsonNode.Parse(File.ReadAllText(path))!;
        Assert.Equal("infrastructure-only", value["purpose"]!.GetValue<string>());
        Assert.Equal("Grüße 👋", value["text"]!.GetValue<string>());
        Assert.Equal(42.5, value["number"]!.GetValue<double>());
        Assert.Null(value["optionalValue"]);
        Assert.True(JsonNode.DeepEquals(value, JsonNode.Parse(value.ToJsonString())));
    }
}
