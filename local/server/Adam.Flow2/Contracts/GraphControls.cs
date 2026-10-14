namespace Adam.Flow2.Contracts;

/// <summary>Typed higher-order nodes. Branch bodies are graph values, never eager executions.</summary>
public static class GraphControls
{
    public static readonly string[] Operations = ["parallelMap", "timeout", "retry", "repeat", "while", "if", "ifElse", "switch", "forEach", "map", "filter", "aggregate", "flatMap", "any", "all", "find", "findIndex", "takeWhile", "skipWhile", "partition", "sortBy", "distinctBy", "groupBy", "minBy", "maxBy", "joinByKey", "leftJoinByKey", "groupJoinByKey", "try"];
    public static bool IsJoin(string operation)=>operation is "joinByKey" or "leftJoinByKey" or "groupJoinByKey";
    public static bool IsControl(string operation) => Operations.Contains(operation);
    public static bool IsPredicate(string operation)=>operation is "filter" or "any" or "all" or "find" or "findIndex" or "takeWhile" or "skipWhile" or "partition";
    public static bool IsSelector(string operation)=>operation is "sortBy" or "distinctBy" or "groupBy" or "minBy" or "maxBy";
    public static bool IsLoop(string operation) => operation is "parallelMap" or "forEach" or "map" or "filter" or "aggregate" or "flatMap" or "any" or "all" or "find" or "findIndex" or "takeWhile" or "skipWhile" or "partition" or "sortBy" or "distinctBy" or "groupBy" or "minBy" or "maxBy";
    public static FlowInterface SlotSignature(GraphNodeBinding binding,string slot) => IsJoin(binding.Operation)?GraphJoins.SlotSignature(binding,slot):binding.Operation == "while" && slot == "condition" ? binding.Signature with {Outputs=[new("value","__condition",new("scalar",Name:"core.Bool"))]} : binding.Operation == "try" ? slot switch
    {
        "catch" => binding.Signature with {Inputs=[..binding.Signature.Inputs,new("error","__error",new("string"))]},
        "finally" => binding.Signature with {Outputs=[]},
        "body" => binding.Signature,
        _ => throw new InvalidOperationException("Invalid Try slot.")
    } : binding.Signature;
    public static string[] Slots(GraphNodeBinding binding) => binding.Operation switch
    {
        "joinByKey" or "leftJoinByKey" or "groupJoinByKey" => ["leftKey","rightKey"],
        "timeout" or "retry" or "repeat" => ["body"],
        "while" => ["condition","body"],
        "if" => ["then"], "ifElse" => ["then","else"],
        "switch" => [..(binding.Cases??[]).Select((_,i)=>"case_"+i),"default"],
        "try" => ["body","catch","finally"],
        "parallelMap" or "forEach" or "map" or "filter" or "aggregate" or "flatMap" or "any" or "all" or "find" or "findIndex" or "takeWhile" or "skipWhile" or "partition" or "sortBy" or "distinctBy" or "groupBy" or "minBy" or "maxBy" => ["body"],
        _ => []
    };
    public static NodeDefinition Definition(FlowNode node)
    {
        var b=node.Graph!;var signature=b.Signature;
        void Require(bool value,string message){if(!value)throw new ContractException([new("graph_control","/nodes/"+node.Id,message)]);}
        Require(IsControl(b.Operation)&&b.GraphId is null,"Control nodes require explicit typed graph inputs.");
        Require(b.Operation!="try"||signature.Inputs.All(p=>p.Name!="error"&&p.NodeId!="__error"),"error/__error are reserved for the Catch input.");
        Require(b.Operation=="switch"?b.Cases is {Length:>0 and <=64}&&b.Cases.Distinct(StringComparer.Ordinal).Count()==b.Cases.Length:b.Cases is null,"Switch requires 1–64 distinct case labels; other operations cannot declare cases.");
        Require(node.Environment!="browser"||signature.Inputs.Concat(signature.Outputs).All(p=>TransportContracts.IsTransportable(p.Type)),"Native graph arguments require backend execution.");
        if(IsJoin(b.Operation))return GraphJoins.Definition(node);
        if(b.Operation=="retry")Require(signature.Inputs.Any(p=>p.Name=="attempt"&&p.Type is {Kind:"scalar",Name:"core.Integer"}),"Retry body requires Integer attempt.");
        if(b.Operation=="repeat")Require(signature.Inputs.Any(p=>p.Name=="index"&&p.Type is {Kind:"scalar",Name:"core.Integer"})&&signature.Outputs.Length==0,"Repeat body requires Integer index and no outputs.");
        if(b.Operation=="while")
        {
            Require(signature.Inputs.Length==signature.Outputs.Length && signature.Inputs.All(input=>signature.Outputs.Any(output=>output.Name==input.Name&&TransportContracts.Equivalent(output.Type,input.Type))),"While body must return each input by the same name and type.");
            WhileLimit(node);
        }
        var inputs=new Dictionary<string,TypeRef>();var outputs=new Dictionary<string,TypeRef>();
        var labels=new Dictionary<string,PortMetadata>();var outputLabels=new Dictionary<string,PortMetadata>();
        foreach(var slot in Slots(b)) {inputs[slot]=new("graph",Signature:SlotSignature(b,slot));labels[slot]=new(slot.StartsWith("case_")?b.Cases![int.Parse(slot[5..])]:slot);}
        if(b.Operation is "if" or "ifElse")inputs["condition"]=new("scalar",Name:"core.Bool");
        if(b.Operation=="switch")inputs["selector"]=new("string");
        if(IsLoop(b.Operation))
        {
            var item=signature.Inputs.SingleOrDefault(p=>p.Name=="item");
            var index=signature.Inputs.SingleOrDefault(p=>p.Name=="index");
            Require(item is not null&&item.Type.Kind!="optional"&&index?.Type is {Kind:"scalar",Name:"core.Integer"},"Loop body requires item and Integer index inputs.");
            inputs["items"]=new("array",Items:item!.Type);
            if(b.Operation=="forEach")Require(signature.Outputs.Length==0,"ForEach body must have no outputs; use Map for results.");
            else if(b.Operation=="aggregate")
            {
                var accumulator=signature.Inputs.SingleOrDefault(p=>p.Name=="accumulator");
                Require(accumulator is not null && accumulator.Type.Kind!="optional","Aggregate body requires a required accumulator input.");
                Require(signature.Outputs is [{Name:"accumulator"}] && TransportContracts.Equivalent(signature.Outputs[0].Type,accumulator!.Type),"Aggregate body must return accumulator with the same type.");
                inputs["seed"]=accumulator!.Type;outputs["result"]=accumulator.Type;
                labels["seed"]=new("Startwert");outputLabels["result"]=new("Ergebnis");
            }
            else
            {
                Require(signature.Outputs is [{Name:"value"}]&&signature.Outputs[0].Type.Kind!="optional","List body must return one required value.");
                var result=signature.Outputs[0].Type;var boolean=new TypeRef("scalar",Name:"core.Bool");
                if(IsPredicate(b.Operation))Require(result is {Kind:"scalar",Name:"core.Bool"},"Predicate body must return Bool value.");
                if(b.Operation=="flatMap")Require(result.Kind=="array"&&result.Items!.Kind!="optional","FlatMap body must return a required List<T>.");
                outputs["value"]=new("array",Items:IsPredicate(b.Operation)?item.Type:result);
                if(IsSelector(b.Operation))
                {
                    if(b.Operation is "sortBy" or "minBy" or "maxBy")Require(ValueOrderContract.Supports(result)||b.Operation=="sortBy"&&result.Kind=="object"&&result.Fields!.Count>0&&result.Fields.Values.All(ValueOrderContract.Supports),"Selector key must support ordering.");
                    else Require(ValueEqualityContract.Supports(result),"Selector key must support equality.");
                    outputs["value"]=new("array",Items:item.Type);
                    if(b.Operation is "minBy" or "maxBy")outputs["value"]=new("optional",Inner:item.Type);
                    if(b.Operation=="groupBy")outputs["value"]=new("array",Items:new("object",Fields:new(){{"key",result},{"items",new("array",Items:item.Type)}}));
                    if(b.Operation=="sortBy")
                    {
                        if(result.Kind=="object")inputs["orderBy"]=new("array",Items:new("object",Fields:new(){{"field",new("string")},{"descending",boolean}}));
                        else inputs["descending"]=new("optional",Inner:boolean);
                    }
                }
                if(b.Operation=="flatMap")outputs["value"]=result;
                if(b.Operation is "any" or "all")outputs["value"]=boolean;
                if(b.Operation=="find"){outputs["value"]=new("optional",Inner:item.Type);outputs["found"]=boolean;}
                if(b.Operation=="findIndex")outputs["value"]=new("scalar",Name:"core.Integer");
                if(b.Operation=="partition"){outputs.Remove("value");outputs["matching"]=new("array",Items:item.Type);outputs["nonMatching"]=new("array",Items:item.Type);}
            }
        }
        if(b.Operation=="parallelMap"){Require(signature.Inputs.Concat(signature.Outputs).All(p=>TransportContracts.IsTransportable(p.Type)),"ParallelMap requires transportable arguments and results to isolate execution contexts.");inputs["maxConcurrency"]=new("scalar",Name:"core.Integer");}
        if(b.Operation=="timeout")inputs["timeoutMilliseconds"]=new("scalar",Name:"core.Integer");
        if(b.Operation=="retry"){inputs["maxAttempts"]=new("scalar",Name:"core.Integer");inputs["retryCodes"]=new("array",Items:new("string"));inputs["delayMilliseconds"]=new("optional",Inner:new("scalar",Name:"core.Integer"));}
        if(b.Operation=="repeat")inputs["count"]=new("scalar",Name:"core.Integer");
        foreach(var parameter in signature.Inputs.Where(p=>b.Operation=="retry"?p.Name!="attempt":b.Operation=="repeat"?p.Name!="index":!IsLoop(b.Operation)||(p.Name is not ("item" or "index") && (b.Operation!="aggregate"||p.Name!="accumulator"))))
        {var key=GraphNodes.InputPort(parameter);inputs[key]=parameter.Type;labels[key]=new(parameter.Name);}
        if(!IsLoop(b.Operation))foreach(var parameter in signature.Outputs)
        {var key=GraphNodes.OutputPort(parameter);outputs[key]=b.Operation=="if"&&parameter.Type.Kind!="optional"?new("optional",Inner:parameter.Type):parameter.Type;outputLabels[key]=new(parameter.Name);}
        return new(node.Type,1,signature.Inputs.Concat(signature.Outputs).All(p=>TransportContracts.IsTransportable(p.Type))?["server","browser"]:["server"],inputs,outputs,new(Label:b.Operation,Category:"Control/Graphs",Inputs:labels,Outputs:outputLabels),Config:b.Operation=="while"?new(){{"maxIterations",new("number",System.Text.Json.JsonSerializer.SerializeToElement(100),"Maximale Durchläufe")}}:null,Control:new(true,true,false),Graph:b,NodeId:node.Id);
    }
    public static int WhileLimit(FlowNode node)
    {
        if(!node.Config.TryGetValue("maxIterations",out var value))return 100;
        if(value.ValueKind!=System.Text.Json.JsonValueKind.Number||!value.TryGetInt32(out var limit)||limit<1||limit>500)
            throw new ContractException([new("graph_control","/nodes/"+node.Id+"/config/maxIterations","While maxIterations must be an integer between 1 and 500.")]);
        return limit;
    }
    public static string SlotForCall(GraphNodeBinding binding,string key)
    {
        var slot=key.Split(':')[0];
        if(!Slots(binding).Contains(slot))throw new InvalidOperationException("Unknown graph call slot.");
        if(IsJoin(binding.Operation))
        {
            if(!key.StartsWith(slot+":")||!int.TryParse(key[(slot.Length+1)..],out var index)||index<0||key!=slot+":"+index)throw new InvalidOperationException("Invalid join iteration key.");
        }
        else if(binding.Operation=="while")
        {
            if(!key.StartsWith(slot+":"))throw new InvalidOperationException("Invalid While iteration key.");
            var suffix=key[(slot.Length+1)..];
            if(!int.TryParse(suffix,out var iteration)||iteration<0||key!=slot+":"+iteration)throw new InvalidOperationException("Invalid While iteration key.");
        }
        else if(IsLoop(binding.Operation)||binding.Operation is "repeat" or "retry")
        {
            if(!key.StartsWith("body:")||!int.TryParse(key[5..],out var index)||index<0||key!="body:"+index)throw new InvalidOperationException("Invalid iteration key.");
        }
        else if(key!=slot)throw new InvalidOperationException("Invalid graph call key.");
        return slot;
    }
}
