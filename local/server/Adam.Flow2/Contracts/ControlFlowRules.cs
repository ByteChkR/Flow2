namespace Adam.Flow2.Contracts;
public static class ControlFlowRules
{
    public static HashSet<string> ActiveNodes(FlowDocument flow,NodeCatalog catalog)
    {
        NodeDefinition? Definition(FlowNode node)=>NodeResolution.Find(catalog,node);
        var active=flow.Nodes.Where(node=>Definition(node)?.Control is {} control&&(control.Start||(!control.Input&&control.Output&&flow.Connections.Any(edge=>edge.Kind=="control"&&edge.Source.NodeId==node.Id)))).Select(node=>node.Id).ToHashSet();
        var changed=true;
        while(changed)
        {
            changed=false;
            foreach(var node in flow.Nodes)
            {
                if(active.Contains(node.Id)||Definition(node)?.Control?.Input!=true)continue;
                var incoming=flow.Connections.Where(edge=>edge.Kind=="control"&&edge.Target.NodeId==node.Id).ToArray();
                if(incoming.Length>0&&incoming.All(edge=>active.Contains(edge.Source.NodeId))) {active.Add(node.Id);changed=true;}
            }
        }
        changed=true;
        while(changed)
        {
            changed=false;
            foreach(var edge in flow.Connections)
            {
                if(edge.Kind=="control"||!active.Contains(edge.Target.NodeId)||active.Contains(edge.Source.NodeId))continue;
                var source=flow.Nodes.FirstOrDefault(node=>node.Id==edge.Source.NodeId);
                if(source is not null&&Definition(source)?.Control?.Input!=true) {active.Add(source.Id);changed=true;}
            }
        }
        return active;
    }
}
