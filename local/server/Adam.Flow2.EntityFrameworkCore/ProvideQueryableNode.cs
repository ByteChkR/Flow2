using Adam.Flow2.Runtime;
namespace Adam.Flow2.EntityFrameworkCore;

[FlowNode("Backend.EF.Source", Label = "Queryable", Category = "Data/EF")]
public sealed class ProvideQueryableNode<T>(Func<IQueryable<T>> queryableFactory) : IFlowNode
{
    [FlowOutput("query", Label = "Query")]
    public IQueryable<T> Queryable { get; private set; } = null!;
    public void Execute() => Queryable = queryableFactory();
}
