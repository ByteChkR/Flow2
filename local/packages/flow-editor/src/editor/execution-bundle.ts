import type {Flow,GraphBundle} from '@adam-flow/core/flow-core/index.js';

/** Resolve once before execution; unrelated drafts do not become runtime dependencies. */
export function executionBundle(bundle:GraphBundle|undefined,root:Flow,inputs:unknown):GraphBundle|undefined {
  if(!bundle)return undefined;
  const available=new Map(bundle.graphs.map(graph=>[graph.id,graph]));available.set(root.id,root);
  const selected=new Map<string,Flow>();
  const references=(value:unknown,parentKey?:string):string[]=>{
    if(!value||typeof value!=='object')return [];
    if(Array.isArray(value))return value.flatMap(child=>references(child));
    const item=value as Record<string,unknown>;
    return [...(typeof item.graphId==='string'&&(parentKey==='config'||typeof item.operation==='string'||Object.keys(item).every(key=>key==='graphId'||key==='revision'))?[item.graphId]:[]),...Object.entries(item).filter(([key])=>key!=='graphId').flatMap(([key,value])=>references(value,key))];
  };
  const visit=(id:string)=>{
    if(selected.has(id))return;
    const graph=available.get(id);if(!graph)throw new Error(`Referenzierter Flow fehlt: ${id}`);
    selected.set(id,graph);references(graph).forEach(visit);
  };
  visit(root.id);references(inputs).forEach(visit);
  const graphs=structuredClone([...selected.values()]);
  const refresh=(value:unknown)=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.forEach(refresh);return;}
    const item=value as Record<string,unknown>;
    if(typeof item.graphId==='string'&&Object.keys(item).every(key=>key==='graphId'||key==='revision'))item.revision=selected.get(item.graphId)!.version;
    Object.values(item).forEach(refresh);
  };
  graphs.forEach(refresh);
  return {schemaVersion:1,rootGraphId:root.id,graphs};
}
