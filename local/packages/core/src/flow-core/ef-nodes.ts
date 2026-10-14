import {describeNode} from './node-descriptions.js';
import type {Catalog,Flow,FlowNode,NodeDefinition,TypeDocument,TypeRef} from './model.js';
function efDefinitionCore(node:FlowNode,catalog:Catalog,types:TypeDocument):NodeDefinition {
  const binding=node.ef;
  const family=catalog.nodes.find(d=>d.type===node.type&&!d.nodeId);
  if(!binding||!family||node.environment!=='server'||node.typeVersion!==1||!family.metadata?.efTargets?.some(t=>t.context===binding.context&&t.entity===binding.entity&&t.collection===binding.collection))throw new Error('Unbekanntes EF-Ziel.');
  const entity:TypeRef={kind:'entity',name:binding.entity??''},guid:TypeRef={kind:'scalar',name:'core.Guid'};
  const definition:NodeDefinition={...structuredClone(family),nodeId:node.id,ef:structuredClone(binding),inputs:{},outputs:{}};
  switch(node.type){
    case 'Backend.EF.Source':definition.outputs.query={kind:'queryable',items:entity};break;
    case 'Backend.EF.GetById':definition.inputs.id=guid;definition.outputs.entity=entity;break;
    case 'Backend.EF.Create':definition.outputs={entity,id:guid};break;
    case 'Backend.EF.Delete':definition.inputs.id=guid;break;
    case 'Backend.EF.SaveChanges':definition.outputs.count={kind:'scalar',name:'core.Integer'};break;
    case 'Backend.EF.SetFields':
      definition.inputs.entity=entity;definition.outputs.entity=entity;
      const inputs=family.metadata?.efInputs?.[binding.entity!];if(!inputs)throw new Error('EF-Feldvertrag fehlt.');
      definition.inputs=structuredClone(inputs);
      break;
    default:throw new Error('Unbekannte EF-Operation.');
  }
  return definition;
}
export function efCatalog(flow:Flow,catalog:Catalog,types:TypeDocument):Catalog {
  return {...catalog,nodes:[...catalog.nodes.filter(n=>!n.nodeId||!n.ef),...flow.nodes.filter(n=>n.ef).map(n=>efDefinition(n,catalog,types))]};
}

export function efDefinition(node:FlowNode,catalog:Catalog,types:TypeDocument):NodeDefinition {return describeNode(efDefinitionCore(node,catalog,types));}
