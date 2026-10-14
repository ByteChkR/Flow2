using System.Text.Json;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;

public static class ValueCodecRegistration
{
    public static void RegisterValues(this CodecRegistry codecs,NodeCatalog catalog)
    {
        var known=codecs.Catalog.Codecs.Select(codec=>GraphNodes.CodecIdentity(codec.ValueType)).ToHashSet(StringComparer.Ordinal);
        // Connected values can omit the optional wrapper while retaining nullability.
        foreach(var type in catalog.Nodes.SelectMany(node=>node.Inputs.Values.Concat(node.Outputs.Values))
                    .SelectMany(type=>type.Kind=="optional"?new[]{type,type.Inner!}:new[]{type}))
        {
            if(type.Kind is not ("dictionary" or "pageConfig" or "array" or "object" or "nullable" or "optional" or "entityRef" or "number" or "boolean" or "null") || !TransportContracts.IsTransportable(type))continue;
            if(!known.Add(GraphNodes.CodecIdentity(type)))continue;
            codecs.RegisterValue(type);
        }
    }

    public static CodecReference RegisterValue(this CodecRegistry codecs,TypeRef type)
    {
        type=JsonSerializer.Deserialize<TypeRef>(JsonSerializer.Serialize(type,ContractSchemas.JsonOptions),ContractSchemas.JsonOptions)!;
        var definition=ValueCodecs.Definition(type);
        var registry=codecs.ValueTypes;
        var errors=registry.Check(type);
        if(errors.Count!=0)throw new ContractException(errors);
        codecs.Register(new(definition,FlowValues.ClrType(type),
            value=>value is FlowAbsent&&type.Kind=="optional"?JsonSerializer.SerializeToElement(new Dictionary<string,object>()):JsonSerializer.SerializeToElement(new{value=FlowValues.Encode(type,value)}),
            payload=>
            {
                if(type.Kind=="optional"&&!payload.TryGetProperty("value",out _))return FlowAbsent.Value;
                var wire=payload.GetProperty("value");
                var errors=registry.ValidateValue(type,wire,"/value");
                if(errors.Count!=0)throw new ContractException(errors);
                return FlowValues.Decode(type,wire);
            }));
        return new(definition.TypeId,definition.Version);
    }
}
