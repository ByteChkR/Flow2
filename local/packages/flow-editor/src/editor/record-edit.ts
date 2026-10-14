import {remapInternalGroups} from './internal-groups.js';
import type {GraphWorkspaceState,WorkspaceGraph} from './graph-workspace.js';
import {addGraph,addWorkspaceGroup,groupPath,resolveWorkspaceModes,deleteGraph,deleteWorkspaceGroup} from './graph-workspace.js';
import {addInternalGraph,cloneFlowUnit,validateInternalFlows} from './internal-flows.js';
import {mapReferences} from './graph-references.js';
import {assignDesignation} from './designations.js';
import {flowInterface,graphCatalog,isHybridType,materializeHybrid} from '@adam-flow/core/flow-core/index.js';
import type {Catalog,Flow} from '@adam-flow/core/flow-core/index.js';
import {inputCatalog} from '@adam-flow/runtime-browser/nodes/input-types.js';
export interface RecordDraft {name:string;technicalName:string;description:string;groupId:string;hybrid:boolean;designation:string;controlInput:boolean;controlOutput:boolean}
export interface EditRequest {kind:'group'|'graph';mode:'create'|'edit'|'copy';id?:string;parentId?:string;ownerId?:string}
export function recordDraft(state:GraphWorkspaceState,request:EditRequest,catalog:Catalog):RecordDraft {
 const graph=request.kind==='graph'?state.graphs.find(g=>g.id===request.id):undefined;
 const group=request.kind==='group'?state.groups?.find(g=>g.id===request.id):undefined;
 const signature=graph?flowInterface(graph.flow,catalog):undefined;
 return {name:graph?.name??group?.name??'',technicalName:graph?.technicalName??graph?.name??'',description:graph?.description??'',groupId:graph?.groupId??group?.parentId??request.parentId??'',hybrid:graph?.flow.mode==='hybrid',designation:graph?.flow.designation??'',controlInput:signature?.control.input??false,controlOutput:signature?.control.output??false};
}
export function configureFlow(flow:Flow,draft:RecordDraft,catalog:Catalog,graphs:WorkspaceGraph[]):Flow {
 let next=draft.designation===(flow.designation??'')?structuredClone(flow):assignDesignation(flow,draft.designation||undefined,catalog);
 next.control={input:draft.controlInput,output:draft.controlOutput};
 if(draft.hybrid){
  const definitions=graphCatalog(next,inputCatalog(next,catalog)).nodes;
  const invalid=next.nodes.filter(node=>{const def=(definitions.find(d=>d.type===node.type&&d.version===node.typeVersion&&d.nodeId===node.id)??definitions.find(d=>d.type===node.type&&d.version===node.typeVersion&&!d.nodeId));return !def||!def.environments.includes('server')||!def.environments.includes('browser')||![...Object.values(def.inputs),...Object.values(def.outputs)].every(isHybridType)||(node.graph?.graphId&&graphs.find(g=>g.id===node.graph!.graphId)?.flow.mode!=='hybrid');});
  if(invalid.length)throw new Error('Hybrid benötigt portable Nodes und hybride Subgraphen: '+invalid.map(n=>n.type).join(', '));
  next=materializeHybrid({...next,mode:'hybrid'});
 }else if(next.mode==='hybrid')next.mode='backend';
 return next;
}
function checkNames(state:GraphWorkspaceState){
 const used=new Set<string>();
 for(const graph of state.graphs){const key=graph.ownerId?`internal:${graph.ownerId}/${graph.technicalName??graph.name}`:`${groupPath(state,graph.groupId)}/${graph.technicalName??graph.name}`;if(used.has(key))throw new Error('Dieser technische Graphname wird im Ziel bereits verwendet.');used.add(key);}
 validateInternalFlows(state);
}
export function saveRecord(state:GraphWorkspaceState,request:EditRequest,draft:RecordDraft,catalog:Catalog):GraphWorkspaceState {
 const parent=draft.groupId||undefined;
 if(parent&&!state.groups?.some(g=>g.id===parent&&!g.readOnly))throw new Error('Die Zielgruppe fehlt oder ist schreibgeschützt.');
 if(request.kind==='group'){
  const name=draft.name.trim();if(!/^[A-Za-z_][A-Za-z0-9_-]{0,99}$/.test(name))throw new Error('Gruppenname: 1–100 Buchstaben, Ziffern, Unterstrich oder Bindestrich; keine führende Ziffer.');
  const source=state.groups?.find(g=>g.id===request.id);
  if(request.mode==='edit'&&(!source||source.readOnly))throw new Error('Gruppe ist schreibgeschützt oder fehlt.');
  let ancestor=parent;while(ancestor){if(ancestor===request.id)throw new Error('Eine Gruppe kann nicht in sich selbst oder ihre Untergruppe verschoben oder kopiert werden.');ancestor=state.groups?.find(g=>g.id===ancestor)?.parentId;}
  if(state.groups?.some(g=>g.parentId===parent&&g.name===name&&(request.mode!=='edit'||g.id!==request.id)))throw new Error('Dieser Gruppenname wird im Ziel bereits verwendet.');
  if(request.mode==='copy'){
   if(!source)throw new Error('Quellgruppe fehlt.');
   const ids=new Set([source.id]);let size=0;while(size!==ids.size){size=ids.size;for(const g of state.groups??[])if(g.parentId&&ids.has(g.parentId))ids.add(g.id);}
   const groupIds=new Map([...ids].map(id=>[id,`group_${crypto.randomUUID()}`]));
   const members=state.graphs.filter(g=>g.groupId&&ids.has(g.groupId)||g.ownerId&&state.graphs.some(owner=>owner.id===g.ownerId&&owner.groupId&&ids.has(owner.groupId)));
   const graphIds=new Map(members.filter(g=>!g.ownerId).map(g=>[g.id,`graph_${crypto.randomUUID()}`]));
   for(const g of members.filter(g=>g.ownerId))graphIds.set(g.id,`${graphIds.get(g.ownerId!)}_internal_${crypto.randomUUID()}`);
   const localIds=new Map(members.filter(g=>g.localId).map(g=>[g.localId!,graphIds.get(g.id)!.slice(-36)]));
   const groups=[...(state.groups??[]),...(state.groups??[]).filter(g=>ids.has(g.id)).map(g=>({id:groupIds.get(g.id)!,name:g.id===source.id?name:g.name,...((g.id===source.id?parent:groupIds.get(g.parentId!))?{parentId:(g.id===source.id?parent:groupIds.get(g.parentId!))!}:{})}))];
   const graphs=[...state.graphs,...members.map(g=>{const id=graphIds.get(g.id)!;return {id,name:g.name,technicalName:g.technicalName??g.name,description:g.description??'',revision:1,flow:{...mapReferences(g.flow,ref=>graphIds.get(ref)??ref,ref=>graphIds.has(ref)?1:state.graphs.find(g=>g.id===ref)?.revision??1),id,version:1},...(g.layout?{layout:remapInternalGroups(g.layout,localIds)!}:{}),...(g.ownerId?{ownerId:graphIds.get(g.ownerId)!,localId:id.slice(-36)}:{groupId:groupIds.get(g.groupId!)!}),...(g.inlineOwner?{inlineOwner:{...g.inlineOwner,graphId:graphIds.get(g.inlineOwner.graphId)!}}:{})};})];
   const next={...state,groups,graphs};checkNames(next);return next;
  }
  const id=request.id??`group_${crypto.randomUUID()}`;
  const next=request.mode==='create'?addWorkspaceGroup(state,id,parent):state;
  const result={...next,groups:next.groups!.map(g=>g.id===id?({...(({parentId,...rest})=>rest)(g),name,...(parent?{parentId:parent}:{})}):g)};checkNames(result);return result;
 }
 const technicalName=draft.technicalName.trim(),name=draft.name.trim();
 if(!/^[A-Za-z_][A-Za-z0-9_-]{0,99}$/.test(technicalName))throw new Error('Technischer Name: 1–100 Buchstaben, Ziffern, Unterstrich oder Bindestrich; keine führende Ziffer.');
 if(!name||name.length>200)throw new Error('Display Name muss 1–200 Zeichen enthalten.');
 const source=state.graphs.find(g=>g.id===request.id);
 let next=state,id=request.id;
 if(request.mode==='create'){next=request.ownerId?addInternalGraph(state,request.ownerId):addGraph(state,`graph_${crypto.randomUUID()}`);id=next.activeId!;}
 if(request.mode==='copy'){
  if(!source)throw new Error('Quellgraph fehlt.');
  if(technicalName===(source.technicalName??source.name)&&parent===source.groupId)throw new Error('Wähle für die Kopie einen anderen technischen Namen oder eine andere Gruppe.');
  next=cloneFlowUnit(state,source,source.ownerId&&!source.readOnly?source.ownerId:undefined);id=next.activeId!;
 }
 const graph=next.graphs.find(g=>g.id===id);if(!graph||graph.readOnly)throw new Error('Graph fehlt oder ist schreibgeschützt.');
 const flow=configureFlow(graph.flow,{...draft,designation:graph.ownerId?'':draft.designation},catalog,next.graphs);
 const revision=graph.revision+1;
 next={...next,graphs:next.graphs.map(g=>g.id===id?{...(({groupId,...rest})=>rest)(g),name,technicalName,description:draft.description,...(!g.ownerId&&parent?{groupId:parent}:{}),revision,flow:{...flow,version:revision}}:g)};
 checkNames(next);return resolveWorkspaceModes(next);
}

/** Validate before publishing the new state, including name collisions after folder removal. */
export function deleteRecord(state:GraphWorkspaceState,request:EditRequest,contents=false):GraphWorkspaceState {
 if(!request.id)throw new Error('Eintrag fehlt.');
 const next=request.kind==='graph'?deleteGraph(state,request.id):deleteWorkspaceGroup(state,request.id,contents);
 checkNames(next);return next;
}
