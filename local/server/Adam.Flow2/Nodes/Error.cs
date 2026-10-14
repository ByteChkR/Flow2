using Adam.Flow2.Runtime;
namespace Adam.Flow2.Nodes;

[FlowNode("Standard.Debug.Error",Label="Error",Category="Debug",ControlInput=true,ControlOutput=true)]
public sealed class Error:IFlowNode
{
    [FlowConfig("message","Flow execution failed.",Label="Message")] public string Message {get;set;}="Flow execution failed.";
    [FlowInput("message",Optional=true,Label="Message")] public string? InputMessage {get;set;}
    public void Execute()=>throw new InvalidOperationException(InputMessage??Message);
}
