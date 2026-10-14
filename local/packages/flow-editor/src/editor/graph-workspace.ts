import type {PersistedOrigin} from './workspace-api.js';
import {graphReferences} from './graph-references.js';
import {isGraphControl} from '@adam-flow/core/flow-core/graph-controls.js';
import {emptyLayout} from './layout.js';
import type {EditorLayout} from './layout.js';
import type {Flow} from '@adam-flow/core/flow-core/index.js';

export interface WorkspaceGraph extends PersistedOrigin {validation?:import('./validation-state.js').StoredValidation;validationContent?:string;inlineOwner?:import('./inline-graphs.js').InlineGraphOwner;ownerId?:string;localId?:string;internalsCollapsed?:boolean;technicalName?:string;description?:string;flowId?:string;id:string;name:string;revision:number;flow:Flow;layout?:EditorLayout;groupId?:string}
export interface GraphWorkspaceState {graphs:WorkspaceGraph[];openIds:string[];activeId:string|null;groups?:WorkspaceGroup[]}
export function emptyWorkspace():GraphWorkspaceState{return {graphs:[],openIds:[],activeId:null,groups:[]};}
export function addGraph(state:GraphWorkspaceState,id:string):GraphWorkspaceState {
  if(!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)||state.graphs.some(graph=>graph.id===id))throw new Error('Graph-ID ist ungültig oder bereits vorhanden.');
  let index=1;while(state.graphs.some(graph=>(graph.technicalName??graph.name)===`Graph${index}`))index++;
  const graph:WorkspaceGraph={id,name:`Graph${index}`,technicalName:`Graph${index}`,description:'',revision:1,layout:emptyLayout(),flow:{schemaVersion:2,id,version:1,mode:'interactive',entryNodeId:'start',nodes:[{id:'start',type:'Standard.Flow.Start',typeVersion:1,environment:'server',config:{}}],connections:[]}};
  return {...state,graphs:[...state.graphs,graph],openIds:[...state.openIds,id],activeId:id};
}
export function openGraph(state:GraphWorkspaceState,id:string):GraphWorkspaceState {
  requireGraph(state,id);
  return {...state,openIds:state.openIds.includes(id)?state.openIds:[...state.openIds,id],activeId:id};
}
export function closeGraph(state:GraphWorkspaceState,id:string):GraphWorkspaceState {
  const index=state.openIds.indexOf(id),openIds=state.openIds.filter(value=>value!==id);
  return {...state,openIds,activeId:state.activeId===id?(openIds[Math.min(index,openIds.length-1)]??null):state.activeId};
}
export function renameGraph(state:GraphWorkspaceState,id:string,name:string):GraphWorkspaceState {
  const target=requireGraph(state,id);assertWritable(target);name=name.trim();
  if(!name||name.length>200)throw new Error('Der Anzeigename muss 1 bis 200 Zeichen enthalten.');
  return {...state,graphs:state.graphs.map(graph=>graph.id===id?{...graph,name}:graph)};
}
export function updateGraph(state:GraphWorkspaceState,id:string,flow:Flow):GraphWorkspaceState {
  const graph=requireGraph(state,id);assertWritable(graph);
  if(flow.id!==id)throw new Error('Die Identität eines Graphen darf nicht geändert werden.');
  const revision=graph.revision+1;
  return {...state,graphs:state.graphs.map(item=>item.id===id?{...item,revision,flow:{...flow,version:revision}}:item)};
}
/** Every graph reference carries a stable graphId in configuration, never its display name. */
export function graphUsages(state:GraphWorkspaceState,id:string):WorkspaceGraph[] {
  return state.graphs.filter(graph=>graphReferences(graph.flow).includes(id));
}
export function deleteGraph(state:GraphWorkspaceState,id:string):GraphWorkspaceState {
  return deleteGraphs(state,[id]);
}
/** Delete a complete unit atomically; references within that unit are allowed. */
export function deleteGraphs(state:GraphWorkspaceState,ids:string[]):GraphWorkspaceState {
  const removing=new Set(ids);
  for(const id of ids)assertWritable(requireGraph(state,id));
  let grew=true;while(grew){grew=false;for(const graph of state.graphs)if((graph.ownerId&&removing.has(graph.ownerId)||graph.inlineOwner&&removing.has(graph.inlineOwner.graphId))&&!removing.has(graph.id)){removing.add(graph.id);grew=true;}}
  for(const id of removing)assertWritable(requireGraph(state,id));
  const usages=state.graphs.filter(graph=>!removing.has(graph.id)&&graphReferences(graph.flow).some(reference=>removing.has(reference)));
  if(usages.length)throw new Error(`Graph wird verwendet in: ${usages.map(graph=>graph.name).join(', ')}.`);
  for(const target of removing)state=closeGraph(state,target);
  return {...state,graphs:state.graphs.filter(graph=>!removing.has(graph.id)).map(graph=>graph.layout?.flowGroups?{...graph,layout:{...graph.layout,flowGroups:graph.layout.flowGroups.map(group=>({...group,graphIds:group.graphIds.filter(localId=>!state.graphs.some(g=>g.localId===localId&&removing.has(g.id)))}))}}:graph)};
}
export function workspaceSnapshot(state:GraphWorkspaceState):WorkspaceGraph[]{return structuredClone(state.graphs);}
function requireGraph(state:GraphWorkspaceState,id:string):WorkspaceGraph {
  const graph=state.graphs.find(graph=>graph.id===id);
  if(!graph)throw new Error('Graph ist im Workspace nicht vorhanden.');
  return graph;
}

/** The editor selects interactive execution conservatively for dynamically supplied callees. */
export function resolveWorkspaceModes(state:GraphWorkspaceState):GraphWorkspaceState {
  const needsBrowser=(id:string,seen:Set<string>):boolean=>{
    if(seen.has(id))return false;
    const graph=state.graphs.find(item=>item.id===id);if(!graph)return false;
    const path=new Set([...seen,id]);
    return graph.flow.nodes.some(node=>node.environment==='browser'||(node.graph&&isGraphControl(node.graph.operation))||(node.graph?.operation==='invoke'&&(!node.graph.graphId||(state.graphs.find(item=>item.id===node.graph!.graphId)?.flow.mode!=='hybrid'&&needsBrowser(node.graph.graphId,path)))));
  };
  return {...state,graphs:state.graphs.map(graph=>graph.readOnly?graph:({...graph,flow:{...graph.flow,mode:graph.flow.mode==='hybrid'?'hybrid':needsBrowser(graph.id,new Set())?'interactive':'backend'}}))};
}

export function updateLayout(state:GraphWorkspaceState,id:string,layout:EditorLayout):GraphWorkspaceState {if(requireGraph(state,id).readOnly)return state;return {...state,graphs:state.graphs.map(graph=>graph.id===id?{...graph,layout:structuredClone(layout)}:graph)};}

export interface WorkspaceGroup extends PersistedOrigin {displayName?:string;sortOrder?:number;id:string;name:string;parentId?:string;collapsed?:boolean}
export type WorkspaceTreeRow={key:string;kind:'group'|'graph';id:string;name:string;depth:number;expanded?:boolean;count?:number};
function requireGroup(state:GraphWorkspaceState,id:string):WorkspaceGroup {
  const group=state.groups?.find(item=>item.id===id);
  if(!group)throw new Error('Gruppe ist im Workspace nicht vorhanden.');
  return group;
}
export function groupPath(state:GraphWorkspaceState,id?:string):string {
  const names:string[]=[];const seen=new Set<string>();
  while(id){if(seen.has(id))throw new Error('Gruppen dürfen keinen Kreis bilden.');seen.add(id);const group=requireGroup(state,id);names.unshift(group.name);id=group.parentId;}
  return names.join(' / ');
}
export function addWorkspaceGroup(state:GraphWorkspaceState,id:string,parentId?:string):GraphWorkspaceState {
  if(!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)||state.groups?.some(group=>group.id===id))throw new Error('Gruppen-ID ist ungültig oder bereits vorhanden.');
  if(parentId)assertWritable(requireGroup(state,parentId));
  let index=1;while(state.groups?.some(group=>group.parentId===parentId&&group.name===`Gruppe${index}`))index++;
  return {...state,groups:[...(state.groups??[]),{id,name:`Gruppe${index}`,...(parentId?{parentId}:{})}]};
}
export function renameWorkspaceGroup(state:GraphWorkspaceState,id:string,name:string):GraphWorkspaceState {
  const group=requireGroup(state,id);assertWritable(group);name=name.trim();
  if(!/^[A-Za-z_][A-Za-z0-9_-]{0,99}$/.test(name))throw new Error('Ungültiger technischer Gruppenname. Erlaubt sind Buchstaben, Ziffern, Unterstrich und Bindestrich.');
  if(state.groups?.some(item=>item.id!==id&&item.parentId===group.parentId&&item.name===name))throw new Error('Dieser Gruppenname wird hier bereits verwendet.');
  return {...state,groups:state.groups!.map(item=>item.id===id?{...item,name}:item)};
}
export function moveWorkspaceGroup(state:GraphWorkspaceState,id:string,parentId?:string):GraphWorkspaceState {
  const group=requireGroup(state,id);assertWritable(group);if(parentId)assertWritable(requireGroup(state,parentId));let ancestor=parentId;
  while(ancestor){if(ancestor===id)throw new Error('Eine Gruppe kann nicht in sich selbst oder eine Untergruppe verschoben werden.');ancestor=requireGroup(state,ancestor).parentId;}
  if(state.groups!.some(item=>item.id!==id&&item.parentId===parentId&&item.name===group.name))throw new Error('Dieser Gruppenname wird im Ziel bereits verwendet.');
  return {...state,groups:state.groups!.map(item=>{if(item.id!==id)return item;const {parentId:_,...rest}=item;return {...rest,...(parentId?{parentId}:{})};})};
}
export function assignGraphGroup(state:GraphWorkspaceState,id:string,groupId?:string):GraphWorkspaceState {
  if(requireGraph(state,id).ownerId)throw new Error('Interne Flows gehören zu ihrem Hauptflow.');
  assertWritable(requireGraph(state,id));if(groupId)assertWritable(requireGroup(state,groupId));
  return {...state,graphs:state.graphs.map(graph=>{if(graph.id!==id)return graph;const {groupId:_,...rest}=graph;return {...rest,...(groupId?{groupId}:{})};})};
}
/** Removing a folder moves its immediate contents up one level; no graph is deleted. */
export function deleteWorkspaceGroup(state:GraphWorkspaceState,id:string,contents=false):GraphWorkspaceState {
  const group=requireGroup(state,id);assertWritable(group);
  if(contents){
    const removing=new Set([id]);let grew=true;while(grew){grew=false;for(const child of state.groups??[])if(child.parentId&&removing.has(child.parentId)&&!removing.has(child.id)){removing.add(child.id);grew=true;}}
    for(const groupId of removing)assertWritable(requireGroup(state,groupId));
    const next=deleteGraphs(state,state.graphs.filter(graph=>graph.groupId&&removing.has(graph.groupId)).map(graph=>graph.id));
    return {...next,groups:(next.groups??[]).filter(group=>!removing.has(group.id))};
  }

  const groups=(state.groups??[]).filter(item=>item.id!==id).map(item=>{if(item.parentId!==id)return item;const {parentId:_,...rest}=item;return {...rest,...(group.parentId?{parentId:group.parentId}:{})};});
  // Disambiguate folder names if moving them up would collide with existing siblings.
  const used=new Set<string>();
  for(const item of groups.filter(item=>state.groups!.find(original=>original.id===item.id)!.parentId!==id))used.add(`${item.parentId??''}\0${item.name}`);
  for(const item of groups.filter(item=>state.groups!.find(original=>original.id===item.id)!.parentId===id)){
    const original=item.name;let suffix=2;
    while(used.has(`${item.parentId??''}\0${item.name}`))item.name=`${original.slice(0,90)}_${suffix++}`;
    used.add(`${item.parentId??''}\0${item.name}`);
  }
  return {...state,groups,graphs:state.graphs.map(graph=>{if(graph.groupId!==id)return graph;const {groupId:_,...rest}=graph;return {...rest,...(group.parentId?{groupId:group.parentId}:{})};})};
}
export function setWorkspaceGroupCollapsed(state:GraphWorkspaceState,id:string,collapsed:boolean):GraphWorkspaceState {
  requireGroup(state,id);return {...state,groups:state.groups!.map(group=>group.id===id?{...group,collapsed}:group)};
}
export function revealGraphGroup(state:GraphWorkspaceState,id:string):GraphWorkspaceState {
  const graph=requireGraph(state,id);
  if(graph.ownerId)state={...state,graphs:state.graphs.map(item=>item.id===graph.ownerId?{...item,internalsCollapsed:false}:item)};
  let groupId=requireGraph(state,graph.ownerId??id).groupId;const ancestors=new Set<string>();
  while(groupId){if(ancestors.has(groupId))break;ancestors.add(groupId);groupId=requireGroup(state,groupId).parentId;}
  return {...state,...(state.groups?{groups:state.groups.map(group=>ancestors.has(group.id)?{...group,collapsed:false}:group)}:{})};
}
export function workspaceTree(state:GraphWorkspaceState,search='',includeCollapsed=false):WorkspaceTreeRow[] {
  const query=search.trim().toLocaleLowerCase(),rows:WorkspaceTreeRow[]=[];
  const sort=<T extends {name:string;id:string}>(items:T[])=>items.sort((a,b)=>a.name.localeCompare(b.name,'de',{numeric:true})||a.id.localeCompare(b.id));
  const children=new Map<string,WorkspaceGroup[]>(),graphs=new Map<string,WorkspaceGraph[]>();
  for(const group of state.groups??[]){const key=group.parentId??'';children.set(key,[...(children.get(key)??[]),group]);}
  for(const graph of state.graphs.filter(item=>!item.ownerId)){const key=graph.groupId??'';graphs.set(key,[...(graphs.get(key)??[]),graph]);}
  function visit(parent:string,depth:number,inheritedMatch:boolean):{rows:WorkspaceTreeRow[];count:number}{
    const result:WorkspaceTreeRow[]=[];let count=0;
    for(const group of sort(children.get(parent)??[])){
      const matches=inheritedMatch||!!query&&group.name.toLocaleLowerCase().includes(query);
      const nested=visit(group.id,depth+1,matches);count+=nested.count;
      if(!query||matches||nested.rows.length){
        const expanded=!!query||includeCollapsed||!group.collapsed;
        result.push({key:`group:${group.id}`,kind:'group',id:group.id,name:group.name,depth,expanded,count:nested.count});
        if(expanded)result.push(...nested.rows);
      }
    }
    for(const graph of sort(graphs.get(parent)??[])){
      count++;
      const internal=sort(state.graphs.filter(item=>item.ownerId===graph.id&&!item.inlineOwner));
      const matches=!query||inheritedMatch||graph.name.toLocaleLowerCase().includes(query);
      const visible=internal.filter(item=>matches||item.name.toLocaleLowerCase().includes(query));
      if(matches||visible.length){
        const expanded=!!query||includeCollapsed||!graph.internalsCollapsed;
        result.push({key:`graph:${graph.id}`,kind:'graph',id:graph.id,name:graph.name,depth,...(internal.length?{expanded,count:internal.length}:{})});
        if(expanded)for(const child of visible)result.push({key:`graph:${child.id}`,kind:'graph',id:child.id,name:child.name,depth:depth+1});
      }
    }
    return {rows:result,count};
  }
  rows.push(...visit('',0,false).rows);return rows;
}

function assertWritable(item:PersistedOrigin):void {if(item.readOnly)throw new Error('Geerbte Einträge sind schreibgeschützt.');}
