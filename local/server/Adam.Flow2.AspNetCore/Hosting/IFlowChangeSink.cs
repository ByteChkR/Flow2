namespace Adam.Flow2.Hosting;

/// <summary>Best-effort wakeup only. Implementations must enqueue without blocking execution.</summary>
public interface IFlowChangeSink
{
    void Changed(string owner, Guid rootExecutionId);
}
