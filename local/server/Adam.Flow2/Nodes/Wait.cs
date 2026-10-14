using Adam.Flow2.Runtime;

namespace Adam.Flow2.Nodes;

[FlowNode("Standard.Flow.Wait", Label = "Wait", Category = "Control", ControlInput = true, ControlOutput = true)]
public sealed class Wait : IAsyncFlowNode
{
    // Match the browser timer's maximum signed 32-bit millisecond duration.
    public const decimal MaximumSeconds = 2147483.647m;

    [FlowInput("seconds", Label = "Seconds", Description = "Non-negative duration in seconds, including fractions.")]
    public decimal Seconds { get; set; }

    public async ValueTask ExecuteAsync(CancellationToken cancellationToken)
    {
        if (Seconds < 0 || Seconds > MaximumSeconds)
            throw new ArgumentOutOfRangeException(nameof(Seconds), $"Seconds must be between 0 and {MaximumSeconds}.");
        await Task.Delay(TimeSpan.FromMilliseconds((double)decimal.Ceiling(Seconds * 1000)), cancellationToken);
    }
}
