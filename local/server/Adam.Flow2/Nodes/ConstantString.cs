using Adam.Flow2.Runtime;
namespace Adam.Flow2.Nodes;

[FlowNode("Standard.Values.Constant.String",Label="Constant String",Category="Values")]
public sealed class ConstantString:IFlowNode
{
    [FlowConfig("value","",Label="Value")] public string ConfiguredValue {get;set;}="";
    [FlowOutput("value",Label="Value")] public string Value {get;private set;}="";
    public void Execute()=>Value=ConfiguredValue;
}
