import {nodeFailureCode} from './node-failure.js';
import {resolveDefinition} from '@adam-flow/core/flow-core/node-resolution.js';
import type { NodeTrace,NodeLog,FlowLogLevel } from './trace.js';
import { canonicalJson,requireFlowValues,TypeRegistry } from '@adam-flow/core/flow-core/index.js';
import type { Catalog, Flow, JsonValue, TypeDocument } from '@adam-flow/core/flow-core/index.js';
import { compileFlow, generateSegment } from '@adam-flow/core/flow-compiler/index.js';
import type { Capabilities, ExecutionPlan } from '@adam-flow/core/flow-compiler/index.js';
import { BrowserNodeRegistry } from './index.js';
import { BrowserCodecRegistry } from './codecs.js';

export class SegmentExecutionError extends Error {
  constructor(public readonly executionId: string, public readonly nodeId: string | null,
    public readonly code: string, cause: unknown) {
    super(`Execution ${executionId}, node ${nodeId ?? '<segment>'}: ${cause instanceof Error ? cause.message : String(cause)}`, {cause});
  }
}
export interface SegmentOutput { executionId: string; segmentId: string; wires: Record<string, string>; generatedJavaScript: string; outputs:Record<string,JsonValue> }

/** Execution-local storage preserves native values across separate browser segments. */
export class BrowserExecution {
  private readonly useIndexes:boolean;
  private readonly compiledPlan: ExecutionPlan;
  private readonly nodesById:Map<string,ExecutionPlan['nodes'][number]>;
  private readonly segmentsById:Map<string,ExecutionPlan['segments'][number]>;
  private readonly inputEdges=new Map<string,ExecutionPlan['connections']>();
  get plan(): ExecutionPlan { return structuredClone(this.compiledPlan); }
  private readonly values = new Map<string, Record<string, unknown>>();
  private readonly done = new Set<string>();
  private readonly started = new Set<string>();
  private failed = false;
  private readonly flowInputs:Record<string,JsonValue>;
  private readonly types:TypeRegistry;
  constructor(readonly executionId: string, flow: Flow, catalog: Catalog, types: TypeDocument,
    capabilities: Capabilities, private readonly nodes: BrowserNodeRegistry, private readonly codecs: BrowserCodecRegistry, inputs:Record<string,JsonValue>={}, preparation?:{plan?:ExecutionPlan;snapshotNodeCatalog?:boolean;runtimeIndexes?:boolean}) {
    // A prepared plan is supplied only by the run-local cache after successful validation.
    this.compiledPlan = preparation?.plan??compileFlow(flow, catalog, types, {...capabilities,browser:codecs.catalog});
    this.useIndexes=preparation?.runtimeIndexes!==false;
    this.nodesById=new Map(this.useIndexes?this.compiledPlan.nodes.map(node=>[node.id,node]):[]);
    this.segmentsById=new Map(this.useIndexes?this.compiledPlan.segments.map(segment=>[segment.id,segment]):[]);
    if(this.useIndexes)for(const edge of this.compiledPlan.connections.filter(edge=>edge.kind!=='control')){const edges=this.inputEdges.get(edge.target.nodeId)??[];edges.push(edge);this.inputEdges.set(edge.target.nodeId,edges);}
    this.types=new TypeRegistry(types);
    const browserInputs=this.compiledPlan.interface.inputs.filter(parameter=>this.compiledPlan.nodes.some(node=>node.id===parameter.nodeId&&node.environment==='browser'));
    this.flowInputs=structuredClone(Object.fromEntries(Object.entries(inputs).filter(([name])=>browserInputs.some(parameter=>parameter.name===name))));
    requireFlowValues(browserInputs,this.flowInputs,'/inputs',this.types);
    // Server declarations may be remote; every browser implementation must match the local allowlist.
    const localCatalog=preparation?.snapshotNodeCatalog?nodes.catalog:undefined;
    for(const node of this.compiledPlan.nodes.filter(node=>node.environment==='browser')) {
      const local = resolveDefinition(localCatalog??nodes.catalog,node);
      if(!local || local.flowPort!==node.flowPort || canonicalJson(local.inputs)!==canonicalJson(node.inputs) || canonicalJson(local.outputs)!==canonicalJson(node.outputs)||canonicalJson(local.control??null)!==canonicalJson(node.control??null)) throw new Error(`Unregistered browser node ${node.id}.`);
    }
  }
  async execute(segmentId: string, wires: Record<string,string>, signal?: AbortSignal, onNode?: (event:NodeTrace)=>void, onLog?:(entry:NodeLog)=>void, onProfile?:(profile:Record<string,number>)=>void): Promise<SegmentOutput> {
    const segmentStart=onProfile?performance.now():0;
    let nodesMs=0;
    let currentNode: string | null = null;
    const flowOutputs:Record<string,JsonValue>=Object.create(null);
    try {
      if(this.failed) throw new Error('Execution already failed or disposed.');
      const segment = this.useIndexes?this.segmentsById.get(segmentId):this.compiledPlan.segments.find(s=>s.id===segmentId);
      if(!segment || segment.environment!=='browser' || this.started.has(segmentId)) throw new Error('Unknown, wrong-environment or repeated segment.');
      this.started.add(segmentId);
      const expected = segment.incoming.filter(index=>this.compiledPlan.connections[index]!.boundary).map(String);
      if(Object.keys(wires).some(key=>!expected.includes(key)) || expected.some(key=>!Object.hasOwn(wires,key))) throw new Error('Boundary inputs do not match the plan.');
      const decoded = new Map<number,unknown>();
      for(const index of segment.incoming) {
        const edge = this.compiledPlan.connections[index]!;
        if(edge.kind==='control')continue;
        currentNode = edge.target.nodeId;
        if(edge.boundary) decoded.set(index,this.codecs.decode(edge.codec!,wires[String(index)]!,edge.targetType));
        else if(!this.values.has(edge.source.nodeId)) throw new Error('Local dependency has not executed.');
      }
      const decodeMs=onProfile?performance.now()-segmentStart:0;
      let next = 0, complete = false;
      const invokeNode = async (index:number) => {
          const started=performance.now();
          let implementationMs=0,waitMs=0,inputItems:number|undefined;
          if(index!==next++) throw new Error('Invalid invocation order.');
          const node = (this.useIndexes?this.nodesById.get(segment.nodeIds[index]!):this.compiledPlan.nodes.find(n=>n.id===segment.nodeIds[index]))!;
          currentNode = node.id;
          if(signal?.aborted) throw new Error('Execution cancelled.');
          onNode?.({nodeId:node.id,status:'running'});
          try {
          const inputs: Record<string,unknown> = Object.create(null);
          for(const edge of (this.useIndexes?(this.inputEdges.get(node.id)??[]):this.compiledPlan.connections.filter(e=>e.kind!=='control'&&e.target.nodeId===node.id))) {
            if(edge.boundary) {const value=decoded.get(edge.index);if(value!==undefined)inputs[edge.target.port]=value;}
            else {
              const source=this.values.get(edge.source.nodeId);
              if(!source) throw new Error('Local dependency has not executed.');
              if(Object.hasOwn(source,edge.source.port)) inputs[edge.target.port]=source[edge.source.port];
            }
          }
          for(const [port,literal] of Object.entries(node.inlineInputs??{}))if(literal.enabled)inputs[port]=structuredClone(literal.value);
          if(onProfile){const lists=['items','left','right','entries','dictionary'].map(port=>inputs[port]).filter(Array.isArray);if(lists.length)inputItems=lists.reduce((sum,list)=>sum+list.length,0);}
          const log=(level:FlowLogLevel,message:string)=>{
            signal?.throwIfAborted();
            if(!this.failed)onLog?.({nodeId:node.id,level,message:String(message)});
          };
          
            let outputs:Record<string,unknown>;
            const implementationStart=onProfile?performance.now():0;
            if(node.flowPort==='input'){
              const parameter=this.compiledPlan.interface.inputs.find(p=>p.nodeId===node.id)!;
              outputs=Object.hasOwn(this.flowInputs,parameter.name)?{value:this.flowInputs[parameter.name]}:{};
            }else if(node.flowPort==='output'){
              const parameter=this.compiledPlan.interface.outputs.find(p=>p.nodeId===node.id)!;
              if(Object.hasOwn(inputs,'value'))flowOutputs[parameter.name]=inputs.value as JsonValue;
              requireFlowValues([parameter],Object.hasOwn(flowOutputs,parameter.name)?{[parameter.name]:flowOutputs[parameter.name]!}:{},'/outputs',this.types);
              outputs={};
            }else outputs=await this.nodes.executeAsync({nodeId:node.id,type:node.type,typeVersion:node.typeVersion,environment:'browser',inputs,config:node.config},signal,{info:message=>log('info',message),warning:message=>log('warning',message),error:message=>log('error',message)},onProfile?(duration,wait)=>{implementationMs=duration;waitMs=wait;}:undefined);
            if(onProfile&&node.flowPort)implementationMs=performance.now()-implementationStart;
            signal?.throwIfAborted();
            if(this.failed)throw new Error('Execution already failed or disposed.');
            this.values.set(node.id,outputs);
            const durationMs=performance.now()-started;
            onNode?.({nodeId:node.id,status:'completed',durationMs,...(onProfile?{profile:{...(inputItems===undefined?{}:{inputItems}),startMs:started,offsetMs:started-segmentStart,implementationMs,waitMs,overheadMs:Math.max(0,durationMs-implementationMs)}}:{})});
          } catch(error) {
            const durationMs=performance.now()-started;
            onNode?.({nodeId:node.id,status:'failed',durationMs,...(onProfile?{profile:{...(inputItems===undefined?{}:{inputItems}),startMs:started,offsetMs:started-segmentStart,implementationMs,waitMs,overheadMs:Math.max(0,durationMs-implementationMs)}}:{}),message:error instanceof Error?error.message:String(error)});
            throw error;
          } finally {if(onProfile)nodesMs+=performance.now()-started;}
      };
      const scheduleStart=onProfile?performance.now():0;
      const scheduled:number[]=[];
      const host = Object.freeze({
        invokeNode:(index:number)=>{if(index!==scheduled.length) throw new Error('Invalid invocation order.');scheduled.push(index);},
        completeSegment:()=>{ if(scheduled.length!==segment.nodeIds.length) throw new Error('Incomplete segment.'); complete=true; }
      });
      const script=generateSegment(segment);
      // The only compiled source is generated above; no Flow field is interpolated into it.
      new Function('host',script)(host);
      if(!complete) throw new Error('Segment did not complete scheduling.');
      const scheduleMs=onProfile?performance.now()-scheduleStart:0;
      for(const index of scheduled) await invokeNode(index);
      signal?.throwIfAborted();
      const encodeStart=onProfile?performance.now():0;
      const outputs:Record<string,string>={};
      for(const index of segment.outgoing) {
        const edge=this.compiledPlan.connections[index]!;
        if(edge.boundary) { currentNode=edge.source.nodeId; outputs[String(index)]=this.codecs.encode(edge.codec!,this.values.get(edge.source.nodeId)![edge.source.port]); }
      }
      if(onProfile){const encodeMs=performance.now()-encodeStart;const totalMs=performance.now()-segmentStart;const bytes=(values:Record<string,string>)=>Object.values(values).reduce((sum,value)=>sum+new TextEncoder().encode(value).length,0);onProfile({decodeMs,scheduleMs,nodesMs,encodeMs,totalMs,inputBytes:bytes(wires),outputBytes:bytes(outputs)});}
      this.done.add(segment.id);
      return {executionId:this.executionId,segmentId,wires:outputs,generatedJavaScript:script,outputs:flowOutputs};
    } catch(cause) {
      this.failed=true;
      throw new SegmentExecutionError(this.executionId,currentNode,signal?.aborted?'cancelled':nodeFailureCode(cause)??'failed',cause);
    }
  }
  dispose():void { this.values.clear(); this.failed=true; }
}
