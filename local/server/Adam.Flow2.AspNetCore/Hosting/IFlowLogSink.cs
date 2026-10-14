namespace Adam.Flow2.Hosting;

/// <summary>Host-side copy of server logs. One sink per execution, writes serialized by the coordinator.</summary>
public interface IFlowLogSink:IDisposable { void Write(string? nodeId,string level,string message); }
public interface IFlowLogSinkFactory { IFlowLogSink Create(Guid executionId,string flowId,string owner); }
