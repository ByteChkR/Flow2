namespace Adam.Flow2.Runtime;

public sealed class ExecutionValueStore : IDisposable
{
    private readonly Dictionary<string, object> values = new();
    private bool disposed;

    public string Add(object value)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        var handle = Guid.NewGuid().ToString("N");
        values.Add(handle, value);
        return handle;
    }

    public object Resolve(string handle)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        return values.TryGetValue(handle, out var value) ? value
            : throw new InvalidOperationException("Unknown handle in this execution.");
    }

    public void Dispose()
    {
        values.Clear();
        disposed = true;
    }
}
