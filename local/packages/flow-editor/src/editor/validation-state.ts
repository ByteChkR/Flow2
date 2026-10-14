import type {GraphWorkspaceState,WorkspaceGraph} from './graph-workspace.js';
import {graphReferences} from './graph-references.js';
import type {Diagnostic,Flow} from '@adam-flow/core/flow-core/model.js';
export interface StoredValidation {state:'unchecked'|'stale'|'valid'|'invalid';fingerprint:string|null;validatedAt:string|null;diagnostics:Diagnostic[]}
export const validationLabels={unchecked:'Ungeprüft',stale:'Erneut prüfen',checking:'Wird geprüft …',valid:'Validiert',invalid:'Entwurf · Fehler'};
/** Local change detection only. Execution approval is always computed by the server. */
export function executionContent(flow:Flow):string {
 const value=structuredClone(flow);delete (value as Partial<Flow>).version;
 return JSON.stringify(value,(key,item)=>{
  if(item&&typeof item==='object'&&!Array.isArray(item))return Object.fromEntries(Object.entries(item).filter(([name])=>!(name==='revision'&&'graphId' in item&&Object.keys(item).every(k=>['graphId','revision'].includes(k)))).sort(([a],[b])=>a<b?-1:a>b?1:0));
  return item;
 });
}
export function validationStates(state:GraphWorkspaceState):Record<string,StoredValidation['state']> {
 const status:Record<string,StoredValidation['state']>={},reverse=new Map<string,Set<string>>(),changed=new Set<string>();
 for(const graph of state.graphs){
  status[graph.id]=graph.validation?.state??'unchecked';
  // Technical paths are identity; display name and canvas layout are presentation only.
  const path=[];let group=state.groups?.find(g=>g.id===graph.groupId);while(group){path.unshift(group.name);group=state.groups?.find(g=>g.id===group!.parentId);}
  const identity=graph.ownerId?graph.flowId:[...path,graph.technicalName??graph.name].join('.');
  if(!graph.validationContent||graph.validationContent!==executionContent(graph.flow)||identity!==graph.flowId){changed.add(graph.id);if(graph.validation)status[graph.id]='stale';}
  for(const dependency of graphReferences(graph.flow)){if(!reverse.has(dependency))reverse.set(dependency,new Set());reverse.get(dependency)!.add(graph.id);if(!state.graphs.some(g=>g.id===dependency)){changed.add(graph.id);status[graph.id]='stale';}}
 }
 const queue=[...changed];for(let index=0;index<queue.length;index++)for(const id of reverse.get(queue[index]!)??[])if(!changed.has(id)){changed.add(id);queue.push(id);status[id]='stale';}
 return status;
}
