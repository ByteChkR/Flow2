namespace Adam.Flow2.Contracts;
public static class GraphJoins
{
 public static FlowInterface SlotSignature(GraphNodeBinding b,string slot)
 {
  if(slot is not ("leftKey" or "rightKey"))throw new InvalidOperationException("Invalid Join slot.");
  var own=slot=="leftKey"?"leftItem":"rightItem";var other=slot=="leftKey"?"rightItem":"leftItem";
  return b.Signature with {Inputs=b.Signature.Inputs.Where(p=>p.Name!=other).Select(p=>p.Name==own?p with{Name="item"}:p).ToArray()};
 }
 public static NodeDefinition Definition(FlowNode node) => NodeDescriptions.Describe(DefinitionCore(node));
    private static NodeDefinition DefinitionCore(FlowNode node)
 {
  var b=node.Graph!;var s=b.Signature;
  var left=s.Inputs.SingleOrDefault(p=>p.Name=="leftItem");var right=s.Inputs.SingleOrDefault(p=>p.Name=="rightItem");var index=s.Inputs.SingleOrDefault(p=>p.Name=="index");
  void Require(bool condition,string message){if(!condition)throw new ContractException([new("graph_control","/nodes/"+node.Id,message)]);}
  Require(left is not null&&right is not null&&left.Type.Kind!="optional"&&right.Type.Kind!="optional"&&index?.Type is {Kind:"scalar",Name:"core.Integer"}&&s.Inputs.All(p=>p.Name!="item"),"Join requires leftItem, rightItem and Integer index inputs; item is reserved.");
  Require(s.Outputs is [{Name:"value"}]&&s.Outputs[0].Type.Kind!="optional"&&ValueEqualityContract.Supports(s.Outputs[0].Type),"Join selectors must return one required value supporting equality.");
  var inputs=new Dictionary<string,TypeRef>{{"left",new("array",Items:left!.Type)},{"right",new("array",Items:right!.Type)}};var labels=new Dictionary<string,PortMetadata>();
  foreach(var slot in new[]{"leftKey","rightKey"})inputs[slot]=new("graph",Signature:SlotSignature(b,slot));
  foreach(var p in s.Inputs.Where(p=>p.Name is not ("leftItem" or "rightItem" or "index"))){var key=GraphNodes.InputPort(p);inputs[key]=p.Type;labels[key]=new(p.Name);}
  var fields=new Dictionary<string,TypeRef>{{"left",left.Type},{"right",b.Operation=="groupJoinByKey"?new("array",Items:right.Type):b.Operation=="leftJoinByKey"?new("optional",Inner:right.Type):right.Type}};
  if(b.Operation=="leftJoinByKey")fields["found"]=new("scalar",Name:"core.Bool");
  return new(node.Type,1,s.Inputs.Concat(s.Outputs).All(p=>TransportContracts.IsTransportable(p.Type))?["server","browser"]:["server"],inputs,new(){{"value",new("array",Items:new("object",Fields:fields))}},new(Label:b.Operation,Category:"Control/Graphs",Inputs:labels),Control:new(true,true,false),Graph:b,NodeId:node.Id);
 }
}
