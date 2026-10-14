using System.Text.Json;
using Adam.Flow2.Contracts;

static class ConditionalInputCases
{
    public static void Run(Action<bool,string> check)
    {
        using var catalog=JsonDocument.Parse("""
        {"schemaVersion":1,"nodes":[
          {"type":"start","version":1,"environments":["browser"],"inputs":{},"outputs":{},"control":{"input":false,"output":true,"start":true}},
          {"type":"edit","version":1,"environments":["browser"],"control":{"input":true,"output":true,"start":false},
           "inputs":{"id":{"kind":"optional","inner":{"kind":"nullable","inner":{"kind":"scalar","name":"core.Guid"}}}},"outputs":{},
           "config":{"mode":{"type":"string","default":"new","options":["new","edit"]}},
           "metadata":{"inputs":{"id":{"requiredWhen":{"config":"mode","value":"edit"}}}}}
        ]}
        """);
        using var types=JsonDocument.Parse("""{"schemaVersion":1,"types":[]}""");
        foreach(var mode in new[]{"new","edit",null})
        {
            var config=mode is null?"{}":JsonSerializer.Serialize(new{mode});
            using var flow=JsonDocument.Parse("""
            {"schemaVersion":2,"id":"test","version":1,"mode":"interactive","nodes":[
              {"id":"start","type":"start","typeVersion":1,"environment":"browser","config":{}},
              {"id":"edit","type":"edit","typeVersion":1,"environment":"browser","config":$CONFIG$}],
              "connections":[{"kind":"control","source":{"nodeId":"start","port":"out"},"target":{"nodeId":"edit","port":"in"}}]}
            """.Replace("$CONFIG$",config));
            var errors=FlowValidator.Validate(flow.RootElement,catalog.RootElement,types.RootElement);
            check(mode=="edit"?errors.Count==1&&errors[0].Code=="missing_input"&&errors[0].Path.EndsWith("/edit/inputs/id"):errors.Count==0,
                $"Conditional Guid input is required only for edit (mode={mode??"default"})");
        }
    }
}
