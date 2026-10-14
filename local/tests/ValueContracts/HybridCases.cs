using System.Text.Json;
using Adam.Flow2.Contracts;
static class HybridCases
{
    public static void Run(Action<bool,string> check)
    {
        var start=new FlowNode("start","test.start",1,"browser",[]);
        var flow=new FlowDocument(2,"portable",1,"hybrid",[start],[]);
        var definition=new NodeDefinition("test.start",1,["server","browser"],[],[],Control:new(false,true,true));
        var catalog=new NodeCatalog(1,[definition]);
        JsonElement Json<T>(T value)=>JsonSerializer.SerializeToElement(value,ContractSchemas.JsonOptions);
        IReadOnlyList<Diagnostic> Validate(NodeDefinition node)=>FlowValidator.Validate(Json(flow),Json(new NodeCatalog(1,[node])),Json(new TypeDocument(1,[])));
        check(Validate(definition).Count==0,"hybrid accepts matching implementations in both runtimes");
        foreach(var environment in new[]{"server","browser"})
        {
            check(Validate(definition with{Environments=[environment]}).Any(error=>error.Code=="hybrid_node"),"hybrid rejects single-runtime nodes: "+environment);
            var concrete=GraphContracts.MaterializeHybrid(flow,environment);
            check(concrete.Nodes.All(node=>node.Environment==environment),"hybrid materializes a single placement");
        }
        check(flow.Nodes[0].Environment=="browser","hybrid materialization preserves definition");
        var signature=new FlowInterface([],[],new(false,false));
        var reference=new FlowNode("ref",GraphNodes.NodeType("ref","reference"),1,"server",[],new("reference",signature,"fixed"));
        var portable=flow with{Nodes=[start,reference]};
        var fixedGraph=flow with{Id="fixed",Mode="backend"};
        try{new GraphBundleSnapshot(new(1,portable.Id,[portable,fixedGraph]));throw new Exception("fixed graph accepted");}
        catch(ContractException error){check(error.Diagnostics.Any(d=>d.Code=="hybrid_graph"),"hybrid rejects fixed-runtime subgraphs");}
        check(!GraphContracts.IsHybridType(new("graph",Signature:new([new("entity","input",new("entity",Name:"test.Entity"))],[],new(false,false)))),"hybrid rejects native types in nested graph signatures");
        var boundary=flow with{Connections=[new(new("start","value"),new("other","value"),new("core.Decimal",1))]};
        check(GraphContracts.MaterializeHybrid(boundary).Connections.All(edge=>edge.Codec is null),"hybrid placement drops obsolete boundary codecs");
    }
}
