using System.Threading.Channels;
using Adam.Flow2.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Adam.Flow2.Hosting;

/// <summary>Bounded, coalesced wakeup hints. The consuming host supplies owner routing and transport.</summary>
public abstract class FlowChangeDispatcher(ILogger logger) : BackgroundService, IFlowChangeSink
{
    protected abstract Task PublishAsync(string owner, Guid[] executionIds, CancellationToken cancellationToken);
    private readonly Channel<(string Owner,Guid Id)> pending=Channel.CreateBounded<(string,Guid)>(new BoundedChannelOptions(1024)
        {SingleReader=true,FullMode=BoundedChannelFullMode.DropOldest});
    public void Changed(string owner,Guid rootExecutionId)=>pending.Writer.TryWrite((owner,rootExecutionId));
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while(await pending.Reader.WaitToReadAsync(stoppingToken))
            {
                await Task.Delay(100,stoppingToken);
                var batch=new HashSet<(string Owner,Guid Id)>();
                for(var i=0;i<1024&&pending.Reader.TryRead(out var item);i++)batch.Add(item);
                foreach(var group in batch.GroupBy(item=>item.Owner))
                {
                    try
                    {
                        await PublishAsync(group.Key, group.Select(item=>item.Id).ToArray(), stoppingToken).WaitAsync(TimeSpan.FromSeconds(2),stoppingToken);
                    }
                    catch(OperationCanceledException) when(stoppingToken.IsCancellationRequested){throw;}
                    catch(Exception error){logger.LogDebug(error,"Flow2 change notification failed; clients will poll");}
                }
            }
        }
        catch(OperationCanceledException) when(stoppingToken.IsCancellationRequested) { }
    }
}
