import {deleteGraphs} from './graph-workspace.js';
import type {GraphWorkspaceState,WorkspaceGraph} from './graph-workspace.js';
import {emptyLayout} from './layout.js';
/** Resource folders are presentation data; graph IDs and runtime references are unchanged. */
export interface InternalFlowGroup {id:string;name:string;parentId?:string;graphIds:string[]}
export function internalGroups(state:GraphWorkspaceState,ownerId:string):InternalFlowGroup[]{return state.graphs.find(g=>g.id===ownerId)?.layout?.flowGroups??[];}
export function internalGroupOf(state:GraphWorkspaceState,graph:WorkspaceGraph):string|undefined{return graph.ownerId?internalGroups(state,graph.ownerId).find(group=>group.graphIds.includes(graph.localId!))?.id:undefined;}
function change(state:GraphWorkspaceState,ownerId:string,groups:InternalFlowGroup[]):GraphWorkspaceState {
 const owner=state.graphs.find(g=>g.id===ownerId);if(!owner||owner.ownerId||owner.readOnly)throw new Error('Der Hauptflow fehlt oder ist schreibgeschützt.');
 validateGroups(groups,state.graphs.filter(g=>g.ownerId===ownerId&&!g.inlineOwner).map(g=>g.localId!));
 return {...state,graphs:state.graphs.map(g=>g.id===ownerId?{...g,layout:{...(g.layout??emptyLayout()),flowGroups:groups}}:g)};
}
export function validateGroups(groups:InternalFlowGroup[],members:string[]):void {
 if(!Array.isArray(groups)||groups.length>500)throw new Error('Ungültige Untergraph-Gruppen.');
 const ids=new Set<string>(),names=new Set<string>(),assigned=new Set<string>();
 for(const group of groups){
  if(!group||typeof group.id!=='string'||!group.id||ids.has(group.id)||typeof group.name!=='string'||!group.name.trim()||group.name.length>100||!Array.isArray(group.graphIds)||group.parentId!==undefined&&typeof group.parentId!=='string')throw new Error('Ungültige Untergraph-Gruppe.');
  ids.add(group.id);const name=JSON.stringify([group.parentId??'',group.name]);if(names.has(name))throw new Error('Dieser Gruppenname wird hier bereits verwendet.');names.add(name);
  for(const id of group.graphIds){if(typeof id!=='string'||!members.includes(id)||assigned.has(id))throw new Error('Ungültige oder doppelte Gruppenzuordnung eines Untergraphen.');assigned.add(id);}
 }
 for(const group of groups){const seen=new Set([group.id]);let parent=group.parentId;while(parent){if(!ids.has(parent)||seen.has(parent))throw new Error('Ungültiger Untergraph-Gruppenbaum.');seen.add(parent);parent=groups.find(g=>g.id===parent)!.parentId;}}
}
export function saveInternalGroup(state:GraphWorkspaceState,ownerId:string,name:string,parentId?:string,id=crypto.randomUUID()):GraphWorkspaceState {
 const groups=internalGroups(state,ownerId),existing=groups.find(g=>g.id===id),group={id,name:name.trim(),graphIds:existing?.graphIds??[],...(parentId?{parentId}:{})};
 return change(state,ownerId,existing?groups.map(g=>g.id===id?group:g):[...groups,group]);
}
export function moveInternalGraph(state:GraphWorkspaceState,ownerId:string,graphId:string,groupId?:string):GraphWorkspaceState {
 const graph=state.graphs.find(g=>g.id===graphId),groups=internalGroups(state,ownerId);
 if(!graph||graph.ownerId!==ownerId||graph.readOnly||graph.inlineOwner)throw new Error('Nur interne Untergraphen dieses Hauptflows können hier eingeordnet werden.');
 if(groupId&&!groups.some(g=>g.id===groupId))throw new Error('Die Zielgruppe fehlt.');
 return change(state,ownerId,groups.map(group=>({...group,graphIds:[...group.graphIds.filter(id=>id!==graph.localId),...(group.id===groupId?[graph.localId!]:[])]})));
}
export function deleteInternalGroup(state:GraphWorkspaceState,ownerId:string,id:string,contents=false):GraphWorkspaceState {
 const groups=internalGroups(state,ownerId),group=groups.find(g=>g.id===id);if(!group)throw new Error('Die Gruppe fehlt.');
 if(contents){
  const removing=new Set([id]);let grew=true;while(grew){grew=false;for(const child of groups)if(child.parentId&&removing.has(child.parentId)&&!removing.has(child.id)){removing.add(child.id);grew=true;}}
  const locals=new Set(groups.filter(g=>removing.has(g.id)).flatMap(g=>g.graphIds));
  const next=deleteGraphs(state,state.graphs.filter(g=>g.ownerId===ownerId&&locals.has(g.localId!)).map(g=>g.id));
  return change(next,ownerId,internalGroups(next,ownerId).filter(g=>!removing.has(g.id)));
 }

 return change(state,ownerId,groups.filter(g=>g.id!==id).map(g=>{
  const {parentId,...rest}=g;
  return {...rest,...((parentId===id?group.parentId:parentId)?{parentId:parentId===id?group.parentId!:parentId!}:{}),graphIds:g.id===group.parentId?[...g.graphIds,...group.graphIds]:g.graphIds};
 }));
}
export function remapInternalGroups(layout:WorkspaceGraph['layout'],localIds:Map<string,string>):WorkspaceGraph['layout'] {
 if(!layout)return undefined;
 return {...structuredClone(layout),...(layout.flowGroups?{flowGroups:layout.flowGroups.map(g=>({...g,graphIds:g.graphIds.flatMap(id=>localIds.has(id)?[localIds.get(id)!]:[])}))}:{})};
}
