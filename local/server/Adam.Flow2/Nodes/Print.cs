using Adam.Flow2.Runtime;
namespace Adam.Flow2.Nodes;

[FlowNode("Standard.Debug.Print",Label="Print",Category="Debug",ControlInput=true,ControlOutput=true)]
public sealed class Print:IFlowNode,IContextualFlowNode
{
    [FlowInput("text",Label="Text")] public string Text {get;set;}="";
    public FlowNodeContext Context {get;set;}=null!;
    public void Execute()=>Context.Log.Info(Text);
}
