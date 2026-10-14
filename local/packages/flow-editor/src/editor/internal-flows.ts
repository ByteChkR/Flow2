import {inlineDescendants} from './inline-graphs.js';
import {validateGroups,remapInternalGroups} from './internal-groups.js';
import type {GraphWorkspaceState,WorkspaceGraph} from './graph-workspace.js';
import {addGraph} from './graph-workspace.js';
import {graphReferences,mapReferences} from './graph-references.js';

export function canReferenceGraph(state:GraphWorkspaceState,caller:string,target:string):boolean {
  const source=state.graphs.find(graph=>graph.id===caller),destination=state.graphs.find(graph=>graph.id===target);
  return !!source&&!!destination&&(!destination.ownerId||destination.ownerId===(source.ownerId??source.id));
}
export function visibleGraphs(state:GraphWorkspaceState,caller:string):WorkspaceGraph[] {
  return state.graphs.filter(graph=>!graph.inlineOwner&&canReferenceGraph(state,caller,graph.id));
}
export function validateInternalFlows(state:GraphWorkspaceState,checkInvocationCycles=true):void {
  const localIds=new Set<string>(),names=new Set<string>(),slots=new Set<string>();
  for(const graph of state.graphs){
    if(graph.layout?.flowGroups){if(graph.ownerId)throw new Error('Untergraph-Gruppen gehören zum Hauptflow.');validateGroups(graph.layout.flowGroups,state.graphs.filter(g=>g.ownerId===graph.id&&!g.inlineOwner).map(g=>g.localId!));}
    if(graph.ownerId){
      const owner=state.graphs.find(item=>item.id===graph.ownerId);
      if(!owner||owner.ownerId||!graph.localId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(graph.localId))throw new Error('Ungültiger Besitzer oder lokale ID des internen Flows.');
      if(graph.groupId||graph.flow.designation)throw new Error('Interne Flows haben keine eigene Gruppe oder Prozesskennzeichnung.');
      const key=`${graph.ownerId}/${graph.localId}`,name=`${graph.ownerId}/${graph.technicalName??graph.name}`;
      if(localIds.has(key)||names.has(name))throw new Error('Doppelter interner Flow.');localIds.add(key);names.add(name);
    }
    if(graph.inlineOwner){
      const attachment=graph.inlineOwner;
      if(!graph.ownerId||!attachment||typeof attachment.graphId!=='string'||typeof attachment.nodeId!=='string'||typeof attachment.port!=='string'||typeof attachment.referenceNodeId!=='string')throw new Error('Ungültiger Inline-Besitzer.');
      const parent=state.graphs.find(item=>item.id===attachment.graphId);
      if(!parent||(parent.ownerId??parent.id)!==graph.ownerId||!parent.flow.nodes.some(node=>node.id===attachment.nodeId))throw new Error('Inline-Besitzer fehlt oder liegt in einem anderen Hauptflow.');
      const key=JSON.stringify([attachment.graphId,attachment.nodeId,attachment.port]);
      if(slots.has(key))throw new Error('Ein Graph-Eingang darf nur einen Inline-Graphen besitzen.');slots.add(key);
      const reference=parent.flow.nodes.find(node=>node.id===attachment.referenceNodeId);
      const edges=parent.flow.connections.filter(edge=>edge.source.nodeId===attachment.referenceNodeId);
      if(reference?.graph?.operation!=='reference'||reference.graph.graphId!==graph.id||edges.length!==1||edges[0]!.source.port!=='graph'||edges[0]!.target.nodeId!==attachment.nodeId||edges[0]!.target.port!==attachment.port||edges[0]!.kind==='control')throw new Error('Inline-Referenz gehört nicht exklusiv zu ihrem Eingang.');
      const seen=new Set([graph.id]);let ancestor:WorkspaceGraph|undefined=parent;
      while(ancestor){if(seen.has(ancestor.id))throw new Error('Rekursiver Inline-Besitz.');seen.add(ancestor.id);ancestor=ancestor.inlineOwner?state.graphs.find(item=>item.id===ancestor!.inlineOwner!.graphId):undefined;}
    }
    for(const reference of graphReferences(graph.flow)){
      const target=state.graphs.find(item=>item.id===reference);
      if(target?.inlineOwner&&graph.flow.nodes.some(node=>graphReferences({...graph.flow,nodes:[node],connections:[]}).includes(reference)&&(graph.id!==target.inlineOwner!.graphId||node.id!==target.inlineOwner!.referenceNodeId)))throw new Error('Inline-Graphen dürfen nur am besitzenden Eingang verwendet werden.');
      if(target?.ownerId&&!canReferenceGraph(state,graph.id,reference))throw new Error('Interne Flows dürfen nur innerhalb ihres Hauptflows verwendet werden.');
    }
  }
  if(!checkInvocationCycles)return;
  const visited=new Set<string>(),active=new Set<string>();
  const visit=(id:string)=>{if(active.has(id))throw new Error('Rekursiver Flow-Aufruf ist nicht erlaubt.');if(visited.has(id))return;const graph=state.graphs.find(g=>g.id===id);if(!graph)return;visited.add(id);active.add(id);graphReferences(graph.flow).forEach(visit);active.delete(id);};
  for(const graph of state.graphs.filter(g=>g.ownerId))visit(graph.id);

}
export function addInternalGraph(state:GraphWorkspaceState,ownerId:string):GraphWorkspaceState {
  const selected=state.graphs.find(item=>item.id===ownerId);
  const owner=state.graphs.find(item=>item.id===(selected?.ownerId??ownerId));
  if(!owner||owner.readOnly)throw new Error('Hauptflow fehlt oder ist schreibgeschützt.');
  const localId=crypto.randomUUID(),id=`${owner.id}_internal_${localId}`;
  const next=addGraph(state,id);
  return {...next,graphs:next.graphs.map(graph=>graph.id===id?{...graph,ownerId:owner.id,localId}:graph.id===owner.id?{...graph,internalsCollapsed:false}:graph)};
}

/** Copies an embedded unit, retaining external global dependencies and remapping all owned identities. */
export function cloneFlowUnit(state:GraphWorkspaceState,source:WorkspaceGraph,targetOwnerId?:string):GraphWorkspaceState {
  const owner=targetOwnerId?state.graphs.find(item=>item.id===targetOwnerId):undefined;
  if(targetOwnerId&&(!owner||owner.ownerId||owner.readOnly))throw new Error('Ungültiger Ziel-Hauptflow.');
  const members=new Map<string,WorkspaceGraph>([[source.id,source]]);
  // A global source carries all its internal definitions, including unused drafts.
  if(!source.ownerId)for(const child of state.graphs.filter(item=>item.ownerId===source.id))members.set(child.id,child);
  const visit=(graph:WorkspaceGraph)=>{for(const reference of graphReferences(graph.flow)){
    const child=state.graphs.find(item=>item.id===reference);
    if(child?.ownerId&&child.ownerId===(source.ownerId??source.id)&&!members.has(child.id)){members.set(child.id,child);visit(child);}
  }};
  for(const member of members.values())visit(member);
  const rootId=owner?`${owner.id}_internal_${crypto.randomUUID()}`:`graph_${crypto.randomUUID()}`;
  const targetOwner=owner?.id??rootId;
  const ids=new Map([...members.keys()].map(id=>[id,id===source.id?rootId:`${targetOwner}_internal_${crypto.randomUUID()}`]));
  const localIds=new Map([...members.values()].filter(g=>g.localId).map(g=>[g.localId!,ids.get(g.id)!.slice(-36)]));
  const used=new Set(state.graphs.filter(item=>owner?item.ownerId===owner.id:!item.ownerId&&!item.groupId).map(item=>item.technicalName??item.name));
  const internalNames=new Set(state.graphs.filter(item=>item.ownerId===targetOwner).map(item=>item.technicalName??item.name));
  const graphs=[...members.values()].map(member=>{
    const id=ids.get(member.id)!,embedded=!!owner||member.id!==source.id;
    const flow=mapReferences(member.flow,reference=>ids.get(reference)??reference,reference=>ids.has(reference)?1:state.graphs.find(graph=>graph.id===reference)?.revision??1);flow.id=id;flow.version=1;
    if(embedded)delete flow.designation;
    const taken=embedded?internalNames:used;
    const base=(member.technicalName??member.name).slice(0,90);let name=base,index=2;while(taken.has(name))name=`${base}_${index++}`;taken.add(name);
    return {id,name:member.name,technicalName:name,description:member.description??'',revision:1,flow,...(member.layout?{layout:embedded?(({flowGroups,...rest})=>rest)(structuredClone(member.layout)):remapInternalGroups(member.layout,localIds)!}:{}),...(embedded?{ownerId:targetOwner,localId:id.slice(-36)}:{}),...(member.inlineOwner&&ids.has(member.inlineOwner.graphId)?{inlineOwner:{...member.inlineOwner,graphId:ids.get(member.inlineOwner.graphId)!}}:{})};
  });
  const result={...state,graphs:[...state.graphs,...graphs],openIds:[...state.openIds,rootId],activeId:rootId};
  validateInternalFlows(result);return result;
}

export function promoteInternalGraph(state:GraphWorkspaceState,id:string):GraphWorkspaceState {
  const source=state.graphs.find(graph=>graph.id===id);
  if(!source?.ownerId||source.readOnly||source.inlineOwner)throw new Error('Kein bearbeitbarer interner Flow.');
  const copied=cloneFlowUnit(state,source),replacement=copied.activeId!;
  const removing=inlineDescendants(state,[id]);
  let result={...copied,openIds:copied.openIds.filter(item=>!removing.has(item)),graphs:copied.graphs.filter(item=>!removing.has(item.id)).map(graph=>({...graph,flow:mapReferences(graph.flow,reference=>reference===id?replacement:reference)}))};
  result={...result,graphs:result.graphs.map(graph=>graph.layout?.flowGroups?{...graph,layout:{...graph.layout,flowGroups:graph.layout.flowGroups.map(group=>({...group,graphIds:group.graphIds.filter(local=>local!==source.localId)}))}}:graph)};
  validateInternalFlows(result);return result;
}
