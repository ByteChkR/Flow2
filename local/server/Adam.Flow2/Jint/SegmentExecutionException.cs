namespace Adam.Flow2.Jint;

public sealed class SegmentExecutionException(Guid executionId, string? nodeId, Exception inner)
    : Exception($"Execution {executionId}, node {nodeId ?? "<segment>"}: {inner.Message}", inner)
{
    public Guid ExecutionId { get; } = executionId;
    public string? NodeId { get; } = nodeId;
    public string Code { get; } = inner is OperationCanceledException or global::Jint.Runtime.ExecutionCanceledException ? "cancelled"
        : inner is TimeoutException ? "timeout"
        : inner is global::Jint.Runtime.StatementsCountOverflowException or global::Jint.Runtime.MemoryLimitExceededException ? "limit" : Adam.Flow2.Runtime.NodeFailureException.FindCode(inner)??"failed";
}

