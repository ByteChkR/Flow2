import type {Flow,TypeRef} from '@adam-flow/core/flow-core/model.js';
export interface PageDataContract {nodeId:string;label:string;type:TypeRef}
/** Only actual Show-node bindings are authoritative; an entity schema is not T. */
export function connectedContracts(flow:Flow,nodeId:string):PageDataContract[]{
 return flow.connections.filter(connection=>connection.kind!=='control'&&connection.source.nodeId===nodeId&&connection.source.port==='value'&&connection.target.port==='page').flatMap(connection=>{
  const node=flow.nodes.find(candidate=>candidate.id===connection.target.nodeId);
  return node?.ui?.dataType?[{nodeId:node.id,label:node.id,type:node.ui.dataType}]:[];
 });
}
