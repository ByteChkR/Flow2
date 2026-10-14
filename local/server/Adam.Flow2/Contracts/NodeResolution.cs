namespace Adam.Flow2.Contracts;

public static class NodeResolution
{
    public static NodeDefinition? Find(NodeCatalog catalog, FlowNode node) => Find(catalog,node.Type,node.TypeVersion,node.Id);
    public static NodeDefinition? Find(NodeCatalog catalog,string type,int version,string id) =>
        catalog.Nodes.FirstOrDefault(d=>d.Type==type&&d.Version==version&&d.NodeId==id)
        ?? catalog.Nodes.FirstOrDefault(d=>d.Type==type&&d.Version==version&&d.NodeId is null);
}
