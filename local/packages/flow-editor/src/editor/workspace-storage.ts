import {validateInternalFlows} from './internal-flows.js';
import {validateSchema,ContractError} from '@adam-flow/core/flow-core/index.js';
import type {GraphWorkspaceState} from './graph-workspace.js';

export const workspaceStorageKey='adam.flow2.workspace.v1';
type StorageAccess=Pick<Storage,'getItem'|'setItem'>;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(item=>typeof item==='string')&&new Set(value).size===value.length;
const point=(value:unknown)=>record(value)&&Number.isFinite(value.x)&&Number.isFinite(value.y);

function validateLayout(layout:unknown,allowExpressions=true):void {
  if(!record(layout)||!record(layout.positions)||!Object.values(layout.positions).every(point)||!Array.isArray(layout.comments)||!Array.isArray(layout.groups))throw new Error('Ungültiges Graph-Layout.');
  const validIds=(items:unknown[])=>items.every(item=>record(item)&&typeof item.id==='string')&&new Set(items.map(item=>(item as {id:string}).id)).size===items.length;
  const dimension=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0;
  if(!validIds(layout.comments)||!validIds(layout.groups)||!layout.comments.every(item=>point(item)&&typeof item.text==='string'&&(item.width===undefined||dimension(item.width))&&(item.height===undefined||dimension(item.height))&&(item.fontSize===undefined||dimension(item.fontSize)))||!layout.groups.every(item=>point(item)&&typeof item.name==='string'&&typeof item.color==='string'&&dimension(item.width)&&dimension(item.height)&&strings(item.nodeIds)&&strings(item.commentIds)))throw new Error('Ungültige Kommentare oder Gruppen.');
  if(layout.expressions!==undefined){if(!allowExpressions||!record(layout.expressions))throw new Error('Ungültige Ausdrucks-Layouts.');for(const child of Object.values(layout.expressions))validateLayout(child,false);}
}

/** Validate structure, not executability: incomplete editor drafts are valid workspaces. */
export function decodeWorkspace(json:string):GraphWorkspaceState {
  const envelope:unknown=JSON.parse(json);
  if(!record(envelope)||envelope.version!==2||!record(envelope.workspace))throw new Error('Inkompatibles Workspace-Format. Flow2 benötigt Version 2; ältere Graphen können nicht importiert werden.');
  const state=envelope.workspace;
  if(!Array.isArray(state.graphs)||!strings(state.openIds))throw new Error('Ungültiger Workspace.');
  const groupParents=new Map<string,string|undefined>();
  if(state.groups!==undefined){
    if(!Array.isArray(state.groups))throw new Error('Ungültige Workspace-Gruppen.');
    const siblings=new Set<string>();
    for(const group of state.groups){
      if(!record(group)||typeof group.id!=='string'||!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(group.id)||groupParents.has(group.id)||typeof group.name!=='string'||!group.name.trim()||group.name.length>100||(group.parentId!==undefined&&typeof group.parentId!=='string')||(group.collapsed!==undefined&&typeof group.collapsed!=='boolean'))throw new Error('Ungültige Workspace-Gruppe.');
      const sibling=`${group.parentId??''}\0${group.name}`;
      if(siblings.has(sibling))throw new Error('Doppelter Gruppenname.');siblings.add(sibling);
      groupParents.set(group.id,group.parentId as string|undefined);
    }
    for(const id of groupParents.keys()){
      const visited=new Set<string>();let current:string|undefined=id;
      while(current!==undefined){if(visited.has(current)||!groupParents.has(current))throw new Error('Ungültiger Gruppenbaum.');visited.add(current);current=groupParents.get(current);}
    }
  }
  const ids=new Set<string>();
  for(const graph of state.graphs){
    if(!record(graph)||typeof graph.id!=='string'||ids.has(graph.id)||typeof graph.name!=='string'||!Number.isInteger(graph.revision)||Number(graph.revision)<1)throw new Error('Ungültiger Graph.');
    ids.add(graph.id);
    if(graph.groupId!==undefined&&(typeof graph.groupId!=='string'||!groupParents.has(graph.groupId)))throw new Error('Unbekannte Graph-Gruppe.');
    // Execution requires at least one node; an editor draft may still be empty.
    const errors=validateSchema('flow',graph.flow).filter(error=>!(error.path==='/nodes'&&error.message.endsWith('(#/properties/nodes/minItems)')));
    if(errors.length)throw new ContractError(errors);
    if((graph.flow as {id:string}).id!==graph.id)throw new Error('Graph-ID stimmt nicht überein.');
    if(graph.layout!==undefined)validateLayout(graph.layout);
  }
  if(!state.openIds.every(id=>ids.has(id))||(state.activeId!==null&&(typeof state.activeId!=='string'||!state.openIds.includes(state.activeId))))throw new Error('Ungültige Graph-Tabs.');
  validateInternalFlows(state as unknown as GraphWorkspaceState,false);
  return state as unknown as GraphWorkspaceState;
}

export function readWorkspace(storage:StorageAccess,key=workspaceStorageKey):GraphWorkspaceState|null {
  const json=storage.getItem(key);
  return json===null?null:decodeWorkspace(json);
}
/** Same versioned format for local storage and portable workspace files. */
export function encodeWorkspace(state:GraphWorkspaceState):string {
  const json=JSON.stringify({version:2,workspace:state},null,2);
  decodeWorkspace(json);
  return json;
}
export function writeWorkspace(storage:StorageAccess,state:GraphWorkspaceState,key=workspaceStorageKey):void {
  storage.setItem(key,JSON.stringify({version:2,workspace:state}));
}
