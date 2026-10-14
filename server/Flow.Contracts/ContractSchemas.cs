using System.Text.Json;
using System.Text.Json.Serialization;
using Json.Schema;

namespace Flow.Contracts;

public static class ContractSchemas
{
    public static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false,
        Converters = { new SchemaIntegerConverter() }
    };
    // JSON Schema integers include number spellings such as 1.0 and 1e0.
    private sealed class SchemaIntegerConverter : JsonConverter<int>
    {
        public override int Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
        {
            if (reader.TokenType != JsonTokenType.Number) throw new JsonException("Expected integer.");
            if (reader.TryGetInt32(out var integer)) return integer;
            var number = reader.GetDouble();
            if (!double.IsFinite(number) || number != Math.Truncate(number) || number < int.MinValue || number > int.MaxValue)
                throw new JsonException("Expected Int32 integer.");
            return (int)number;
        }
        public override void Write(Utf8JsonWriter writer, int value, JsonSerializerOptions options) => writer.WriteNumberValue(value);
    }

    private static readonly IReadOnlyDictionary<string, JsonSchema> Schemas = Load();

    private static Dictionary<string, JsonSchema> Load()
    {
        var options = new BuildOptions { Dialect = Dialect.Draft202012, SchemaRegistry = new() };
        var result = new Dictionary<string, JsonSchema>();
        foreach (var name in new[] { "type", "types", "catalog", "flow", "codecs", "envelope" })
        {
            using var stream = typeof(ContractSchemas).Assembly.GetManifestResourceStream($"Schemas.{name}.schema.json")
                ?? throw new InvalidOperationException($"Missing embedded schema {name}.");
            using var document = JsonDocument.Parse(stream);
            result.Add(name, JsonSchema.Build(document.RootElement.Clone(), options));
        }
        return result;
    }

    public static IReadOnlyList<Diagnostic> Validate(string name, JsonElement value)
    {
        var result = Schemas[name].Evaluate(value, new EvaluationOptions { OutputFormat = OutputFormat.List });
        return result.IsValid ? [] : Flatten(result).ToArray();
    }

    private static IEnumerable<Diagnostic> Flatten(EvaluationResults result)
    {
        if (result.Errors is not null)
            foreach (var error in result.Errors) yield return new("schema", result.InstanceLocation.ToString(), error.Value);
        if (result.Details is not null)
            foreach (var detail in result.Details)
                foreach (var error in Flatten(detail)) yield return error;
    }

    public static T Parse<T>(string name, string json)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var errors = Validate(name, document.RootElement);
            if (errors.Count != 0) throw new ContractException(errors);
            return document.RootElement.Deserialize<T>(JsonOptions)!;
        }
        catch (JsonException)
        {
            throw new ContractException([new("json", "", "Invalid JSON.")]);
        }
    }
}
