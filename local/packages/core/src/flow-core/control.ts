import {resolveDefinition} from './node-resolution.js';
import type { Catalog, Flow } from './model.js';

/** Control fan-out is a fork; multiple incoming control edges are an AND join. */
export function activeNodes(flow:Flow,catalog:Catalog):Set<string> {
  const definitions=new Map(catalog.nodes.map(node=>[`${node.type}@${node.version}`,node]));
  const active=new Set(flow.nodes.filter(node=>{const control=resolveDefinition(catalog,node)?.control;return control?.start||(!control?.input&&control?.output&&flow.connections.some(edge=>edge.kind==='control'&&edge.source.nodeId===node.id));}).map(node=>node.id));
  let changed=true;
  while(changed) {
    changed=false;
    for(const node of flow.nodes) {
      if(active.has(node.id)||!resolveDefinition(catalog,node)?.control?.input)continue;
      const incoming=flow.connections.filter(edge=>edge.kind==='control'&&edge.target.nodeId===node.id);
      if(incoming.length&&incoming.every(edge=>active.has(edge.source.nodeId))){active.add(node.id);changed=true;}
    }
  }
  // Pure data dependencies are evaluated once and shared across active branches.
  changed=true;
  while(changed) {
    changed=false;
    for(const edge of flow.connections) {
      if(edge.kind==='control'||!active.has(edge.target.nodeId)||active.has(edge.source.nodeId))continue;
      const source=flow.nodes.find(node=>node.id===edge.source.nodeId);
      if(source&&!resolveDefinition(catalog,source)?.control?.input){active.add(source.id);changed=true;}
    }
  }
  return active;
}
