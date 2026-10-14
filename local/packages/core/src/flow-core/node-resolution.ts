import type {Catalog,FlowNode,NodeDefinition} from './model.js';
export const definitionKey=(node:NodeDefinition)=>`${node.type}@${node.version}/${node.nodeId??''}`;
export function resolveDefinition(catalog:Catalog,node:Pick<FlowNode,'type'|'typeVersion'|'id'>):NodeDefinition|undefined {
  return catalog.nodes.find(d=>d.type===node.type&&d.version===node.typeVersion&&d.nodeId===node.id)
    ??catalog.nodes.find(d=>d.type===node.type&&d.version===node.typeVersion&&d.nodeId===undefined);
}
