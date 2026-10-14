using Adam.Flow2.Runtime;
namespace Adam.Flow2.Nodes;
[FlowNode("Standard.Flow.Start", Label = "Start", Category = "Control", IsStart = true, ControlOutput = true)]
public sealed class Start : IFlowNode
{
    public void Execute() { }
}
