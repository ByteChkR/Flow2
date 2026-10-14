using System.Text.Json;
namespace Adam.Flow2.Contracts;

/// <summary>Deterministic wire contracts for materialized, transportable values.</summary>
public static class ValueCodecs
{
    public static CodecDefinition Definition(TypeRef type)
    {
        if (!TransportContracts.IsTransportable(type)) throw new InvalidOperationException("Native entities require an explicit projection.");
        var schema=new Dictionary<string,object>{
            ["$schema"]="https://json-schema.org/draft/2020-12/schema",["type"]="object",
            ["properties"]=new Dictionary<string,object>{{"value",Schema(type.Kind=="optional"?type.Inner!:type)}},
            ["required"]=type.Kind=="optional"?Array.Empty<string>():new[]{"value"},["additionalProperties"]=false
        };
        return new(GraphNodes.CodecIdentity(type,"core.Value."),1,type,JsonSerializer.SerializeToElement(schema));
    }
    private static object Schema(TypeRef type)=>type.Kind switch
    {
        "scalar"=>new{type=type.Name=="core.Bool"?"boolean":type.Name=="core.Integer"?"integer":"string"},
        "pageConfig"=>new{type="object"},
        "number" or "string" or "boolean" or "null"=>new{type=type.Kind},
        "nullable"=>new{anyOf=new object[]{new{type="null"},Schema(type.Inner!)}},
        "dictionary"=>Schema(DictionaryContract.Shape(type.Items!)),
        "array"=>new{type="array",items=Schema(type.Items!)},
        "object"=>new{type="object",properties=type.Fields!.OrderBy(p=>p.Key,StringComparer.Ordinal).ToDictionary(p=>p.Key,p=>Schema(p.Value.Kind=="optional"?p.Value.Inner!:p.Value)),required=type.Fields!.Where(p=>p.Value.Kind!="optional").Select(p=>p.Key).Order(StringComparer.Ordinal).ToArray(),additionalProperties=false},
        "entityRef"=>new{type="object",properties=new Dictionary<string,object>{{"type",new{type="string",@const=type.Name}},{"id",new{type="string",minLength=1}}},required=new[]{"type","id"},additionalProperties=false},
        "graph"=>new{type="object",properties=new Dictionary<string,object>{{"graphId",new{type="string",pattern="^[A-Za-z_][A-Za-z0-9_.-]*$"}},{"revision",new{type="integer",minimum=1,maximum=int.MaxValue}}},required=new[]{"graphId","revision"},additionalProperties=false},
        _=>throw new InvalidOperationException("Absent values are allowed only as optional record fields in a value codec.")
    };
}
