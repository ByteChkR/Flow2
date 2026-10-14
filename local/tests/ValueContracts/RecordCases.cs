using System.Collections;
using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;

static class RecordCases
{
    public static void Run(Action<bool,string> check, string fixture="record-cases.json")
    {
        using var fixtures=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/"+fixture)));
        var types=new TypeDocument(1,[new("test.Customer@1","entity",[])]);
        var registry=new NodeRegistry(types);
        foreach(var test in fixtures.RootElement.EnumerateArray())
        {
            var operation=test.GetProperty("operation").GetString()!;
            var type=test.GetProperty("type").Deserialize<TypeRef>(ContractSchemas.JsonOptions)!;
            var definition=GeneralValueNodes.Definition(new("selection",GeneralValueNodes.NodeType("selection",operation),1,"server",[],Value:new(operation,type,Member:test.TryGetProperty("member",out var member)?member.GetString():null,Result:test.TryGetProperty("result",out var resultType)?resultType.Deserialize<TypeRef>(ContractSchemas.JsonOptions):null)));
            var node=ValueRuntimeNodes.Create(definition);
            var inputs=definition.Inputs.Where(p=>test.GetProperty("inputs").TryGetProperty(p.Key,out _)).ToDictionary(p=>p.Key,p=>FlowValues.Decode(p.Value,test.GetProperty("inputs").GetProperty(p.Key)));
            var before=inputs.ToDictionary(p=>p.Key,p=>FlowValues.Encode(definition.Inputs[p.Key],p.Value));
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
                if(operation is "merge" or "removeField" or "dictCreate" or "dictSet" or "dictRemove" or "dictKeys" or "dictValues")check(inputs.Values.All(input=>!ReferenceEquals(result["value"],input)),operation+" returns new container");
            }
            foreach(var input in inputs)check(TransportContracts.Equivalent(before[input.Key],FlowValues.Encode(definition.Inputs[input.Key],input.Value)),operation+" preserves input");
            check(GeneralValueNodes.Templates().Any(t=>t.Type==definition.Type),operation+" is in catalog");
        }
    }
}
