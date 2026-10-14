using System.Text.Json;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;

public static class ScalarCodecs
{
    public static void RegisterScalars(this CodecRegistry codecs)
    {
        foreach (var name in ScalarValues.Names)
        {
            var type=new TypeRef("scalar",Name:name);
            var schema=JsonSerializer.SerializeToElement(new Dictionary<string,object>{
                ["$schema"]="https://json-schema.org/draft/2020-12/schema",
                ["type"]=name=="core.Bool"?"boolean":name=="core.Integer"?"integer":"string"
            });
            codecs.Register(new(new(name,1,type,schema),FlowValues.ClrType(type),
                value=>FlowValues.Encode(type,value),payload=>
                {
                    if(!ScalarValues.IsValue(name,payload))throw new FormatException($"Expected canonical {name} payload.");
                    return FlowValues.Decode(type,payload);
                }));
        }
    }
}
