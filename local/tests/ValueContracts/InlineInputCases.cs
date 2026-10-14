using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;
using Adam.Flow2.Jint;
static class InlineInputCases
{
    public static void Run(Action<bool,string> check)
    {
        var cases=new (TypeRef Type,object? Wire)[]{
            (new("string"),"text"),(new("boolean"),false),(new("number"),12.5m),(new("null"),null),
            (new("scalar",Name:"core.Bool"),false),(new("scalar",Name:"core.Integer"),int.MinValue),
            (new("scalar",Name:"core.Decimal"),"12345678901234567890.123456789"),
            (new("scalar",Name:"core.Guid"),"12345678-1234-1234-1234-123456789abc"),
            (new("scalar",Name:"core.TimeSpan"),"9223372036854775807"),
            (new("scalar",Name:"core.DateTimeOffset"),"2026-01-01T12:34:56.1234567+05:30"),
            (new("nullable",Inner:new("string")),null),
            (new("optional",Inner:new("string")),"present")};
        foreach(var (type,wire) in cases)
        {
            var nodes=new NodeRegistry();ScalarNodes.Register(nodes);
            nodes.Register(new(new("test.start",1,new Dictionary<string,PortType>(),new Dictionary<string,PortType>(),Control:new(false,true,true)),_=>new Dictionary<string,object>()));
            var codecs=new CodecRegistry(new(1,[]),"server");codecs.RegisterScalars();
            var literal=new InlineInput(true,JsonSerializer.SerializeToElement(wire));
            var output=new FlowNode("output",GeneralValueNodes.NodeType("output","output"),1,"server",new(){{"name",JsonSerializer.SerializeToElement("result")}},Value:new("output",type),InlineInputs:new(){{"value",literal}});
            var flow=new FlowDocument(2,"inline",1,"backend",[new("start","test.start",1,"server",[]),output],[new(new("start","out"),new("output","in"),Kind:"control")]);
            using var run=new CompiledExecution(Guid.NewGuid(),flow,new(1,[]),new(1,"browser",[]),nodes,codecs,allowUnknownInputs:false);
            var outputs=run.Plan.Segments.Select(segment=>run.Execute(segment.Id,new Dictionary<string,string>())).Last().Outputs;
            check(TransportContracts.Equivalent(outputs["result"],literal.Value),"inline input retains primitive wire value: "+type.Kind+type.Name);
            check(run.Plan.Nodes.Length==2,"inline inputs do not synthesize nodes");
            var connected=flow with{Connections=[..flow.Connections,new(new("output","unused"),new("output","value"))]};
            check(InlineInputContracts.Validate(output,ValueNodes.Definition(output),connected,new(new(1,[]))).Any(error=>error.Code=="inline_connected"),"connected inline input is rejected");
            var disabled=output with{InlineInputs=new(){{"value",new(false,JsonSerializer.SerializeToElement(new{old="retained"}))}}};
            check(InlineInputContracts.Validate(disabled,ValueNodes.Definition(disabled),flow,new(new(1,[]))).Count==0,"disabled saved value is not type-checked or executed");
        }
        var registry=new NodeRegistry();ScalarNodes.Register(registry);
        check(registry.Resolve("Standard.Values.Constant.Decimal",1).ExecuteConfigured!(new Dictionary<string,object>(),new Dictionary<string,JsonElement>(){{"value",JsonSerializer.SerializeToElement("0.1")}})["value"] is decimal precise&&precise==0.1m,"constant.decimal uses precise scalar");
        var nullNode=new FlowNode("null", "Standard.Values.Null",1,"server",[],Value:new("null",new("null")));
        var nullValue=ValueRuntimeNodes.Create(ValueNodes.Definition(nullNode));
        check(nullValue.Execute(new Dictionary<string,object>())["value"] is null,"Untyped Null outputs null");
    }
}
