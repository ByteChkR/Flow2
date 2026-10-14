namespace Adam.Flow2.Contracts;

public static class TimeSpanMath
{
    public static TimeSpan Add(TimeSpan a,TimeSpan b)=>a+b;
    public static int Compare(TimeSpan a,TimeSpan b)=>Math.Sign(TimeSpan.Compare(a,b));
}
public static class DateTimeOffsetMath
{
    public static DateTimeOffset Add(DateTimeOffset value,TimeSpan duration)=>value.Add(duration);
    public static int Compare(DateTimeOffset a,DateTimeOffset b)=>Math.Sign(DateTimeOffset.Compare(a,b));
}
