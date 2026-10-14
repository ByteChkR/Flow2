using Adam.Flow2.Runtime;

namespace Adam.Flow2.Nodes;

[FlowNode("Standard.Values.Constant.DateTimeOffset", Label = "Constant Date", Category = "Values")]
public sealed class ConstantDate : IFlowNode
{
    [FlowConfig("value", "1970-01-01T00:00:00+00:00", Label = "Value")]
    public DateTimeOffset Value { get; set; }

    [FlowOutput("value", Label = "Value")]
    public DateTimeOffset Output { get; private set; }

    public void Execute() => Output = Value;
}