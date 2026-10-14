using System.Collections;
using System.Runtime.ExceptionServices;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

public static class ParallelMapRuntime
{
    public static async Task<IReadOnlyDictionary<string,object>> Execute(FlowNode node,IReadOnlyDictionary<string,object> inputs,GraphInvoker invoke,CancellationToken cancellation)
    {
        var concurrency=(int)inputs["maxConcurrency"];
        if(concurrency<1||concurrency>16)throw new ArgumentOutOfRangeException("maxConcurrency","maxConcurrency: Expected 1–16.");
        var signature=node.Graph!.Signature;
        cancellation.ThrowIfCancellationRequested();
        var items=((IEnumerable)inputs["items"]).Cast<object>().ToArray();
        var values=new object[items.Length];
        using var stopped=CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        var next=-1;ExceptionDispatchInfo? failure=null;
        async Task Worker()
        {
            while(!stopped.IsCancellationRequested)
            {
                var index=Interlocked.Increment(ref next);
                if(index>=items.Length)return;
                try
                {
                    // Serialize at each invocation boundary: workers must never share mutable arguments.
                    var arguments=new Dictionary<string,object>();
                    foreach(var parameter in signature.Inputs)
                    {
                        object? value;
                        if(parameter.Name=="item")value=items[index];
                        else if(parameter.Name=="index")value=index;
                        else if(!inputs.TryGetValue(GraphNodes.InputPort(parameter),out value))continue;
                        arguments[parameter.Name]=FlowValues.Decode(parameter.Type,FlowValues.Encode(parameter.Type,value));
                    }
                    var result=await invoke(node.Id,(GraphReference)inputs["body"],signature,arguments,stopped.Token,"body:"+index);
                    stopped.Token.ThrowIfCancellationRequested();
                    var outputType=signature.Outputs.Single().Type;
                    values[index]=FlowValues.Decode(outputType,FlowValues.Encode(outputType,result["value"]));
                }
                catch(Exception error)
                {
                    if(Interlocked.CompareExchange(ref failure,ExceptionDispatchInfo.Capture(error),null) is null)await stopped.CancelAsync();
                    return;
                }
            }
        }
        await Task.WhenAll(Enumerable.Range(0,Math.Min(concurrency,items.Length)).Select(_=>Worker()));
        cancellation.ThrowIfCancellationRequested();
        failure?.Throw();
        return new Dictionary<string,object>{{"value",values.ToList()}};
    }
}
