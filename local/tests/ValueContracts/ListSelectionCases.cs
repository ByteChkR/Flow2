using System.Collections;
using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;

static class ListSelectionCases
{
    public static void Run(Action<bool,string> check, string fixture="list-selection-cases.json")
    {
        using var fixtures=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/"+fixture)));
        var types=new TypeDocument(1,[new("test.Customer@1","entity",[])]);
        var registry=new NodeRegistry(types);
        foreach(var test in fixtures.RootElement.EnumerateArray())
        {
            var operation=test.GetProperty("operation").GetString()!;
            var type=test.GetProperty("type").Deserialize<TypeRef>(ContractSchemas.JsonOptions)!;
            var definition=GeneralValueNodes.Definition(new("selection",GeneralValueNodes.NodeType("selection",operation),1,"server",[],Value:new(operation,type,Result:test.TryGetProperty("result",out var resultType)?resultType.Deserialize<TypeRef>(ContractSchemas.JsonOptions):null)));
            var node=ValueRuntimeNodes.Create(definition);
            var inputs=definition.Inputs.Where(p=>test.GetProperty("inputs").TryGetProperty(p.Key,out _)).ToDictionary(p=>p.Key,p=>FlowValues.Decode(p.Value,test.GetProperty("inputs").GetProperty(p.Key)));
            var before=FlowValues.Encode(definition.Inputs["items"],inputs["items"]);
            registry.ValidatePorts(node.Definition.Inputs,inputs);
            if(test.TryGetProperty("error",out var error))
            {
                Exception? failure=null;
                try{node.Execute(inputs);}catch(Exception ex){failure=ex;}
                check(failure is not null&&failure.Message.Contains(error.GetString()!,StringComparison.OrdinalIgnoreCase),operation+" reports invalid input");
            }
            else
            {
                var result=node.Execute(inputs);registry.ValidatePorts(node.Definition.Outputs,result);
                var expected=test.GetProperty("expected");
                check(result.Count==expected.EnumerateObject().Count(),operation+" preserves absent outputs");
                foreach(var output in expected.EnumerateObject())check(result.ContainsKey(output.Name)&&TransportContracts.Equivalent(FlowValues.Encode(definition.Outputs[output.Name],result[output.Name]),output.Value),operation+" matches shared fixture: "+output.Name);
                if(definition.Outputs["value"].Kind=="array")check(!ReferenceEquals(result["value"],inputs["items"]),operation+" returns new container");
            }
            check(TransportContracts.Equivalent(before,FlowValues.Encode(definition.Inputs["items"],inputs["items"])),operation+" preserves input");
            check(GeneralValueNodes.Templates().Any(t=>t.Type==definition.Type),operation+" is in catalog");
        }
        var item=new object();var entity=new TypeRef("entity",Name:"test.Native@1");
        foreach(var operation in new[]{"first","last","single","tryFirst","tryLast","trySingle","tryGetItem"})
        {
            var result=GeneralValueRuntime.Execute(new(operation,entity),new Dictionary<string,object>{{"items",new[]{item}},{"index",0}});
            check(ReferenceEquals(result["value"],item),operation+" preserves native identity");
        }
        var calls=0;
        foreach(var operation in new[]{"contains","indexOf"})
        {
            calls=0;
            GeneralValueRuntime.Execute(new(operation,entity),new Dictionary<string,object>{{"items",new[]{item,new object()}},{"item",item}},(_,a,b)=>{calls++;return ReferenceEquals(a,b);});
            check(calls==1,operation+" short-circuits after first match");
        }
    }
}
