import {resolveDefinition} from '../flow-core/node-resolution.js';
import { ContractError,activeNodes,flowInterface } from '../flow-core/index.js';
import type { Catalog, CodecCatalog, Environment, Flow, FlowNode, FlowInterface, NodeDefinition, PortAddress, TypeDocument, TypeRef } from '../flow-core/index.js';
import { requireBoundaries } from './index.js';

export interface PlannedNode extends FlowNode {
  dependencies: string[];
  control?:NodeDefinition['control'];
  flowPort?:NodeDefinition['flowPort'];
  inputs: NodeDefinition['inputs'];
  outputs: NodeDefinition['outputs'];
}
export interface PlannedConnection {
  kind?:'data'|'control';
  index: number; source: PortAddress; target: PortAddress;
  sourceType: TypeRef; targetType: TypeRef;
  codec?: { typeId: string; version: number };
  boundary: boolean;
}
export interface ExecutionSegment {
  id: string; environment: Environment; nodeIds: string[];
  dependencies: string[]; incoming: number[]; outgoing: number[];
}
export interface ExecutionPlan {
  schemaVersion: 1; flowId: string; flowVersion: number; mode: Flow['mode'];
  skippedNodeIds:string[];
  interface:FlowInterface;
  nodes: PlannedNode[]; connections: PlannedConnection[]; segments: ExecutionSegment[];
}
export type Capabilities = { server: CodecCatalog; browser: CodecCatalog };

/** Validate before producing any executable artifact. Ready nodes retain source-document order. */
export function compileFlow(flow: Flow, catalog: Catalog, types: TypeDocument, capabilities: Capabilities): ExecutionPlan {
  const boundaries = new Set(requireBoundaries(flow, catalog, types, capabilities).map(edge => edge.connectionIndex));
  const definitions = new Map(catalog.nodes.map(node => [`${node.type}@${node.version}`, node]));
  const active=activeNodes(flow,catalog);
  const start=flow.nodes.find(node=>resolveDefinition(catalog,node)?.control?.start)!;
  const pending = new Map(flow.nodes.filter(node=>active.has(node.id)).map(node => [node.id, node]));
  const completed = new Set<string>();
  const nodes: PlannedNode[] = [], segments: ExecutionSegment[] = [];
  const dependencies=(id:string)=>[...new Set([
    ...flow.connections.filter(edge=>edge.target.nodeId===id).map(edge=>edge.source.nodeId),
    ...(id===start.id?[]:[start.id])])];
  while(pending.size) {
    const node=[...pending.values()].find(node=>dependencies(node.id).every(id=>completed.has(id)));
    if(!node)throw new ContractError([{code:'cycle',path:'/flow',message:'No schedulable node.'}]);
    const definition=resolveDefinition(catalog,node)!;
    nodes.push({...node,dependencies:dependencies(node.id),inputs:definition.inputs,outputs:definition.outputs,...(definition.flowPort?{flowPort:definition.flowPort}:{}),...(definition.control?{control:definition.control}:{})});
    completed.add(node.id);pending.delete(node.id);
  }
  // Keep original connection indexes stable for wire envelopes and diagnostics.
  const connections=flow.connections.map((edge,index):PlannedConnection=>{
    const source=flow.nodes.find(node=>node.id===edge.source.nodeId)!;
    const target=flow.nodes.find(node=>node.id===edge.target.nodeId)!;
    return {...edge,index,sourceType:edge.kind==='control'?{kind:'null'}:resolveDefinition(catalog,source)!.outputs[edge.source.port]!,
      targetType:edge.kind==='control'?{kind:'null'}:resolveDefinition(catalog,target)!.inputs[edge.target.port]!,boundary:boundaries.has(index)};
  });
  // Mirror the server: merge only linear chains, never forks/joins or graph calls.
  const effective=new Map(nodes.map(node=>[node.id,node.dependencies.some(id=>id!==start.id)?node.dependencies.filter(id=>id!==start.id):node.dependencies]));
  const successors=new Map(nodes.map(node=>[node.id,0]));
  for(const dependencies of effective.values())for(const id of dependencies)successors.set(id,successors.get(id)!+1);
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const owner=new Map<string,ExecutionSegment>();
  for(const node of nodes){
    const dependencies=effective.get(node.id)!;
    let segment:ExecutionSegment;
    const previous=dependencies.length===1?dependencies[0]:undefined;
    if(previous!==undefined&&successors.get(previous)===1&&!node.graph&&!byId.get(previous)!.graph&&owner.get(previous)!.environment===node.environment&&owner.get(previous)!.nodeIds.length<256){
      segment=owner.get(previous)!;segment.nodeIds.push(node.id);
    }else {segment={id:`segment-${segments.length}`,environment:node.environment,nodeIds:[node.id],dependencies:[],incoming:[],outgoing:[]};segments.push(segment);}
    owner.set(node.id,segment);
  }
  for(const segment of segments)
    segment.dependencies=[...new Set(segment.nodeIds.flatMap(id=>byId.get(id)!.dependencies).map(id=>owner.get(id)!.id))].filter(id=>id!==segment.id);
  for(const edge of connections) {
    const source=segments.find(segment=>segment.nodeIds.includes(edge.source.nodeId));
    const target=segments.find(segment=>segment.nodeIds.includes(edge.target.nodeId));
    if(!source||!target||source===target)continue;
    source.outgoing.push(edge.index);target.incoming.push(edge.index);
  }
  const skippedNodeIds=flow.nodes.filter(node=>!active.has(node.id)).map(node=>node.id);
  return JSON.parse(JSON.stringify({schemaVersion:1,flowId:flow.id,flowVersion:flow.version,mode:flow.mode,nodes,connections,segments,skippedNodeIds,interface:flowInterface(flow,catalog)})) as ExecutionPlan;
}

/** Only fixed host calls are emitted. Config, IDs and payloads never become source text. */
export function generateSegment(segment: ExecutionSegment): string {
  return "'use strict';\n" + segment.nodeIds.map((_,index)=>`host.invokeNode(${index});\n`).join('') + 'host.completeSegment();';
}
