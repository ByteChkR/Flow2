using System.Text.Json;
using Flow.Contracts;
using Flow.Nodes.Server;
using Flow.Runtime.Jint;

namespace Flow.Tests;

public class CompilerTests
{
    private static T Read<T>(string name) => JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,$"examples/v1/{name}.json")),ContractSchemas.JsonOptions)!;
    private static NodeCatalog Browser() => new(1,Read<NodeCatalog>("catalog").Nodes.Where(node=>node.Environments.Contains("browser")).Select(node=>node with {Environments=["browser"]}).ToArray());
    private static CompiledExecution Execution(ContactDemo demo, Guid? id=null) => new(id ?? Guid.NewGuid(),Read<FlowDocument>("contact.flow"),Browser(),DemoCodecs.Definitions("browser"),demo.Registry,DemoCodecs.Create(demo.Registry.Types));
    private static Dictionary<string,string> Input(ContactDemo demo, string id="contact-1") => new() { ["0"]=DemoCodecs.Create(demo.Registry.Types).Encode(DemoCodecs.String,id) };

    [Fact]
    public void Unordered_flow_compiles_to_three_segments_and_jint_preserves_identity()
    {
        var demo=new ContactDemo();
        var flow=Read<FlowDocument>("contact.flow"); Array.Reverse(flow.Nodes);
        using var execution=new CompiledExecution(Guid.NewGuid(),flow,Browser(),DemoCodecs.Definitions("browser"),demo.Registry,DemoCodecs.Create(demo.Registry.Types));
        Assert.Equal(new[]{"input","get","inspect","project","display"},execution.Plan.Nodes.Select(node=>node.Id));
        Assert.Equal(new[]{"browser","server","browser"},execution.Plan.Segments.Select(segment=>segment.Environment));
        var result=execution.Execute("segment-1",Input(demo));
        Assert.Contains("host.invokeNode(2)",result.GeneratedJavaScript);
        Assert.Equal(execution.ExecutionId,result.ExecutionId);
        Assert.Equal(new ContactDto("contact-1","Ada Lovelace"),DemoCodecs.Create(demo.Registry.Types).Decode(DemoCodecs.Contact,result.Wires["3"],ContactDemo.DtoType.ContractType));
    }
    [Fact]
    public void Missing_codec_is_rejected_before_any_execution()
    {
        var demo=new ContactDemo(); var flow=Read<FlowDocument>("contact.flow");
        flow.Connections[0]=flow.Connections[0] with {Codec=null};
        Assert.Throws<ContractException>(()=>new CompiledExecution(Guid.NewGuid(),flow,Browser(),DemoCodecs.Definitions("browser"),demo.Registry,DemoCodecs.Create(demo.Registry.Types)));
    }
    [Fact]
    public void Remote_metadata_cannot_grant_server_permissions()
    {
        var demo=new ContactDemo();
        Assert.Throws<InvalidOperationException>(()=>new CompiledExecution(Guid.NewGuid(),Read<FlowDocument>("contact.flow"),demo.Registry.Catalog,DemoCodecs.Definitions("browser"),demo.Registry,DemoCodecs.Create(demo.Registry.Types)));
    }
    [Fact]
    public void Payload_failure_is_attributed_to_target_node_and_execution()
    {
        var demo=new ContactDemo();using var execution=Execution(demo);
        var error=Assert.Throws<SegmentExecutionException>(()=>execution.Execute("segment-1",new Dictionary<string,string>{{"0","{}"}}));
        Assert.Equal(execution.ExecutionId,error.ExecutionId); Assert.Equal("get",error.NodeId);
        Assert.Throws<SegmentExecutionException>(()=>execution.Execute("segment-1",Input(demo)));
    }
    [Fact]
    public void Node_failure_is_attributed_and_execution_is_not_reusable()
    {
        var demo=new ContactDemo();using var execution=Execution(demo);
        var error=Assert.Throws<SegmentExecutionException>(()=>execution.Execute("segment-1",Input(demo,"missing")));
        Assert.Equal("get",error.NodeId);Assert.Equal(execution.ExecutionId,error.ExecutionId);
    }
    [Fact]
    public void Plans_are_detached_and_completed_segments_cannot_be_replayed()
    {
        var demo=new ContactDemo();using var execution=Execution(demo);
        execution.Plan.Segments[1].NodeIds.Clear();
        execution.Execute("segment-1",Input(demo));
        Assert.Throws<SegmentExecutionException>(()=>execution.Execute("segment-1",Input(demo)));
    }
    [Fact]
    public void Cancellation_and_statement_limits_fail_without_returning_results()
    {
        var demo=new ContactDemo(); using var cancelled=Execution(demo);
        var error=Assert.Throws<SegmentExecutionException>(()=>cancelled.Execute("segment-1",Input(demo),new CancellationToken(true)));
        Assert.Equal(cancelled.ExecutionId,error.ExecutionId); Assert.Equal("cancelled",error.Code);
        using var limited=Execution(demo);
        Assert.Equal("limit",Assert.Throws<SegmentExecutionException>(()=>limited.Execute("segment-1",Input(demo),maxStatements:1)).Code);
        using var timed=Execution(demo);
        Assert.Equal("timeout",Assert.Throws<SegmentExecutionException>(()=>timed.Execute("segment-1",Input(demo),timeout:TimeSpan.FromTicks(1))).Code);
    }

    [Fact]
    public void Native_reference_survives_an_intervening_browser_segment()
    {
        var demo=new ContactDemo(); object? original=null; var observed=false;
        var entity=ContactDemo.ContactType;
        var text=ContactDemo.StringType;
        demo.Registry.Register(new(new("test.capture",1,new Dictionary<string,Adam.Flow2.Runtime.PortType>{{"contact",entity}},new Dictionary<string,Adam.Flow2.Runtime.PortType>{{"contact",entity}}), inputs=> {original=inputs["contact"]; return inputs;}));
        demo.Registry.Register(new(new("test.after",1,new Dictionary<string,Adam.Flow2.Runtime.PortType>{{"contact",entity},{"gate",text}},new Dictionary<string,Adam.Flow2.Runtime.PortType>()),inputs=>{
            Assert.Same(original,inputs["contact"]); observed=true; return new Dictionary<string,object>();
        }));
        var source=Read<FlowDocument>("contact.flow");
        var flow=source with {
            Nodes=[source.Nodes[0],source.Nodes[1],new("capture","test.capture",1,"server",new()),source.Nodes[3],
                new("gate","test.gate",1,"browser",new()),new("after","test.after",1,"server",new())],
            Connections=[source.Connections[0],new(new("get","contact"),new("capture","contact")),
                new(new("capture","contact"),new("project","contact")),new(new("project","dto"),new("gate","value"),DemoCodecs.Contact),
                new(new("capture","contact"),new("after","contact")),new(new("gate","id"),new("after","gate"),DemoCodecs.String)]};
        var browser=Browser(); browser=new(1,[..browser.Nodes,new("test.gate",1,["browser"],new(){{"value",ContactDemo.DtoType.ContractType}},new(){{"id",new("string")}})]);
        using var execution=new CompiledExecution(Guid.NewGuid(),flow,browser,DemoCodecs.Definitions("browser"),demo.Registry,DemoCodecs.Create(demo.Registry.Types));
        execution.Execute("segment-1",Input(demo));
        execution.Execute("segment-3",new Dictionary<string,string>{{"5",Input(demo)["0"]}});
        Assert.True(observed);
    }

    [Fact]
    public void Plan_matches_the_shared_typescript_golden()
    {
        var plan=FlowCompiler.Compile(Read<FlowDocument>("contact.flow"),Read<NodeCatalog>("catalog"),Read<TypeDocument>("types"),DemoCodecs.Definitions("server"),DemoCodecs.Definitions("browser"));
        Assert.True(System.Text.Json.Nodes.JsonNode.DeepEquals(
            JsonSerializer.SerializeToNode(plan,ContractSchemas.JsonOptions),
            JsonSerializer.SerializeToNode(Read<JsonElement>("contact.plan"))));
    }
    [Fact]
    public void Backend_configuration_is_data_and_invalid_outputs_are_attributed()
    {
        var registry=new Adam.Flow2.Runtime.NodeRegistry();
        const string source="throw new Error('must never execute')";
        string? observed=null;
        var stringPort=new Adam.Flow2.Runtime.PortType("string",typeof(string),new("string"));
        registry.Register(new(new("configured",1,new Dictionary<string,Adam.Flow2.Runtime.PortType>(),new Dictionary<string,Adam.Flow2.Runtime.PortType>{{"value",stringPort}}),
            _=>throw new Exception("Configured callback required"),(inputs,config)=>{observed=config["text"].GetString();return new Dictionary<string,object>{{"value",42}};}));
        var flow=new FlowDocument(1,"backend",1,"backend",[new("configured","configured",1,"server",new(){{"text",JsonSerializer.SerializeToElement(source)}})],[]);
        using var execution=new CompiledExecution(Guid.NewGuid(),flow,new(1,[]),new(1,"browser",[]),registry,new(registry.Types,"server"));
        var error=Assert.Throws<SegmentExecutionException>(()=>execution.Execute("segment-0",new Dictionary<string,string>()));
        Assert.Equal(source,observed);Assert.Equal("configured",error.NodeId);Assert.Equal(execution.ExecutionId,error.ExecutionId);
    }
}
