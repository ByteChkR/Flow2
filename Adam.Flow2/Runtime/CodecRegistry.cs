using System.Text.Json;
using Flow.Contracts;
using Json.Schema;

namespace Adam.Flow2.Runtime;

public sealed record RegisteredCodec(CodecDefinition Definition, Type ClrType,
    Func<object, JsonElement> Encode, Func<JsonElement, object> Decode);

public sealed class CodecRegistry(TypeDocument types, string environment)
{
    private readonly TypeRegistry registry = new(types);
    private readonly Dictionary<(string, int), (RegisteredCodec Codec, JsonSchema Schema)> codecs = new();
    public CodecCatalog Catalog => JsonSerializer.Deserialize<CodecCatalog>(JsonSerializer.Serialize(
        new CodecCatalog(1, environment, codecs.Values.Select(c => c.Codec.Definition).ToArray()), ContractSchemas.JsonOptions), ContractSchemas.JsonOptions)!;

    public void Register(RegisteredCodec codec)
    {
        ArgumentNullException.ThrowIfNull(codec.Encode);
        ArgumentNullException.ThrowIfNull(codec.Decode);
        ArgumentNullException.ThrowIfNull(codec.ClrType);
        var definition = JsonSerializer.Deserialize<CodecDefinition>(JsonSerializer.Serialize(codec.Definition, ContractSchemas.JsonOptions), ContractSchemas.JsonOptions)!;
        var errors = TransportContracts.ValidateCatalog(new(1, environment, [definition]), registry);
        if (errors.Count != 0) throw new ContractException(errors);
        codecs.Add((definition.TypeId, definition.Version), (codec with { Definition = definition }, TransportContracts.CompileWireSchema(definition.WireSchema)));
    }

    public string Encode(CodecReference reference, object value)
    {
        var (codec, schema) = Resolve(reference);
        ValidateNative(codec, value);
        var payload = codec.Encode(value);
        if (!schema.Evaluate(payload).IsValid) Fail("wire_payload", "Encoder returned an invalid wire payload.");
        return JsonSerializer.Serialize(new WireEnvelope(1, reference.TypeId, reference.Version, payload), ContractSchemas.JsonOptions);
    }

    public object Decode(CodecReference expected, string json, TypeRef targetType)
    {
        var (codec, schema) = Resolve(expected);
        var envelope = ContractSchemas.Parse<WireEnvelope>("envelope", json);
        if (envelope.TypeId != expected.TypeId || envelope.CodecVersion != expected.Version) Fail("codec_mismatch", "Unexpected envelope codec.");
        if (!registry.IsAssignable(codec.Definition.ValueType, targetType)) Fail("codec_type", "Decoded type is incompatible with target port.");
        if (!schema.Evaluate(envelope.Payload).IsValid) Fail("wire_payload", "Invalid wire payload.");
        var result = codec.Decode(envelope.Payload);
        ValidateNative(codec, result);
        var errors = registry.ValidateValue(targetType, JsonSerializer.SerializeToElement(result, ContractSchemas.JsonOptions));
        if (errors.Count != 0) throw new ContractException(errors);
        return result;
    }

    private (RegisteredCodec Codec, JsonSchema Schema) Resolve(CodecReference reference) => codecs.TryGetValue((reference.TypeId, reference.Version), out var codec)
        ? codec : throw new ContractException([new("missing_codec", "", "Codec is not registered in this runtime.")]);
    private void ValidateNative(RegisteredCodec codec, object value)
    {
        if (!codec.ClrType.IsInstanceOfType(value)) Fail("codec_type", "Unexpected native value type.");
        var errors = registry.ValidateValue(codec.Definition.ValueType, JsonSerializer.SerializeToElement(value, ContractSchemas.JsonOptions));
        if (errors.Count != 0) throw new ContractException(errors);
    }
    private static void Fail(string code, string message) => throw new ContractException([new(code, "", message)]);
}
