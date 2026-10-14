import {emptyLayout} from './layout.js';
import type {GraphWorkspaceState,WorkspaceGraph} from './graph-workspace.js';
import {graphReferences,mapReferences} from './graph-references.js';
import {decodeWorkspace} from './workspace-storage.js';
import type {Flow} from '@adam-flow/core/flow-core/model.js';
import {parseContract,graphNodeType} from '@adam-flow/core/flow-core/index.js';
import {queryNodeType} from '@adam-flow/core/flow-core/query-nodes.js';
import {valueNodeType} from '@adam-flow/core/flow-core/value-nodes.js';
import {generalValueNodeType} from '@adam-flow/core/flow-core/general-value-nodes.js';
import type {Point} from './model.js';
// Shared by all editor instances, including graph tabs that are unmounted on switching.
let localClipboard='';
export function rememberNodes(text:string){localClipboard=text;}
export function rememberedNodes(){return localClipboard;}
export const nodeClipboardMime='application/x-adam-flow2-nodes';
export interface NodeClipboard {inlineGraphs?:WorkspaceGraph[];kind:'adam-flow2-nodes';version:1;flow:Flow;positions:Record<string,Point>}
export function copyNodes(flow:Flow,positions:Record<string,Point>,ids:readonly string[],graphs:WorkspaceGraph[]=[]):NodeClipboard {
  const selected=new Set(ids),members=new Set<string>();
  let grew=true;while(grew){grew=false;for(const graph of graphs)if(graph.inlineOwner&&!members.has(graph.id)&&(graph.inlineOwner.graphId===flow.id&&selected.has(graph.inlineOwner.nodeId)||members.has(graph.inlineOwner.graphId))){members.add(graph.id);grew=true;if(graph.inlineOwner.graphId===flow.id)selected.add(graph.inlineOwner.referenceNodeId);}}
  // Keep private dependencies portable when the owning node moves to another root.
  const owner=graphs.find(g=>g.id===flow.id),rootId=owner?.ownerId??flow.id;
  grew=true;while(grew){grew=false;for(const member of graphs.filter(g=>members.has(g.id))){
    for(const reference of graphReferences(member.flow)){const target=graphs.find(g=>g.id===reference);if(target?.ownerId===rootId&&!members.has(target.id)){members.add(target.id);grew=true;}}
    for(const child of graphs)if(child.inlineOwner?.graphId===member.id&&!members.has(child.id)){members.add(child.id);grew=true;}
  }}
  const nodes=flow.nodes.filter(node=>selected.has(node.id));
  const inlineGraphs=graphs.filter(g=>members.has(g.id)).map(g=>({id:g.id,name:g.name,technicalName:g.technicalName??g.name,revision:g.revision,flow:g.flow,layout:g.layout??emptyLayout(),ownerId:'clipboard',localId:g.localId!,...(g.inlineOwner?{inlineOwner:{...g.inlineOwner,graphId:g.inlineOwner.graphId===flow.id?'clipboard':g.inlineOwner.graphId}}:{})}));
  return structuredClone({...(inlineGraphs.length?{inlineGraphs}:{}),kind:'adam-flow2-nodes',version:1,flow:{schemaVersion:2,id:'clipboard',version:1,mode:flow.mode,nodes,connections:flow.connections.filter(edge=>selected.has(edge.source.nodeId)&&selected.has(edge.target.nodeId))},positions:Object.fromEntries(nodes.map(node=>[node.id,positions[node.id]??{x:0,y:0}]))});
}
export function readNodes(text:string):NodeClipboard|null {
  let data;try{data=JSON.parse(text);}catch{return null;}
  if(data?.kind==='adam-flow2-expression-nodes')throw new Error('LINQ-Nodes können nicht in den Flow-Editor eingefügt werden.');
  if(data?.kind!=='adam-flow2-nodes')return null;
  if(data.version!==1)throw new Error('Unbekannte Version der Node-Zwischenablage.');
  const flow=parseContract('flow',JSON.stringify(data.flow));
  const ids=new Set(flow.nodes.map(node=>node.id));
  if(!ids.size||ids.size!==flow.nodes.length||flow.connections.some(edge=>!ids.has(edge.source.nodeId)||!ids.has(edge.target.nodeId)))throw new Error('Ungültige Nodes oder Verbindungen in der Zwischenablage.');
  const positions=Object.fromEntries(flow.nodes.map(node=>{
    const point=data.positions?.[node.id];
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error('Ungültige Node-Position in der Zwischenablage.');
    return [node.id,{x:point.x,y:point.y}];
  }));
  if(data.inlineGraphs!==undefined){
    if(!Array.isArray(data.inlineGraphs)||data.inlineGraphs.some((graph:WorkspaceGraph)=>!graph||graph.ownerId!=='clipboard'))throw new Error('Ungültige Inline-Graphen in der Zwischenablage.');
    decodeWorkspace(JSON.stringify({version:2,workspace:{graphs:[{id:'clipboard',name:'Clipboard',revision:1,flow},...data.inlineGraphs],openIds:[],activeId:null}}));
  }
  return {kind:'adam-flow2-nodes',version:1,flow,positions,...(data.inlineGraphs?{inlineGraphs:data.inlineGraphs}:{})};
}
/** Only selected edges are copied. Owned graph references are remapped by pasteInlineGraphs atomically. */
export function pasteNodes(target:Flow,positions:Record<string,Point>,clipboard:NodeClipboard,point:Point,idFactory=()=>`node_${crypto.randomUUID()}`){
  const fragment=structuredClone(clipboard),used=new Set(target.nodes.map(node=>node.id)),ids=new Map<string,string>();
  for(const node of fragment.flow.nodes){const id=idFactory();if(used.has(id))throw new Error('Doppelte Node-ID.');used.add(id);ids.set(node.id,id);}
  const minX=Math.min(...Object.values(fragment.positions).map(p=>p.x)),minY=Math.min(...Object.values(fragment.positions).map(p=>p.y));
  const added=fragment.flow.nodes.map(node=>{
    const id=ids.get(node.id)!;
    const type=node.graph?graphNodeType(id,node.graph.operation):node.query?queryNodeType(id,node.query.operation):node.value?node.value.operation==='coalesce'?valueNodeType(id):generalValueNodeType(id,node.value.operation):node.type;
    return {...node,id,type};
  });
  return {flow:{...target,nodes:[...target.nodes,...added],connections:[...target.connections,...fragment.flow.connections.map(edge=>({...edge,source:{...edge.source,nodeId:ids.get(edge.source.nodeId)!},target:{...edge.target,nodeId:ids.get(edge.target.nodeId)!}}))]},positions:{...positions,...Object.fromEntries([...ids].map(([old,id])=>[id,{x:point.x+fragment.positions[old]!.x-minX,y:point.y+fragment.positions[old]!.y-minY}]))},ids:[...ids.values()],nodeIdMap:ids};
}

/** Paste the attachment tree as part of the same workspace mutation as its owning nodes. */
export function pasteInlineGraphs(state:GraphWorkspaceState,targetId:string,pasted:ReturnType<typeof pasteNodes>,clipboard:NodeClipboard):GraphWorkspaceState {
 const target=state.graphs.find(g=>g.id===targetId);if(!target||target.readOnly)throw new Error('Der Zielgraph fehlt oder ist schreibgeschützt.');
 const ownerId=target.ownerId??targetId,ids=new Map((clipboard.inlineGraphs??[]).map(g=>[g.id,`${ownerId}_internal_${crypto.randomUUID()}`]));
 const map=(flow:Flow)=>mapReferences(flow,id=>ids.get(id)??id);
 const added=(clipboard.inlineGraphs??[]).map(source=>{
  const id=ids.get(source.id)!,attachment=source.inlineOwner,isRoot=attachment?.graphId==='clipboard';
  const flow=map(source.flow);flow.id=id;flow.version=1;
  return {id,ownerId,localId:id.slice(-36),technicalName:`Inline_${id.slice(-36).replaceAll('-','')}`,name:source.name,revision:1,flow,layout:structuredClone(source.layout??emptyLayout()),...(attachment?{inlineOwner:{...attachment,graphId:isRoot?targetId:ids.get(attachment.graphId)!,nodeId:isRoot?pasted.nodeIdMap.get(attachment.nodeId)!:attachment.nodeId,referenceNodeId:isRoot?pasted.nodeIdMap.get(attachment.referenceNodeId)!:attachment.referenceNodeId}}:{})};
 });
 const revision=target.revision+1;
 return {...state,graphs:[...state.graphs.map(g=>g.id===targetId?{...g,revision,flow:{...map(pasted.flow),version:revision},layout:{...g.layout!,positions:pasted.positions}}:g),...added]};
}
