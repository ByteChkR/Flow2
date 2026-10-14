using System.Text.Json;
using Adam.Flow2.Runtime;
using Flow.Contracts;
namespace Flow.Tests;

public class NodeAuthoringTests
{
    [FlowNode("test.add", Label = "Addieren", Category = "Mathematik")]
    public sealed class AddNode : IFlowNode
    {
        [FlowInput("a", Label = "Erste Zahl")] public double A { get; set; }
        [FlowInput("b")] public double B { get; set; }
        [FlowConfig("factor", 2d, Label = "Faktor")] public double Factor { get; set; }
        [FlowConfig("enabled", true)] public bool Enabled { get; set; }
        [FlowConfig("mode", "short", Options = new[] { "short", "long" })] public string Mode { get; set; } = "";
        [FlowOutput("sum", Label = "Summe")] public double Sum { get; private set; }
        public void Execute() => Sum = Enabled ? (A+B)*Factor : 0;
    }
    [Fact]
    public void GeneratesMetadataTypesAndConfiguredExecution()
    {
        var registry = new NodeRegistry();registry.Register<AddNode>();
        var definition = Assert.Single(registry.Catalog.Nodes);
        Assert.Equal("Addieren", definition.Metadata!.Label);
        Assert.Equal("number", definition.Inputs["a"].Kind);
        Assert.Equal("Erste Zahl", definition.Metadata.Inputs!["a"].Label);
        Assert.Equal(2d, definition.Config!["factor"].Default.GetDouble());
        var node=registry.Resolve("test.add",1);
        var inputs=new Dictionary<string,object>{{"a",2d},{"b",3d}};
        Assert.Equal(10d,node.Execute(inputs)["sum"]);
        Assert.Equal(15d,node.ExecuteConfigured!(inputs,new Dictionary<string,JsonElement>{{"factor",JsonSerializer.SerializeToElement(3d)}})["sum"]);
        Assert.Throws<ContractException>(()=>node.ExecuteConfigured!(inputs,new Dictionary<string,JsonElement>{{"mode",JsonSerializer.SerializeToElement("invalid")}}));
        Assert.Throws<ContractException>(()=>node.ExecuteConfigured!(inputs,new Dictionary<string,JsonElement>{{"enabled",JsonSerializer.SerializeToElement("true")}}));
    }
    [FlowNode("test.counter")]
    public sealed class CounterNode(Action dispose) : IFlowNode, IDisposable
    {
        [FlowOutput("count")] public double Count { get; private set; }
        public void Execute() => Count++;
        public void Dispose()=>dispose();
    }
    [Fact]
    public void CreatesFreshInstancesAndDisposesThem()
    {
        var disposed=0;var registry=new NodeRegistry();registry.Register(()=>new CounterNode(()=>disposed++));
        var node=registry.Resolve("test.counter",1);
        Assert.Equal(1d,node.Execute(new Dictionary<string,object>())["count"]);
        Assert.Equal(1d,node.Execute(new Dictionary<string,object>())["count"]);
        Assert.Equal(2,disposed);
    }
    [FlowNode("test.optional")]
    public sealed class OptionalNode : IFlowNode
    {
        [FlowInput("value",Optional=true)] public double? Value {get;set;}
        [FlowOutput("result",Optional=true)] public double? Result {get;private set;}
        public void Execute()=>Result=Value;
    }
    [Fact]
    public void OptionalPortsRepresentAbsenceWithoutNullSerialization()
    {
        var registry=new NodeRegistry();registry.Register<OptionalNode>();var node=registry.Resolve("test.optional",1);
        Assert.Empty(node.Execute(new Dictionary<string,object>()));
        Assert.Equal(3d,node.Execute(new Dictionary<string,object>{{"value",3d}})["result"]);
        Assert.Equal("optional",registry.Catalog.Nodes[0].Inputs["value"].Kind);
    }
    [FlowNode("test.bad")]
    public sealed class BadNode : IFlowNode
    {
        [FlowInput("same")]public double A {get;set;}
        [FlowInput("same")]public double B {get;set;}
        public void Execute(){}
    }
    [Fact] public void RejectsDuplicatePortIds()=>Assert.Throws<ArgumentException>(()=>new NodeRegistry().Register<BadNode>());
    [FlowNode("test.unsupported")]
    public sealed class UnsupportedNode : IFlowNode
    {
        [FlowInput("value")]public DateTime Value {get;set;}
        public void Execute(){}
    }
    [Fact] public void RequiresExplicitMappingForUnsupportedClrTypes()=>Assert.Throws<InvalidOperationException>(()=>new NodeRegistry().Register<UnsupportedNode>());
    [FlowNode("test.badDefault")]
    public sealed class BadDefaultNode : IFlowNode
    {
        [FlowConfig("mode","bad",Options=new[]{"good"})]public string Mode {get;set;}="";
        public void Execute(){}
    }
    [Fact] public void RejectsInvalidConfigDefaults()=>Assert.Throws<ContractException>(()=>new NodeRegistry().Register<BadDefaultNode>());
}
