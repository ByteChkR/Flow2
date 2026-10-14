import {flowDesignations} from '@adam-flow/core/flow-core/designations.js';
import type {Catalog,Environment,Flow,FlowInterface,FlowNode,FlowParameter,TypeDocument,TypeRef} from '@adam-flow/core/flow-core/model.js';
import {graphCatalog,graphInputPort,graphOutputPort,graphNodeType,graphNodeDefinition} from '@adam-flow/core/flow-core/graph-nodes.js';
import {valueNodeDefinition} from '@adam-flow/core/flow-core/value-nodes.js';
import {flowInterface} from '@adam-flow/core/flow-core/interface.js';
import {sameGraphSignature} from '@adam-flow/core/flow-core/graphs.js';
import {resolveDefinition} from '@adam-flow/core/flow-core/node-resolution.js';
import type {GraphWorkspaceState,WorkspaceGraph} from './graph-workspace.js';
import {updateGraph} from './graph-workspace.js';
import {graphReferences} from './graph-references.js';
import {emptyLayout} from './layout.js';

/** Editor ownership only. Execution continues to use ordinary graph references. */
export interface InlineGraphOwner {graphId:string;nodeId:string;port:string;referenceNodeId:string}
const uuid=()=>`node_${crypto.randomUUID()}`;
const edge=(from:string,output:string,to:string,input:string):Flow['connections'][number]=>({source:{nodeId:from,port:output},target:{nodeId:to,port:input}});
const control=(from:string,to:string):Flow['connections'][number]=>({...edge(from,'out',to,'in'),kind:'control'});
const base=(id:string,type:string,environment:Environment):FlowNode=>({id,type,typeVersion:1,environment,config:{}});
export function exactPortMatch(a:FlowParameter,b:FlowParameter):boolean {
  return a.name===b.name&&sameGraphSignature({inputs:[{...a,nodeId:'p'}],outputs:[],control:{input:false,output:false}},{inputs:[{...b,nodeId:'p'}],outputs:[],control:{input:false,output:false}});
}
export function graphInputSignature(flow:Flow,nodeId:string,port:string,catalog:Catalog,types?:TypeDocument):FlowInterface {
  const node=flow.nodes.find(item=>item.id===nodeId);
  if(!node)throw new Error('Die besitzende Node fehlt.');
  const definition=node.graph?graphNodeDefinition(node):node.value?valueNodeDefinition(node):resolveDefinition(graphCatalog(flow,catalog,types),node);
  let type:TypeRef|undefined=definition?.inputs[port];
  while(type?.kind==='optional'||type?.kind==='nullable')type=type.inner;
  if(type?.kind!=='graph')throw new Error('Dieser Eingang erwartet keinen Graphen.');
  return structuredClone(type.signature);
}
export function inlineAt(state:GraphWorkspaceState,graphId:string,nodeId:string,port:string):WorkspaceGraph|undefined {
  return state.graphs.find(graph=>graph.inlineOwner?.graphId===graphId&&graph.inlineOwner.nodeId===nodeId&&graph.inlineOwner.port===port);
}
export function inlineDescendants(state:GraphWorkspaceState,graphIds:Iterable<string>):Set<string> {
  const ids=new Set(graphIds);let changed=true;
  while(changed){changed=false;for(const graph of state.graphs)if(graph.inlineOwner&&ids.has(graph.inlineOwner.graphId)&&!ids.has(graph.id)){ids.add(graph.id);changed=true;}}
  return ids;
}
export function removeInlineUnit(state:GraphWorkspaceState,id:string):GraphWorkspaceState {
  const ids=inlineDescendants(state,[id]);
  const graphs=state.graphs.filter(graph=>!ids.has(graph.id));
  return {...state,graphs,openIds:state.openIds.filter(id=>!ids.has(id)),activeId:ids.has(state.activeId??'')?null:state.activeId};
}
/** Remove owned drafts only when their owning node/edge was removed. Never remove external flows. */
export function pruneInlineGraphs(state:GraphWorkspaceState,catalog?:Catalog,types?:TypeDocument):GraphWorkspaceState {
  let next=state;
  for(const graph of state.graphs){const owner=graph.inlineOwner;if(!owner)continue;
    const parent=next.graphs.find(item=>item.id===owner.graphId);
    let removedPort=false;
    if(parent&&catalog){
      try{const node=parent.flow.nodes.find(n=>n.id===owner.nodeId);let type=node?resolveDefinition(graphCatalog(parent.flow,catalog,types),node)?.inputs[owner.port]:undefined;while(type?.kind==='optional'||type?.kind==='nullable')type=type.inner;removedPort=type?.kind!=='graph';}catch{/* Keep ownership while the node itself is an incomplete draft. */}
    }
    if(removedPort||!parent||!parent.flow.nodes.some(node=>node.id===owner.nodeId)||!parent.flow.connections.some(e=>e.source.nodeId===owner.referenceNodeId&&e.source.port==='graph'&&e.target.nodeId===owner.nodeId&&e.target.port===owner.port)){
      next=removeInlineUnit(next,graph.id);
      if(parent){const flow={...parent.flow,nodes:parent.flow.nodes.filter(n=>n.id!==owner.referenceNodeId),connections:parent.flow.connections.filter(e=>e.source.nodeId!==owner.referenceNodeId&&e.target.nodeId!==owner.referenceNodeId)};next=updateGraph(next,parent.id,flow);}
    }
  }
  return next;
}

/** Strict name AND type mapping. No renaming, guessing by type, or Boolean inversion. */
export function scaffoldInlineGraph(id:string,signature:FlowInterface,environment:Environment,mode:Flow['mode'],target?:{flow:Flow;signature:FlowInterface}) {
  const start=base('start','Standard.Flow.Start',environment);
  const flow:Flow={schemaVersion:2,id,version:1,mode,control:{...signature.control},entryNodeId:start.id,nodes:[start],connections:[]};
  const layout=emptyLayout();layout.positions.start={x:40,y:40};
  const inputs=signature.inputs.map((p,index)=>{const node={...base(uuid(),'Standard.Flow.Input',environment),config:{name:p.name},value:{operation:'input' as const,type:structuredClone(p.type)}};flow.nodes.push(node);layout.positions[node.id]={x:40,y:280+index*440};return {...p,nodeId:node.id};});
  const outputs=signature.outputs.map((p,index)=>{const node={...base(uuid(),'Standard.Flow.Output',environment),config:{name:p.name},value:{operation:'output' as const,type:structuredClone(p.type)}};flow.nodes.push(node);layout.positions[node.id]={x:800,y:280+index*440};return {...p,nodeId:node.id};});
  let predecessor=start.id,call:FlowNode|undefined;
  if(target){
    // A pure graph call otherwise never runs when no returned value is consumed.
    // An always-true IfElse provides a control gate without making outputs optional using existing runtime semantics.
    const direct=target.signature.control.input&&target.signature.control.output;
    const callId=uuid();
    call={...base(callId,graphNodeType(callId,direct?'invoke':'ifElse'),environment),graph:{operation:direct?'invoke':'ifElse',signature:structuredClone(target.signature),...(direct?{graphId:target.flow.id}:{})},...(!direct?{inlineInputs:{condition:{enabled:true,value:true}}}:{})};
    flow.nodes.push(call);layout.positions[call.id]={x:420,y:280};
    if(!direct){const refId=uuid();flow.nodes.push({...base(refId,graphNodeType(refId,'reference'),environment),graph:{operation:'reference',graphId:target.flow.id,signature:structuredClone(target.signature)}});layout.positions[refId]={x:40,y:280+inputs.length*440};flow.connections.push(edge(refId,'graph',call.id,'then'),edge(refId,'graph',call.id,'else')); }
    flow.connections.push(control(start.id,call.id));predecessor=call.id;
    for(const parameter of target.signature.inputs){const source=inputs.find(input=>exactPortMatch(input,parameter));if(source)flow.connections.push(edge(source.nodeId,'value',call.id,graphInputPort(parameter)));}
  }
  for(const output of outputs){
    const result=target?.signature.outputs.find(parameter=>exactPortMatch(parameter,output));
    const source=inputs.find(parameter=>exactPortMatch(parameter,output));
    if(result&&call)flow.connections.push(edge(call.id,graphOutputPort(result),output.nodeId,'value'));
    else if(source)flow.connections.push(edge(source.nodeId,'value',output.nodeId,'value'));
    flow.connections.push(control(predecessor,output.nodeId));
  }
  return {flow,layout};
}
export function assertGraphTarget(state:GraphWorkspaceState,parentId:string,targetId:string):void {
 const parent=state.graphs.find(g=>g.id===parentId),target=state.graphs.find(g=>g.id===targetId);
 if(!parent||!target)throw new Error('Der ausgewählte Graph fehlt.');
 if(target.inlineOwner||target.ownerId&&target.ownerId!==(parent.ownerId??parent.id))throw new Error('Dieser Graph ist hier nicht verfügbar.');
 if(parent.flow.mode==='hybrid'&&target.flow.mode!=='hybrid')throw new Error('Hybrid-Graphen benötigen hybride Subgraphen.');
 const root=state.graphs.find(g=>g.id===(parent.ownerId??parent.id))!;
 const allowed=root.flow.designation?flowDesignations.get(root.flow.designation)?.environments:undefined;
 const visited=new Set<string>();
 const visit=(id:string)=>{
  if(id===parentId)throw new Error('Rekursive Graph-Aufrufe sind nicht erlaubt.');
  if(visited.has(id))return;visited.add(id);
  const graph=state.graphs.find(g=>g.id===id);if(!graph)return;
  if(allowed&&graph.flow.mode!=='hybrid'&&graph.flow.nodes.some(n=>!allowed.includes(n.environment)))throw new Error('Die Laufzeit des Graphen ist für diesen Hauptflow nicht erlaubt. Ein Wrapper kann dies nicht ändern.');
  graphReferences(graph.flow).forEach(visit);
 };visit(targetId);
}
export function createInlineGraph(state:GraphWorkspaceState,parentId:string,nodeId:string,port:string,catalog:Catalog,types?:TypeDocument,targetId?:string):GraphWorkspaceState {
  const parent=state.graphs.find(g=>g.id===parentId),node=parent?.flow.nodes.find(n=>n.id===nodeId);
  if(!parent||!node||parent.readOnly)throw new Error('Der Besitzer fehlt oder ist schreibgeschützt.');
  if(inlineAt(state,parentId,nodeId,port))throw new Error('Dieser Eingang besitzt bereits einen Inline-Graphen.');
  const signature=graphInputSignature(parent.flow,nodeId,port,catalog,types);
  const target=targetId?state.graphs.find(g=>g.id===targetId):undefined;
  if(targetId&&!target)throw new Error('Der ausgewählte Graph fehlt.');
  if(target)assertGraphTarget(state,parentId,target.id);
  const localId=crypto.randomUUID(),ownerId=parent.ownerId??parent.id,id=`${ownerId}_internal_${localId}`,referenceNodeId=uuid();
  const prepared=scaffoldInlineGraph(id,signature,node.environment,parent.flow.mode,target?{flow:target.flow,signature:flowInterface(target.flow,catalog)}:undefined);
  const child:WorkspaceGraph={id,localId,ownerId,inlineOwner:{graphId:parentId,nodeId,port,referenceNodeId},name:`${node.graph?.operation??node.type} · ${port}`,technicalName:`Inline_${localId.replaceAll('-','')}`,description:'',revision:1,...prepared};
  const reference:FlowNode={...base(referenceNodeId,graphNodeType(referenceNodeId,'reference'),node.environment),graph:{operation:'reference',graphId:id,signature:flowInterface(child.flow,catalog)}};
  const flow={...parent.flow,nodes:[...parent.flow.nodes,reference],connections:[...parent.flow.connections.filter(e=>!(e.target.nodeId===nodeId&&e.target.port===port)),edge(referenceNodeId,'graph',nodeId,port)]};
  const next=updateGraph(state,parentId,flow);return {...next,graphs:[...next.graphs,child]};
}

/** Synchronize owned interfaces after editing their parent's contract. Interior work is retained. */
export function synchronizeInlineInterfaces(state:GraphWorkspaceState,parentId:string,catalog:Catalog,types?:TypeDocument):GraphWorkspaceState {
 let next=state;
 for(const child of state.graphs.filter(g=>g.inlineOwner?.graphId===parentId)){
  const parent=next.graphs.find(g=>g.id===parentId)!,attachment=child.inlineOwner!;
  const expected=graphInputSignature(parent.flow,attachment.nodeId,attachment.port,catalog,types),actual=flowInterface(child.flow,catalog);
  if(sameGraphSignature(expected,actual))continue;
  const flow=structuredClone(child.flow),layout=structuredClone(child.layout??emptyLayout());
  const removed=new Set<string>();
  const outputs=new Set(actual.outputs.map(p=>p.nodeId));
  let gates=[...new Set(flow.connections.filter(e=>e.kind==='control'&&outputs.has(e.target.nodeId)).map(e=>e.source.nodeId))];
  if(!gates.length){const definitions=graphCatalog(flow,catalog,types);gates=flow.nodes.filter(n=>resolveDefinition(definitions,n)?.control?.output&&!flow.connections.some(e=>e.kind==='control'&&e.source.nodeId===n.id)).map(n=>n.id);}
  if(!gates.length)gates=[flow.entryNodeId??'start'];
  for(const direction of ['inputs','outputs'] as const){
   for(const old of actual[direction])if(!expected[direction].some(p=>exactPortMatch(old,p)))removed.add(old.nodeId);
   for(const [index,p] of expected[direction].entries()){
    if(actual[direction].some(old=>exactPortMatch(old,p)))continue;
    const id=uuid(),input=direction==='inputs',environment=parent.flow.nodes.find(n=>n.id===attachment.nodeId)!.environment;
    flow.nodes.push({...base(id,input?'Standard.Flow.Input':'Standard.Flow.Output',environment),config:{name:p.name},value:{operation:input?'input':'output',type:structuredClone(p.type)}});
    layout.positions[id]={x:input?40:800,y:280+index*440};
    if(!input)for(const gate of gates)flow.connections.push(control(gate,id));
   }
  }
  flow.nodes=flow.nodes.filter(n=>!removed.has(n.id));
  flow.connections=flow.connections.filter(e=>!removed.has(e.source.nodeId)&&!removed.has(e.target.nodeId));
  for(const id of removed)delete layout.positions[id];
  flow.control={...expected.control};
  next=updateGraph(next,child.id,flow);
  next={...next,graphs:next.graphs.map(g=>g.id===child.id?{...g,layout}:g)};
  const signature=flowInterface(flow,catalog);
  next=updateGraph(next,parentId,{...parent.flow,nodes:parent.flow.nodes.map(n=>n.id===attachment.referenceNodeId?{...n,graph:{...n.graph!,signature}}:n)});
 }
 return next;
}
