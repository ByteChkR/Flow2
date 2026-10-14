using System.Collections;
using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;

static class ListMutationCases
{
    static void EqualityCases(Action<bool,string> check)
    {
        using var fixtures=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/value-equality-cases.json")));
        foreach(var test in fixtures.RootElement.EnumerateArray())
        {
            var type=test.GetProperty("type").Deserialize<TypeRef>(ContractSchemas.JsonOptions)!;
            var left=FlowValues.Decode(type,test.GetProperty("left"));var right=FlowValues.Decode(type,test.GetProperty("right"));
            var expected=test.GetProperty("equal").GetBoolean();var name=test.GetProperty("name").GetString()!;
            check(ValueEquality.Equal(type,left,right)==expected,name);
            if(expected)check(ValueHash.Hash(type,left)==ValueHash.Hash(type,right),"equal values hash alike: "+name);
            var index=new ValueIndex<string>(type);index.Add(left,"found");check(index.TryGet(right,out var value)==expected&&(!expected||value=="found"),"indexed equality: "+name);
            check(ValueEquality.Equal(type,right,left)==expected,"symmetric "+name);
            foreach(var operation in new[]{"removeItem","removeAll"})
            {
                var source=new[]{left,right,left};
                var result=GeneralValueRuntime.Execute(new(operation,type),new Dictionary<string,object>{{"items",source},{"item",right!}});
                var values=((IEnumerable)result["value"]).Cast<object?>().ToArray();
                check(values.Length==(operation=="removeItem"?2:expected?0:2),"structural removal "+name);
                check(operation=="removeItem"?(bool)result["removed"]:(int)result["removedCount"]==(expected?3:1),"removal count "+name);
                check(source.Length==3,"source unchanged");
            }
        }
        check(ValueEquality.Equal(new("number"),1,1m),"number equality is independent of CLR numeric representation");
        check(ValueEquality.Equal(new("scalar",Name:"core.Decimal"),1.00m,1m),"decimal scale does not affect equality");
        foreach(var type in new[]{new TypeRef("pageConfig"),new("queryable",Items:new("string")),new("object",Fields:new(){{"query",new("queryable",Items:new("string"))}})})
        {
            check(!ValueEqualityContract.Supports(type),"unsupported equality type rejected");
            try{GeneralValueNodes.Definition(new("invalid","Standard.Values.List.RemoveItem",1,"server",[],Value:new("removeItem",type)));throw new Exception("Unsupported equality accepted");}catch(ContractException){check(true,"invalid removal specialization rejected");}
        }
    }
    public static void Run(Action<bool,string> check)
    {
        EqualityCases(check);
        using var fixtures=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/list-mutation-cases.json")));
        foreach(var test in fixtures.RootElement.EnumerateArray())
        {
            var operation=test.GetProperty("operation").GetString()!;
            var definition=GeneralValueNodes.Definition(new("mutation",GeneralValueNodes.NodeType("mutation",operation),1,"server",[],Value:new(operation,new("string"))));
            var node=ValueRuntimeNodes.Create(definition);var registry=new NodeRegistry();
            var inputs=test.GetProperty("inputs").EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value.ValueKind switch {
                JsonValueKind.Array=>(object)p.Value.EnumerateArray().Select(x=>x.GetString()!).ToList(),
                JsonValueKind.Number=>p.Value.GetInt32(),_=>p.Value.GetString()!});
            var before=JsonSerializer.Serialize(inputs);
            registry.ValidatePorts(node.Definition.Inputs,inputs);
            if(test.TryGetProperty("error",out var error))
            {
                try{node.Execute!(inputs);throw new Exception("Invalid list bounds accepted: "+operation);}
                catch(ArgumentOutOfRangeException ex){check(ex.ParamName==error.GetString(),operation+" reports invalid input");}
            }
            else
            {
                var result=node.Execute!(inputs);registry.ValidatePorts(node.Definition.Outputs,result);
                check(((IEnumerable)result["value"]).Cast<object?>().Select(x=>(string?)x).SequenceEqual(test.GetProperty("expected").GetProperty("value").EnumerateArray().Select(x=>x.GetString())),operation+" matches shared browser fixture");
                if(test.GetProperty("expected").TryGetProperty("removedItem",out var removed))check((string)result["removedItem"]==removed.GetString(),"RemoveAt returns removed element");
                foreach(var port in new[]{"removed","removedCount"})if(test.GetProperty("expected").TryGetProperty(port,out var expected))check(JsonSerializer.SerializeToElement(result[port]).GetRawText()==expected.GetRawText(),operation+" reports removals");
                check(!ReferenceEquals(result["value"],inputs["items"]),operation+" returns new container");
            }
            check(JsonSerializer.Serialize(inputs)==before,operation+" preserves input");
            check(GeneralValueNodes.Templates().Any(t=>t.Type==definition.Type),operation+" has catalog template");
        }
        var nullable=new TypeRef("nullable",Inner:new("string"));
        var removedNull=GeneralValueRuntime.Execute(new("removeAt",nullable),new Dictionary<string,object>{{"items",new object?[]{null,"a"}},{"index",0}});
        check(removedNull.ContainsKey("removedItem")&&removedNull["removedItem"] is null,"RemoveAt preserves null");
        var entity=new object();var source=new[]{entity};
        var added=GeneralValueRuntime.Execute(new("addItem",new("entity",Name:"test.Entity@1")),new Dictionary<string,object>{{"items",source},{"item",entity}});
        check(((IEnumerable)added["value"]).Cast<object>().All(x=>ReferenceEquals(x,entity)),"List operations preserve object identity");
    }
}
