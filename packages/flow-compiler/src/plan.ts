import { ContractError } from '@adam-flow/flow-core';
import type { Catalog, CodecCatalog, Environment, Flow, FlowNode, NodeDefinition, PortAddress, TypeDocument, TypeRef } from '@adam-flow/flow-core';
import { requireBoundaries } from './index.js';

export interface PlannedNode extends FlowNode {
  dependencies: string[];
  inputs: NodeDefinition['inputs'];
  outputs: NodeDefinition['outputs'];
}
export interface PlannedConnection {
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
  nodes: PlannedNode[]; connections: PlannedConnection[]; segments: ExecutionSegment[];
}
export type Capabilities = { server: CodecCatalog; browser: CodecCatalog };

/** Validate before producing any executable artifact. Ready nodes retain source-document order. */
export function compileFlow(flow: Flow, catalog: Catalog, types: TypeDocument, capabilities: Capabilities): ExecutionPlan {
  const boundaries = new Set(requireBoundaries(flow, catalog, types, capabilities).map(edge => edge.connectionIndex));
  const definitions = new Map(catalog.nodes.map(node => [`${node.type}@${node.version}`, node]));
  const pending = new Map(flow.nodes.map(node => [node.id, node]));
  const completed = new Set<string>();
  const nodes: PlannedNode[] = [], segments: ExecutionSegment[] = [];
  while (pending.size) {
    const ready = [...pending.values()].filter(node => flow.connections.every(edge => edge.target.nodeId !== node.id || completed.has(edge.source.nodeId)));
    if (!ready.length) throw new ContractError([{code:'cycle',path:'/flow',message:'No schedulable node.'}]);
    // Prefer extending the current environment while a node there is ready.
    const previous = segments.at(-1);
    const node = ready.find(node => node.environment === previous?.environment) ?? ready[0]!;
    let segment = previous;
    if (!segment || segment.environment !== node.environment) {
      segment = {id:`segment-${segments.length}`,environment:node.environment,nodeIds:[],dependencies:[],incoming:[],outgoing:[]};
      segments.push(segment);
    }
    const definition = definitions.get(`${node.type}@${node.typeVersion}`)!;
    nodes.push({...node, dependencies:[...new Set(flow.connections.filter(edge => edge.target.nodeId === node.id).map(edge => edge.source.nodeId))],inputs:definition.inputs,outputs:definition.outputs});
    segment.nodeIds.push(node.id); completed.add(node.id); pending.delete(node.id);
  }
  const connections = flow.connections.map((edge,index): PlannedConnection => ({...edge,index,
    sourceType:nodes.find(node=>node.id===edge.source.nodeId)!.outputs[edge.source.port]!,
    targetType:nodes.find(node=>node.id===edge.target.nodeId)!.inputs[edge.target.port]!,boundary:boundaries.has(index)}));
  for (const edge of connections) {
    const source = segments.find(segment=>segment.nodeIds.includes(edge.source.nodeId))!;
    const target = segments.find(segment=>segment.nodeIds.includes(edge.target.nodeId))!;
    if(source===target) continue;
    source.outgoing.push(edge.index); target.incoming.push(edge.index);
    if(!target.dependencies.includes(source.id)) target.dependencies.push(source.id);
  }
  return JSON.parse(JSON.stringify({schemaVersion:1,flowId:flow.id,flowVersion:flow.version,mode:flow.mode,nodes,connections,segments})) as ExecutionPlan;
}

/** Only fixed host calls are emitted. Config, IDs and payloads never become source text. */
export function generateSegment(segment: ExecutionSegment): string {
  return "'use strict';\n" + segment.nodeIds.map((_,index)=>`host.invokeNode(${index});\n`).join('') + 'host.completeSegment();';
}
