namespace Adam.Flow2.Runtime;

/// <summary>Distinguishes an absent port from a present value, including an explicit null.</summary>
public readonly struct FlowOptional<T> : IFlowOptional
{
    private readonly T value;
    public bool HasValue { get; }
    public T Value => HasValue ? value : throw new InvalidOperationException("The flow value is absent.");
    public FlowOptional(T value) { this.value=value; HasValue=true; }
    public static FlowOptional<T> Missing => default;
    public static FlowOptional<T> Present(T value) => new(value);
    public static implicit operator FlowOptional<T>(T value) => new(value);
    object? IFlowOptional.UntypedValue => Value;
}
internal interface IFlowOptional
{
    bool HasValue { get; }
    object? UntypedValue { get; }
}
