import type { NodeTrace } from './trace.js';
import { canonicalJson } from '@adam-flow/flow-core';
import type { Catalog, Flow, TypeDocument } from '@adam-flow/flow-core';
import { compileFlow, generateSegment } from '@adam-flow/flow-compiler';
import type { Capabilities, ExecutionPlan } from '@adam-flow/flow-compiler';
import { BrowserNodeRegistry } from './index.js';
import { BrowserCodecRegistry } from './codecs.js';

export class SegmentExecutionError extends Error {
  constructor(public readonly executionId: string, public readonly nodeId: string | null,
    public readonly code: 'failed' | 'cancelled', cause: unknown) {
    super(`Execution ${executionId}, node ${nodeId ?? '<segment>'}: ${cause instanceof Error ? cause.message : String(cause)}`, {cause});
  }
}
export interface SegmentOutput { executionId: string; segmentId: string; wires: Record<string, string>; generatedJavaScript: string }

/** Execution-local storage preserves native values across separate browser segments. */
export class BrowserExecution {
  private readonly compiledPlan: ExecutionPlan;
  get plan(): ExecutionPlan { return structuredClone(this.compiledPlan); }
  private readonly values = new Map<string, Record<string, unknown>>();
  private readonly done = new Set<string>();
  private failed = false;
  constructor(readonly executionId: string, flow: Flow, catalog: Catalog, types: TypeDocument,
    capabilities: Capabilities, private readonly nodes: BrowserNodeRegistry, private readonly codecs: BrowserCodecRegistry) {
    this.compiledPlan = compileFlow(flow, catalog, types, {...capabilities,browser:codecs.catalog});
    // Server declarations may be remote; every browser implementation must match the local allowlist.
    for(const node of this.compiledPlan.nodes.filter(node=>node.environment==='browser')) {
      const local = nodes.catalog.nodes.find(def=>def.type===node.type && def.version===node.typeVersion);
      if(!local || canonicalJson(local.inputs)!==canonicalJson(node.inputs) || canonicalJson(local.outputs)!==canonicalJson(node.outputs)) throw new Error(`Unregistered browser node ${node.id}.`);
    }
  }
  execute(segmentId: string, wires: Record<string,string>, signal?: AbortSignal, onNode?: (event:NodeTrace)=>void): SegmentOutput {
    let currentNode: string | null = null;
    try {
      if(this.failed) throw new Error('Execution already failed or disposed.');
      const segment = this.compiledPlan.segments.find(segment=>segment.id===segmentId);
      if(!segment || segment.environment!=='browser' || this.done.has(segmentId)) throw new Error('Unknown, wrong-environment or repeated segment.');
      const expected = segment.incoming.filter(index=>this.compiledPlan.connections[index]!.boundary).map(String);
      if(Object.keys(wires).some(key=>!expected.includes(key)) || expected.some(key=>!Object.hasOwn(wires,key))) throw new Error('Boundary inputs do not match the plan.');
      const decoded = new Map<number,unknown>();
      for(const index of segment.incoming) {
        const edge = this.compiledPlan.connections[index]!;
        currentNode = edge.target.nodeId;
        if(edge.boundary) decoded.set(index,this.codecs.decode(edge.codec!,wires[String(index)]!,edge.targetType));
        else if(!this.values.has(edge.source.nodeId)) throw new Error('Local dependency has not executed.');
      }
      let next = 0, complete = false;
      const host = Object.freeze({
        invokeNode:(index:number) => {
          if(index!==next++) throw new Error('Invalid invocation order.');
          const node = this.compiledPlan.nodes.find(node=>node.id===segment.nodeIds[index])!;
          currentNode = node.id;
          if(signal?.aborted) throw new Error('Execution cancelled.');
          const inputs: Record<string,unknown> = Object.create(null);
          for(const edge of this.compiledPlan.connections.filter(edge=>edge.target.nodeId===node.id)) {
            if(edge.boundary) inputs[edge.target.port] = decoded.get(edge.index);
            else {
              const source=this.values.get(edge.source.nodeId);
              if(!source) throw new Error('Local dependency has not executed.');
              if(Object.hasOwn(source,edge.source.port)) inputs[edge.target.port]=source[edge.source.port];
            }
          }
          const started=performance.now();
          onNode?.({nodeId:node.id,status:'running'});
          try {
            this.values.set(node.id,this.nodes.execute({nodeId:node.id,type:node.type,typeVersion:node.typeVersion,environment:'browser',inputs,config:node.config}));
            onNode?.({nodeId:node.id,status:'completed',durationMs:performance.now()-started});
          } catch(error) {
            onNode?.({nodeId:node.id,status:'failed',durationMs:performance.now()-started,message:error instanceof Error?error.message:String(error)});
            throw error;
          }
        },
        completeSegment:()=>{ if(next!==segment.nodeIds.length) throw new Error('Incomplete segment.'); complete=true; }
      });
      const script=generateSegment(segment);
      // The only compiled source is generated above; no Flow field is interpolated into it.
      new Function('host',script)(host);
      if(!complete) throw new Error('Segment did not complete.');
      const outputs:Record<string,string>={};
      for(const index of segment.outgoing) {
        const edge=this.compiledPlan.connections[index]!;
        if(edge.boundary) { currentNode=edge.source.nodeId; outputs[String(index)]=this.codecs.encode(edge.codec!,this.values.get(edge.source.nodeId)![edge.source.port]); }
      }
      this.done.add(segment.id);
      return {executionId:this.executionId,segmentId,wires:outputs,generatedJavaScript:script};
    } catch(cause) {
      this.dispose();
      throw new SegmentExecutionError(this.executionId,currentNode,signal?.aborted?'cancelled':'failed',cause);
    }
  }
  dispose():void { this.values.clear(); this.failed=true; }
}
