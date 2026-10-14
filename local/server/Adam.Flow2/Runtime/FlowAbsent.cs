namespace Adam.Flow2.Runtime;

/// <summary>Codec-only marker. Runtime port dictionaries express absence by omitting the key.</summary>
public sealed class FlowAbsent
{
    public static FlowAbsent Value { get; } = new();
    private FlowAbsent(){}
}
