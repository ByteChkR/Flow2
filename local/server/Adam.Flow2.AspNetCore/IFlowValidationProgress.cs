namespace Adam.Flow2.AspNetCore;
public interface IFlowValidationProgress : IDisposable { void Plan(IEnumerable<(string Id,string Name)> values); void Phase(string value); void Graph(string id,string state); }
