import {executionContent,type StoredValidation} from './validation-state.js';
import {remapInternalGroups} from './internal-groups.js';
import {cloneFlowUnit,validateInternalFlows} from './internal-flows.js';
import {mapReferences} from './graph-references.js';
export {mapReferences} from './graph-references.js';
import {workspaceTransport as axios} from '../host.js';

import {decodeWorkspace} from './workspace-storage.js';
import {groupPath,type GraphWorkspaceState,type WorkspaceGraph,type WorkspaceGroup} from './graph-workspace.js';
import type {Flow} from '@adam-flow/core/flow-core/index.js';
import {emptyLayout} from './layout.js';
import type {EditorLayout} from './layout.js';

export interface WorkspaceSource {id:string;name:string;token:number}
interface StoredGroup {id:string;workspaceId:string;parentId:string|null;name:string;displayName:string|null;sortOrder:number;token:number}
interface StoredInternalFlow {validation?:StoredValidation;inlineOwner?:import('./inline-graphs.js').InlineGraphOwner;id:string;name:string;displayName:string;description:string;graph:Flow;layout:EditorLayout|null}
interface StoredFlow {validation?:StoredValidation;internalFlows?:StoredInternalFlow[];id:string;workspaceId:string;groupId:string|null;name:string;flowId:string;displayName:string;description:string;graph:Flow;layout:EditorLayout|null;token:number}
export interface WorkspaceDocument {workspaceId:string;sources:WorkspaceSource[];groups:StoredGroup[];flows:StoredFlow[]}
export interface PersistedOrigin {databaseId?:string;workspaceId?:string;originName?:string;readOnly?:boolean;token?:number}
const graphKey=(id:string)=>`graph_${id}`;
const groupKey=(id:string)=>`group_${id}`;
const databaseId=(id:string,prefix:string)=>{
  const value=id.startsWith(prefix)?id.slice(prefix.length):id;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new Error('Ungültige interne ID. Bitte den Graph als eigene Kopie übernehmen.');
  return value;
};
export function fromDocument(document:WorkspaceDocument,previous?:GraphWorkspaceState):GraphWorkspaceState {
  const expanded=document.flows.flatMap(root=>[root,...(root.internalFlows??[]).map(child=>({...child,flowId:internalPath(root.id,child.id),workspaceId:root.workspaceId,groupId:null,token:root.token,ownerId:graphKey(root.id),localId:child.id}))]);
  const editorId=(item:typeof expanded[number])=>'ownerId' in item?`${item.ownerId}_internal_${item.id}`:graphKey(item.id);
  const ids=new Map(expanded.map(flow=>[flow.flowId,editorId(flow)]));
  const resolve=(id:string)=>{const target=ids.get(id);if(!target)throw new Error(`Referenzierter Flow fehlt: ${id}`);return target;};
  const origin=(item:{id:string;workspaceId:string;token:number})=>({databaseId:item.id,workspaceId:item.workspaceId,token:item.token,readOnly:item.workspaceId!==document.workspaceId,originName:document.sources.find(source=>source.id===item.workspaceId)?.name??item.workspaceId});
  const graphs:WorkspaceGraph[]=expanded.map(item=>{
    const flow=mapReferences(item.graph,resolve,id=>expanded.find(flow=>flow.flowId===id)!.graph.version);flow.id=editorId(item);
    return {...(item.validation?{validation:item.validation}:{}),validationContent:executionContent(flow),id:flow.id,name:item.displayName||item.name,technicalName:item.name,description:item.description,flowId:item.flowId,revision:flow.version,...('ownerId' in item?{ownerId:item.ownerId,localId:item.localId}:{internalsCollapsed:previous?.graphs.find(graph=>graph.id===flow.id)?.internalsCollapsed??false}),...('inlineOwner' in item&&item.inlineOwner?{inlineOwner:{...item.inlineOwner,graphId:resolve(item.inlineOwner.graphId)}}:{}),flow,layout:item.layout??emptyLayout(),...(item.groupId?{groupId:groupKey(item.groupId)}:{}),...origin(item)};
  });
  const openIds=previous?.openIds.filter(id=>graphs.some(graph=>graph.id===id))??[];
  const state={graphs,groups:document.groups.map(item=>({id:groupKey(item.id),name:item.name,displayName:item.displayName??'',sortOrder:item.sortOrder,parentId:item.parentId?groupKey(item.parentId):undefined,collapsed:previous?.groups?.find(group=>group.id===groupKey(item.id))?.collapsed,...origin(item)})),openIds,activeId:openIds.includes(previous?.activeId??'')?previous!.activeId:null};
  // Shares the import/editor structural validator; metadata is preserved by the decoder.
  return decodeWorkspace(JSON.stringify({version:2,workspace:state}));
}
const internalPath=(owner:string,local:string)=>`__internal_${owner.replaceAll('-','')}_${local.replaceAll('-','')}`;
export function readableId(state:GraphWorkspaceState,graph:WorkspaceGraph):string {
  if(graph.ownerId){const owner=state.graphs.find(item=>item.id===graph.ownerId);if(!owner||!graph.localId)throw new Error('Besitzer des internen Flows fehlt.');return internalPath(owner.databaseId??databaseId(owner.id,'graph_'),graph.localId);}
  return [groupPath(state,graph.groupId).replaceAll(' / ','.'),graph.technicalName??graph.name].filter(Boolean).join('.');
}
export function toRequest(state:GraphWorkspaceState,document:WorkspaceDocument) {
  validateInternalFlows(state,false);
  const paths=new Map(state.graphs.map(graph=>[graph.id,readableId(state,graph)]));
  const resolve=(id:string)=>{const path=paths.get(id);if(!path)throw new Error(`Referenzierter Graph fehlt: ${id}`);return path;};
  return {
    sources:document.sources,
    groups:(state.groups??[]).filter(group=>!group.readOnly).map((group,index)=>({id:group.databaseId??databaseId(group.id,'group_'),workspaceId:document.workspaceId,parentId:group.parentId?databaseId(group.parentId,'group_'):null,name:group.name,displayName:group.displayName??null,sortOrder:group.sortOrder??index,token:group.token??0})),
    flows:state.graphs.filter(graph=>!graph.readOnly&&!graph.ownerId).map(graph=>{
      const flowId=paths.get(graph.id)!;
      const flow=mapReferences(graph.flow,resolve,null);flow.id=flowId;
      return {id:graph.databaseId??databaseId(graph.id,'graph_'),workspaceId:document.workspaceId,groupId:graph.groupId?databaseId(graph.groupId,'group_'):null,name:graph.technicalName??graph.name,flowId,displayName:graph.name,description:graph.description??'',graph:flow,layout:graph.layout??null,token:graph.token??0,internalFlows:state.graphs.filter(child=>child.ownerId===graph.id).map(child=>{
        const embedded=mapReferences(child.flow,resolve,null);embedded.id=paths.get(child.id)!;
        return {id:child.localId!,name:child.technicalName??child.name,displayName:child.name,description:child.description??'',graph:embedded,layout:child.layout??null,...(child.inlineOwner?{inlineOwner:{...child.inlineOwner,graphId:resolve(child.inlineOwner.graphId)}}:{})};
      })};
    })
  };
}
// JSONB can reorder object keys; rebuilding layout.positions must not count as an edit.
// Keep array order and JSON's treatment of omitted/undefined properties unchanged.
function stableJson(value:unknown):string {
  return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
    ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
}
export function graphFingerprint(graph?:WorkspaceGraph):string {
  return stableJson({...graph,internalsCollapsed:undefined});
}
export function groupFingerprint(group?:WorkspaceGroup):string {
  return stableJson({...group,collapsed:undefined});
}
export function workspaceFingerprint(state:GraphWorkspaceState):string {
  // UI navigation and group expansion are personal state, not database edits.
  return stableJson({groups:state.groups?.filter(item=>!item.readOnly).map(({collapsed,...group})=>group),graphs:state.graphs.filter(item=>!item.readOnly).map(({internalsCollapsed,...graph})=>graph)});
}
export function copyFlow(state:GraphWorkspaceState,source:WorkspaceGraph):GraphWorkspaceState {
  const copied=cloneFlowUnit(state,source,source.readOnly?undefined:source.ownerId);
  const targetOwner=copied.graphs.find(graph=>graph.id===copied.activeId)!.ownerId;
  const base=(source.technicalName??source.name).slice(0,90)+'Copy';let technicalName=base,index=2;
  while(state.graphs.some(graph=>graph.ownerId===targetOwner&&!graph.groupId&&(graph.technicalName??graph.name)===technicalName))technicalName=`${base}${index++}`;
  return {...copied,graphs:copied.graphs.map(graph=>graph.id===copied.activeId?{...graph,name:source.name+' (Kopie)',technicalName}:graph)};
}
export async function loadWorkspace(signal?:AbortSignal,capabilities?:Record<string,unknown>):Promise<WorkspaceDocument> {
  return capabilities?(await axios.post('flow2/workspace/load',capabilities,signal?{signal}:{})).data
    :(await axios.get('flow2/workspace',signal?{signal}:{})).data;
}
export async function loadTriggerFlowChoices(type:string,entity:string|undefined,signal?:AbortSignal):Promise<{flows:WorkspaceDocument['flows'];validation:{id:string;error:string|null}[]}> {
  return (await axios.get('flow2/workspace/trigger-choices',{params:{type,entity},...(signal?{signal}:{})})).data;
}
export async function saveWorkspace(state:GraphWorkspaceState,document:WorkspaceDocument,signal?:AbortSignal,validationOptions:Record<string,unknown>={},progressId?:string):Promise<WorkspaceDocument> {
  return (await axios.put('flow2/workspace',{...toRequest(state,document),...validationOptions},{...(signal?{signal}:{}),...(progressId?{headers:{'X-Flow-Validation':progressId}}:{})})).data;
}
export function persistenceError(error:unknown):string {
  if(axios.isAxiosError(error))return error.response?.data?.error??error.message;
  return String(error);
}

/** Explicit file import creates local identities; file provenance never grants ownership. */
export function importWorkspace(state:GraphWorkspaceState,imported:GraphWorkspaceState):GraphWorkspaceState {
  const graphIds=new Map(imported.graphs.map(graph=>[graph.id,`graph_${crypto.randomUUID()}`]));
  for(const graph of imported.graphs.filter(item=>item.ownerId))graphIds.set(graph.id,`${graphIds.get(graph.ownerId!)}_internal_${crypto.randomUUID()}`);
  const groupIds=new Map(imported.groups?.map(group=>[group.id,`group_${crypto.randomUUID()}`])??[]);
  const rootId=`group_${crypto.randomUUID()}`;
  let rootName='Import',index=2;while(state.groups?.some(group=>!group.parentId&&group.name===rootName)||state.graphs.some(graph=>!graph.groupId&&(graph.technicalName??graph.name)===rootName))rootName=`Import${index++}`;
  const segment=(name:string)=>{const cleaned=name.normalize('NFKD').replace(/[^A-Za-z0-9_-]/g,'');return (/^[A-Za-z_]/.test(cleaned)?cleaned:'Flow'+cleaned).slice(0,100);};
  const used=new Set<string>();
  const unique=(parent:string,name:string)=>{let result=segment(name),index=2;const base=result;while(used.has(parent+'.'+result))result=base.slice(0,94)+index++;used.add(parent+'.'+result);return result;};
  const groups=[...(state.groups??[]),{id:rootId,name:rootName},...(imported.groups??[]).map(group=>{const parentId=group.parentId?groupIds.get(group.parentId)!:rootId;return {id:groupIds.get(group.id)!,name:unique(parentId,group.name),parentId};})];
  const graphs=imported.graphs.map(source=>{
    const id=graphIds.get(source.id)!,ownerId=source.ownerId?graphIds.get(source.ownerId):undefined,groupId=source.groupId?groupIds.get(source.groupId)!:rootId;
    const flow=mapReferences(source.flow,reference=>{const target=graphIds.get(reference);if(!target)throw new Error(`Import enthält nicht alle Abhängigkeiten: ${reference}`);return target;});flow.id=id;
    return {id,name:source.name,technicalName:unique(ownerId??groupId,source.technicalName??source.name),description:source.description??'',revision:flow.version,flow,layout:structuredClone(source.layout??emptyLayout()),...(ownerId?{ownerId,localId:id.slice(-36)}:{groupId}),...(source.inlineOwner?{inlineOwner:{...source.inlineOwner,graphId:graphIds.get(source.inlineOwner.graphId)!}}:{})};
  });
  for(const graph of graphs)if(graph.layout.flowGroups){const source=imported.graphs.find(g=>graphIds.get(g.id)===graph.id)!;const localIds=new Map(imported.graphs.filter(g=>g.ownerId===source.id).map(g=>[g.localId!,graphIds.get(g.id)!.slice(-36)]));graph.layout=remapInternalGroups(graph.layout,localIds)!;}
  const activeId=graphIds.get(imported.activeId??'')??graphs[0]?.id??state.activeId;
  return {...state,groups,graphs:[...state.graphs,...graphs],activeId,openIds:activeId&&!state.openIds.includes(activeId)?[...state.openIds,activeId]:state.openIds};
}

export function exportWorkspaceState(state:GraphWorkspaceState):GraphWorkspaceState {
  const paths=new Map(state.graphs.map(graph=>[graph.id,readableId(state,graph)]));
  const resolve=(id:string)=>{const path=paths.get(id);if(!path)throw new Error(`Referenzierter Flow fehlt: ${id}`);return path;};
  const graphs=state.graphs.map(source=>{
    const id=resolve(source.id),flow=mapReferences(source.flow,resolve,null);flow.id=id;
    return {id,name:source.name,technicalName:source.technicalName??source.name,description:source.description??'',revision:source.revision,flow,layout:structuredClone(source.layout??emptyLayout()),...(source.groupId?{groupId:source.groupId}:{}),...(source.ownerId?{ownerId:resolve(source.ownerId),localId:source.localId}:{}),...(source.inlineOwner?{inlineOwner:{...source.inlineOwner,graphId:resolve(source.inlineOwner.graphId)}}:{})};
  });
  return {graphs,groups:state.groups?.map(group=>({id:group.id,name:group.name,...(group.parentId?{parentId:group.parentId}:{})}))??[],openIds:state.openIds.map(resolve),activeId:state.activeId?resolve(state.activeId):null};
}
