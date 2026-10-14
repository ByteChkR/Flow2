namespace Adam.Flow2.Contracts;

public sealed record NodeTrace(string NodeId, string Status, double? DurationMs = null, string? Message = null, IReadOnlyDictionary<string,double>? Profile = null);
public sealed record ExecutionTrace(string Id, DateTimeOffset Timestamp, string Environment, string Kind, string Status,
    string? SegmentId = null, string? NodeId = null, int? ConnectionIndex = null, string? Message = null, double? DurationMs = null,string? GraphId = null,Guid? InvocationId = null,Guid? ParentInvocationId = null,string? CallNodeId = null,IReadOnlyDictionary<string,double>? Profile = null);

public sealed record NodeLog(string NodeId,string Level,string Message);
