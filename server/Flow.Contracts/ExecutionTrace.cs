namespace Flow.Contracts;

public sealed record NodeTrace(string NodeId, string Status, double? DurationMs = null, string? Message = null);
public sealed record ExecutionTrace(string Id, DateTimeOffset Timestamp, string Environment, string Kind, string Status,
    string? SegmentId = null, string? NodeId = null, int? ConnectionIndex = null, string? Message = null, double? DurationMs = null);
