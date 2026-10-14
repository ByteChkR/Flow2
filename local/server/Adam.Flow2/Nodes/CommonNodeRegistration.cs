using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;

namespace Adam.Flow2.Nodes;

/// <summary>Shared portable registrations for standalone and application runtimes.</summary>
public static class CommonNodeRegistration
{
    public static void RegisterCommonNodes(NodeRegistry nodes)
    {
        BinaryNodes.Register(nodes);
        JsonValueNodes.Register(nodes);
        ScalarNodes.Register(nodes);
        ExtendedScalarNodes.Register(nodes);
        FormattingNodes.Register(nodes);
        foreach (var template in GeneralValueNodes.Templates()) nodes.Register(ValueRuntimeNodes.Create(template));
        nodes.Register(ValueRuntimeNodes.Create(ValueNodes.Template()));
        nodes.Register<Start>();
        nodes.Register<Wait>();
        nodes.Register<Print>();
        nodes.Register<Error>();
        nodes.Register<ConstantDate>();
        nodes.Register<ConstantString>();
        nodes.Register<ConstantImage>();
    }

    // Call once for a fresh codec registry; metadata forks already contain these codecs.
    public static void RegisterCommonCodecs(CodecRegistry codecs)
    {
        codecs.RegisterScalars();
        codecs.Register(new(new("core.String", 1, new("string"), JsonSerializer.SerializeToElement(new Dictionary<string,string> { ["$schema"] = "https://json-schema.org/draft/2020-12/schema", ["type"] = "string" })), typeof(string), value => JsonSerializer.SerializeToElement((string)value), payload => payload.GetString()!));
    }
}
