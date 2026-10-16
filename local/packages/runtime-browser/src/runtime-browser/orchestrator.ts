import {withWireSchemaCache} from '@adam-flow/core/flow-core/schema.js';
import {inheritedFailure,failureError} from './failure.js';
import {InvocationTracker} from './invocation-tracker.js';
import {ContractError} from '@adam-flow/core/flow-core/schema.js';
import {flowDesignations} from '@adam-flow/core/flow-core/designations.js';
import {ExecutionWakeup} from './execution-wakeup.js';
import type {SubscribeFlowChanges} from './execution-wakeup.js';
import {registerValueNodes} from './value-nodes.js';
import {queryCodecs} from '@adam-flow/core/flow-core/query-nodes.js';
import {registerCatalogValueCodecs} from './value-codecs.js';
import {registerGraphNodes} from './graph-nodes.js';
import type { ExecutionTrace } from './trace.js';
import {mergeCodecDefinitions,materializeHybrid,GraphBundleSnapshot,graphCatalog,graphCodecs,canonicalJson,requireFlowValues,TypeRegistry} from '@adam-flow/core/flow-core/index.js';
import type { Catalog, CodecCatalog, Flow, GraphBundle, JsonValue, TypeDocument } from '@adam-flow/core/flow-core/index.js';
import { compileFlow } from '@adam-flow/core/flow-compiler/index.js';
import { BrowserExecution, SegmentExecutionError } from './segments.js';
import { BrowserNodeRegistry } from './index.js';
import { BrowserCodecRegistry } from './codecs.js';
import {HttpExecutionTransport,ExecutionTransportError} from './execution-transport.js';
import type {ExecutionTransport,ExecutionCommand,BrowserResultItem} from './execution-transport.js';

export interface ExecutionFailure { code: string; message: string; nodeId: string | null; graphId?:string|null; executionId?:string|null }
export interface InvocationInfo {executionId:string;graphId:string;parentInvocationId:string|null;callNodeId:string|null;state:string;error:ExecutionFailure|null;skippedNodeIds:string[];outputs?:Record<string,JsonValue>;callKey?:string|null;hybridEnvironment?:'server'|'browser'|null}
export interface ExecutionSnapshot { executionId: string; state: 'created'|'running'|'waiting_for_browser'|'completed'|'failed'; error: ExecutionFailure|null; completedSegments: string[]; events?: ExecutionTrace[]; outputs:Record<string,JsonValue>; controlOutput:boolean;invocations?:InvocationInfo[];transport?:'http'|'signalr' }
/** Opt-in experiments; never read from graph JSON. Defaults preserve the baseline. */
export interface SubgraphOptimizations {
  localCatalogSnapshot?:boolean;
  localPreparationCache?:boolean;
  localRegistryMetadata?:boolean;
  /** Existing optimizations: enabled unless explicitly false. */
  localValidationReuse?:boolean;
  browserRuntimeIndexes?:boolean;
  browserWireSchemaCache?:boolean;
}
export interface BrowserRegistry {
  nodes:BrowserNodeRegistry;codecs:BrowserCodecRegistry;
  /** Opt-in contract: return fresh implementations, prepare bindings and registry maps. */
  prepareMetadataFactory?:()=> (()=>BrowserRegistry)|undefined;
}
export interface OrchestratorOptions {
  /** Host-selected transport, fixed for the lifetime of this run. */
  transport?:ExecutionTransport;
  /** Trusted host-owned compiler cache; never accepted from graph JSON. */
  preparePlan?:typeof compileFlow;
  subgraphOptimizations?:SubgraphOptimizations;
  /** Server-prepared productive process task; editor previews leave this unset. */
  processTaskId?:string;
  profiling?:boolean;
  /** Internal: elapsed workspace validation before orchestration. */
  preparationMs?:number;
  subscribeChanges?:SubscribeFlowChanges;
  bundle?:GraphBundle;
  registryFactory?:(types:TypeDocument)=>BrowserRegistry;
  inputs?:Record<string,JsonValue>;
  flow: Flow; catalog: Catalog; types: TypeDocument; serverCodecs: CodecCatalog;
  nodes: BrowserNodeRegistry; codecs: BrowserCodecRegistry; signal?: AbortSignal;
  onProgress?: (snapshot: ExecutionSnapshot) => void; onTrace?: (event: ExecutionTrace) => void; fetcher?: typeof fetch;
  allowUnknownInputs?:boolean;
}
function snapshot(value: unknown): ExecutionSnapshot {
  if(!value || typeof value!=='object') throw new Error('Invalid execution response.');
  const s=value as ExecutionSnapshot;
  if(typeof s.executionId!=='string' || !['created','running','waiting_for_browser','completed','failed'].includes(s.state) ||
    typeof s.controlOutput!=='boolean' || (s.controlOutput&&s.state!=='completed') ||
    !Array.isArray(s.completedSegments) || !s.completedSegments.every(id=>typeof id==='string')) throw new Error('Invalid execution response.');
  return s;
}

const sessionLostMessage='Die Flow-Sitzung ist nicht mehr verfügbar (z. B. nach einem Backend-Neustart oder Instanzwechsel). Über „Zurück“ und „Ausführen“ kannst du einen neuen Lauf starten. Bereits ausgeführte Änderungen bleiben bestehen.';
export class FlowSessionLostError extends Error {
  constructor(){super(sessionLostMessage);this.name='FlowSessionLostError';}
}

/** The gateway cookie provides routing affinity; authentication and the session header authorize requests. */
export async function runOrchestratedFlow(options: OrchestratorOptions): Promise<ExecutionSnapshot> {
  const runStarted=performance.now()-(options.preparationMs??0);
  const {flow,catalog,types,nodes,codecs,serverCodecs,signal}=options;
  const transport:ExecutionTransport=options.transport??new HttpExecutionTransport(options.fetcher??fetch);
  const stop=new AbortController();
  const runSignal=AbortSignal.any([stop.signal,...(signal?[signal]:[])]);
  const workers=new Map<string,Promise<void>>();
  const invocations=new InvocationTracker(runSignal);
  const pendingResults:BrowserResultItem[]=[];
  let workerError:unknown;
  let runProfileRecorded=false;
  const finishProfile=()=>{if(!runProfileRecorded){runProfileRecorded=true;profile('run',runStarted,{invocationId:executionId??null});}};
  const seen=new Set<string>();let localSequence=0;
  const browserEvents:ExecutionTrace[]=[];
  const emitBrowser=(event:Omit<ExecutionTrace,'id'|'timestamp'|'environment'>)=>{
    const trace:ExecutionTrace={id:`browser-${localSequence++}`,timestamp:new Date().toISOString(),environment:'browser',...event};
    browserEvents.push(trace);options.onTrace?.(trace);
  };
  const profile=(status:string,started:number,extra:Partial<ExecutionTrace>={})=>{
    if(options.profiling)emitBrowser({kind:'profile',status,durationMs:performance.now()-started,graphId:flow.id,...extra});
  };
  const progress=(state:ExecutionSnapshot)=>{
    for(const event of state.events ?? []) {
      const key=`${state.executionId}/${event.id}`;
      if(!seen.has(key)) {seen.add(key);options.onTrace?.(event);}
    }
    options.onProgress?.(state);
  };
  const bundle=options.bundle?new GraphBundleSnapshot(options.bundle):undefined;
  if(bundle&&canonicalJson(bundle.root)!==canonicalJson(flow))throw new Error('Root flow differs from workspace snapshot.');
  if(bundle&&!options.registryFactory)throw new Error('Workspace execution requires a fresh registry factory.');
  const queryFlows=bundle?.document.graphs??[flow];
  for(const graph of queryFlows)registerCatalogValueCodecs(codecs,graphCatalog(graph,catalog,types));
  const extraCodecs=mergeCodecDefinitions(bundle?graphCodecs(bundle.document):[],queryCodecs(queryFlows,serverCodecs.codecs));
  const serverCapabilities={...serverCodecs,codecs:[...serverCodecs.codecs,...extraCodecs.filter(codec=>!serverCodecs.codecs.some(existing=>existing.typeId===codec.typeId&&existing.version===codec.version))]};
  const executionFlow=materializeHybrid(flow);
  const plan=(options.preparePlan??compileFlow)(executionFlow,graphCatalog(executionFlow,catalog,types),types,{server:serverCapabilities,browser:{...codecs.catalog,codecs:[...codecs.catalog.codecs,...extraCodecs.filter(codec=>!codecs.catalog.codecs.some(existing=>existing.typeId===codec.typeId&&existing.version===codec.version))]}});
  const inputs=structuredClone(options.inputs??{});
  requireFlowValues(plan.interface.inputs,inputs,'/inputs',new TypeRegistry(types),!!options.allowUnknownInputs);
  const designationErrors=flowDesignations.validateUse(executionFlow,catalog,{inputs,...(options.bundle?{graphs:options.bundle.graphs}:{})});
  if(designationErrors.length)throw new ContractError(designationErrors);
  profile('preflight',runStarted);
  let executionId:string|undefined;
  let sessionId:string|undefined;
  let processHeartbeat:ReturnType<typeof setInterval>|undefined;
  const runtimes=new Map<string,{runtime:BrowserExecution;invocation:InvocationInfo;attempts:Map<string,{segmentId:string;attemptId:string}>;stop:AbortController}>();
  const request=async(command:ExecutionCommand):Promise<any>=>{
    const requestStart=options.profiling?performance.now():0;
    // Capability validation and graph preflight can take longer with Adam's full entity catalog.
    // Only task-bound, idempotent requests may be retried. Keep the same payload
    // and attempt IDs; never execute a browser node again to recover a response.
    const retryable=!!options.processTaskId&&['next','startProcess','heartbeatProcess','completeProcess','results','invoke'].includes(command.kind);
    let retryUntil:number|undefined;
    let result:any;
    for(;;){
      const deadline=AbortSignal.timeout(retryUntil?Math.max(1,retryUntil-Date.now()):120000);
      try {
        result=await transport.send(command,{sessionId,signal:AbortSignal.any([runSignal,deadline])});
        break;
      } catch(error) {
        runSignal.throwIfAborted();
        if(error instanceof ExecutionTransportError && ![502,503,504].includes(error.status)) {
          if((error.status===404&&error.code==='execution')||(error.status===409&&error.code==='session_required'))throw new FlowSessionLostError();
          if(error.diagnostics)throw new ContractError(error.diagnostics as ConstructorParameters<typeof ContractError>[0]);
          throw error;
        }
        if(!retryable||deadline.aborted){if(deadline.aborted)throw deadline.reason;if(error instanceof TypeError)throw Object.assign(new Error('Backend-Verbindung nicht verfügbar.'),{code:'ERR_NETWORK'});throw error;}
      }
      retryUntil??=Date.now()+20000;
      if(Date.now()>=retryUntil)throw new FlowSessionLostError();
      await new Promise<void>((resolve,reject)=>{
        const abort=()=>{clearTimeout(timer);reject(runSignal.reason);};
        const timer=setTimeout(()=>{runSignal.removeEventListener('abort',abort);resolve();},Math.min(500,retryUntil!-Date.now()));
        runSignal.addEventListener('abort',abort,{once:true});
        if(runSignal.aborted){runSignal.removeEventListener('abort',abort);abort();}
      });
    }
    profile(transport.kind,requestStart,{message:transport.describe(command)});
    if(command.kind==='invoke')wakeup.pulse();
    return result;
  };
  const wakeup=new ExecutionWakeup(runSignal,transport.pollIntervalMs??null);
  let unsubscribe:(()=>void)|undefined;
  const invocationInputs=new Map<string,{invocation:InvocationInfo;inputs:Record<string,JsonValue>}>();
  const runtimeFor=(invocation:InvocationInfo,args:Record<string,JsonValue>)=>withWireSchemaCache(options.subgraphOptimizations?.browserWireSchemaCache!==false,()=>{
    const existing=runtimes.get(invocation.executionId);if(existing)return existing;
    const runtimeStart=options.profiling?performance.now():0;
    const definition=invocation.executionId===executionId?flow:bundle?.document.graphs.find(graph=>graph.id===invocation.graphId);
    if(!definition)throw new Error('Invocation refers to an unknown workspace graph.');
    if(definition.mode==='hybrid'&&invocation.executionId!==executionId&&!invocation.hybridEnvironment)throw new Error('Hybrid invocation is missing its runtime.');
    const target=materializeHybrid(definition,invocation.hybridEnvironment??'server');
    const designationErrors=flowDesignations.validate(target,catalog,args);
    if(designationErrors.length)throw new ContractError(designationErrors);
    const local=options.registryFactory?options.registryFactory(types):{nodes,codecs};
    registerValueNodes(target,local.nodes);
    registerCatalogValueCodecs(local.codecs,graphCatalog(target,catalog,types));
    const attempts=new Map<string,{segmentId:string;attemptId:string}>();
    if(bundle)registerGraphNodes(target,bundle,local.nodes,local.codecs,async(nodeId,reference,signature,arguments_,_signal,callKey="")=>{
      _signal?.throwIfAborted();
      const childStart=options.profiling?performance.now():0;
      try {
      const attempt=attempts.get(nodeId);if(!attempt)throw new Error('Graph call has no active browser attempt.');
      const child=await request({kind:'invoke',executionId:invocation.executionId,body:{...attempt,reference,inputs:arguments_,callKey}});
      if(typeof child.executionId!=='string')throw new Error('Missing child invocation ID.');
      invocations.observe(child.invocations??[]);
      let cancelTask:Promise<unknown>|undefined;
      const cancelChild=()=>{runtimes.get(child.executionId)?.stop.abort(new DOMException("Invocation cancelled.","AbortError"));cancelTask??=request({kind:'cancel',executionId:child.executionId}).then(snapshot=>{invocations.observe(snapshot.invocations??[]);wakeup.pulse();});void cancelTask.catch(()=>wakeup.pulse());};
      _signal?.addEventListener('abort',cancelChild,{once:true});
      if(_signal?.aborted)cancelChild();
      let state:InvocationInfo;
      try{state=await invocations.wait(child.executionId);if(cancelTask)await cancelTask;}
      finally{_signal?.removeEventListener('abort',cancelChild);}
      _signal?.throwIfAborted();
      if(state.state==='failed'&&state.error?.code==='session_lost')throw new FlowSessionLostError();
      if(state.state==='failed'){if(state.error?.code==='cancelled')throw new DOMException(state.error?.message,'AbortError');throw failureError(state.error??{code:'failed',message:'Subgraph failed.',nodeId:null});}
      const outputs=state.outputs??{};
      requireFlowValues(signature.outputs,outputs,'/outputs',new TypeRegistry(types));
      const childFlow=bundle!.document.graphs.find(graph=>graph.id===reference.graphId)!;
      const errors=flowDesignations.validateOutputs(childFlow,catalog,outputs);if(errors.length)throw new ContractError(errors);
      return outputs;
      } finally {profile('childWait',childStart,{graphId:invocation.graphId,invocationId:invocation.executionId,nodeId,profile:{startMs:childStart}});}
    });
    const runtime=new BrowserExecution(invocation.executionId,target,graphCatalog(target,catalog,types),types,{server:serverCapabilities,browser:local.codecs.catalog},local.nodes,local.codecs,args,{preparePlan:options.preparePlan,runtimeIndexes:options.subgraphOptimizations?.browserRuntimeIndexes!==false});
    profile('runtime',runtimeStart,{graphId:invocation.graphId,invocationId:invocation.executionId});
    const context={runtime,invocation,attempts,stop:new AbortController()};runtimes.set(invocation.executionId,context);return context;
  });
  try {
    try{unsubscribe=(transport.subscribeChanges?.bind(transport)??options.subscribeChanges)?.(id=>{if(!id||id===executionId)wakeup.pulse();});}catch(error){if(transport.kind==='signalr')throw error;/* HTTP polling remains available without wakeup hints. */}
    if(options.processTaskId||flow.mode==='interactive'||flow.mode==='hybrid'||bundle?.document.graphs.some(graph=>graph.mode==='hybrid')) {
      const session=await request({kind:'openSession',body:{browserCatalog:nodes.catalog,browserCodecs:codecs.catalog}});
      if(typeof session.sessionId!=='string') throw new Error('Missing session ID.');
      sessionId=session.sessionId;
    }
    let state=snapshot(options.processTaskId
      ?await request({kind:'startProcess',taskId:options.processTaskId,body:{sessionId}})
      :await request({kind:'start',body:{flow,inputs,...(options.profiling?{profiling:true}:{}),...(sessionId?{sessionId}:{}),...(bundle?{bundle:bundle.document}:{})}}));
    if(options.processTaskId)processHeartbeat=setInterval(()=>{void request({kind:'heartbeatProcess',taskId:options.processTaskId!}).catch(()=>{/* Session expiry and the next coordinator request report loss. */});},10000);
    executionId=state.executionId;
    invocationInputs.set(executionId,{invocation:{executionId,graphId:flow.id,parentInvocationId:null,callNodeId:null,state:state.state,error:null,skippedNodeIds:plan.skippedNodeIds},inputs});
    invocations.observe(state.invocations??[]);
    progress(state);
    while(state.state!=='completed' && state.state!=='failed') {
      signal?.throwIfAborted();
      const revision=wakeup.revision;
      // Coalesce completions from the same event-loop turn. Only this loop sends results or polls.
      if(pendingResults.length)await new Promise<void>(resolve=>setTimeout(resolve,0));
      runSignal.throwIfAborted();
      if(workerError)throw workerError;
      const batch=pendingResults.splice(0,256);
      const work=batch.length
        ?await request({kind:'results',executionId,body:{results:batch}})
        :await request({kind:'next',executionId});
      state=snapshot(work.execution);
      if(state.executionId!==executionId) throw new Error('Unexpected execution ID.');
      invocations.observe(state.invocations??[]);
      for(const info of state.invocations??[])if(info.state==='failed')runtimes.get(info.executionId)?.stop.abort(new DOMException(info.error?.message??'Invocation stopped.','AbortError'));
      progress(state);
      if(state.state==='completed'||state.state==='failed')break;
      for(const item of work.invocations??[])invocationInputs.set(item.invocation.executionId,item);
      if(!Array.isArray(work.workItems))throw new Error('Missing browser work items.');
      for(const item of work.workItems) {
        const target=invocationInputs.get(item.executionId??executionId);
        if(!target)throw new Error('Work item refers to an unknown invocation.');
        // Server-only invocations never need a browser registry or a local execution plan.
        const context=runtimeFor(target.invocation,target.inputs);
        const segment=context.runtime.plan.segments.find(segment=>segment.id===item.segment?.id);
        if(!segment || segment.environment!=='browser' || canonicalJson(segment)!==canonicalJson(item.segment) || typeof item.attemptId!=='string')
          throw new Error('Server segment does not match the locally validated plan.');
        if(workers.has(item.attemptId))continue;
        for(const nodeId of segment.nodeIds)context.attempts.set(nodeId,{segmentId:segment.id,attemptId:item.attemptId});
        const worker=(async()=>{
          let result;
          try {
            result={...await context.runtime.execute(segment.id,item.wires,AbortSignal.any([runSignal,context.stop.signal]),event=>{
              emitBrowser({kind:'node',segmentId:segment.id,...event,graphId:context.invocation.graphId,invocationId:context.invocation.executionId,parentInvocationId:context.invocation.parentInvocationId,callNodeId:context.invocation.callNodeId});
              if(event.status==='failed'&&!runSignal.aborted)emitBrowser({kind:'log',status:'error',nodeId:event.nodeId,segmentId:segment.id,message:event.message??'Node failed.',graphId:context.invocation.graphId,invocationId:context.invocation.executionId});
            },entry=>emitBrowser({kind:'log',status:entry.level,message:entry.message,nodeId:entry.nodeId,segmentId:segment.id,graphId:context.invocation.graphId,invocationId:context.invocation.executionId}),options.profiling?metrics=>emitBrowser({kind:'profile',status:'segment',durationMs:metrics.totalMs!,profile:metrics,segmentId:segment.id,graphId:context.invocation.graphId,invocationId:context.invocation.executionId}):undefined),attemptId:item.attemptId};
          } catch(error) {
            runSignal.throwIfAborted();if(context.stop.signal.aborted)return;
            result={segmentId:segment.id,attemptId:item.attemptId,wires:{},error:inheritedFailure(error)??{code:error instanceof SegmentExecutionError?error.code:'failed',graphId:context.invocation.graphId,executionId:context.invocation.executionId,message:error instanceof Error?error.message:String(error),nodeId:error instanceof SegmentExecutionError?error.nodeId:null}};
          }
          if(context.stop.signal.aborted)return;
          pendingResults.push({executionId:context.invocation.executionId,result:{segmentId:result.segmentId,attemptId:result.attemptId,wires:result.wires,...('outputs' in result?{outputs:result.outputs}:{}),...('error' in result?{error:result.error}:{})}});
        })().catch(error=>{if(!runSignal.aborted)workerError=error;}).finally(()=>wakeup.pulse());
        workers.set(item.attemptId,worker);
      }
      if(workerError)throw workerError;
      if(!pendingResults.length)await wakeup.wait(revision);
    }
    if(options.processTaskId) {
      const persisted=await request({kind:'completeProcess',taskId:options.processTaskId});
      if(state.state==='completed'&&persisted.status!=='erledigt')throw new Error('Der Prozessabschluss wurde nicht als erfolgreich gespeichert.');
    }
    if(state.state==='failed'&&state.error?.code==='session_lost')throw new FlowSessionLostError();
    if(state.controlOutput!==(state.state==='completed'&&plan.interface.control.output))throw new Error('Control output does not match the flow interface.');
    if(state.state==='completed'){requireFlowValues(plan.interface.outputs,state.outputs,'/outputs',new TypeRegistry(types));const errors=flowDesignations.validateOutputs(executionFlow,catalog,state.outputs);if(errors.length)throw new ContractError(errors);}
    finishProfile();
    return {...state,transport:transport.kind,events:[...(state.events??[]),...browserEvents].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))};
  } finally {
    if(processHeartbeat)clearInterval(processHeartbeat);
    finishProfile();
    stop.abort();
    try{unsubscribe?.();}catch{/* Best-effort subscription cleanup. */}
    await Promise.allSettled(workers.values());
    for(const context of runtimes.values())context.runtime.dispose();
    if(executionId) {
      try {
        const closed=await transport.send({kind:'cancel',executionId},{sessionId,signal:AbortSignal.timeout(3000)});
        // Cancellation may happen between polls; retain the final backend logs as well.
        if(closed){const final=snapshot(closed);if(final.executionId===executionId)progress(final);}
      } catch { /* Session cleanup also cancels interactive runs. */ }
    }
    if(options.processTaskId) {
      try {await transport.send({kind:'releaseProcess',taskId:options.processTaskId},{sessionId,signal:AbortSignal.timeout(3000)});}catch{/* Durable lease is the fallback after disconnect. */}
    }
    if(sessionId) {
      // Cleanup has its own deadline, so cancellation of the run does not skip session invalidation.
      try {await transport.send({kind:'closeSession',sessionId},{signal:AbortSignal.timeout(3000)});} catch { /* Lease expiry is the fallback when disconnected. */ }
    }
  }
}
