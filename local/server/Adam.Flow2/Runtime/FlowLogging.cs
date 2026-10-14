namespace Adam.Flow2.Runtime;

public interface IFlowLogger
{
    void Info(string message);
    void Warning(string message);
    void Error(string message);
}
public sealed record FlowNodeContext(string NodeId,IFlowLogger Log);
public interface IContextualFlowNode { FlowNodeContext Context { set; } }
public sealed class FlowLogger(Action<string,string> write):IFlowLogger
{
    public void Info(string message)=>write("info",message);
    public void Warning(string message)=>write("warning",message);
    public void Error(string message)=>write("error",message);
    public static IFlowLogger None {get;}=new FlowLogger((_,_)=>{});
}
