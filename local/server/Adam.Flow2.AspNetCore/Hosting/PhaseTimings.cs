using System.Diagnostics;
using System.Globalization;

namespace Adam.Flow2.Hosting;

/// <summary>Opt-in monotonic durations only; never captures request data.</summary>
public sealed class PhaseTimings
{
    private long previous = Stopwatch.GetTimestamp();
    public Dictionary<string, double> Values { get; } = new();
    public void Mark(string name)
    {
        var now = Stopwatch.GetTimestamp();
        Values[name] = Stopwatch.GetElapsedTime(previous, now).TotalMilliseconds;
        previous = now;
    }
    public string ServerTiming() => string.Join(", ", Values.Select(pair =>
        $"{pair.Key};dur={pair.Value.ToString("F3", CultureInfo.InvariantCulture)}"));
}
