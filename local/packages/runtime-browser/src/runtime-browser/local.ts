import {inheritedFailure,failureError} from './failure.js';
import type {ExecutionPlan} from '@adam-flow/core/flow-compiler/index.js';
import {compileFlow} from '@adam-flow/core/flow-compiler/index.js';
import {resolveDefinition} from '@adam-flow/core/flow-core/node-resolution.js';
import {withWireSchemaCache,canonicalJson,ContractError,GraphBundleSnapshot,graphCatalog,materializeHybrid,requireFlowValues,TypeRegistry,isGraphReference} from '@adam-flow/core/flow-core/index.js';
import type {Catalog,Flow,JsonValue} from '@adam-flow/core/flow-core/index.js';
import {flowDesignations} from '@adam-flow/core/flow-core/designations.js';
import {BrowserExecution,SegmentExecutionError} from './segments.js';
import {registerValueNodes} from './value-nodes.js';
import {registerCatalogValueCodecs} from './value-codecs.js';
import {registerGraphNodes} from './graph-nodes.js';
import type {BrowserRegistry,ExecutionSnapshot,OrchestratorOptions} from './orchestrator.js';
import type {ExecutionTrace} from './trace.js';

/** Shared preflight for the editor and runtime; never executes nodes or uses transport. */
export function createLocalFlowCheck(options:OrchestratorOptions,bundle?:GraphBundleSnapshot){
 // Validate static targets before any node can produce side effects. Actual inputs
 // and dynamically supplied graph references are checked again at invocation time.
 const checked=new Set<string>();
 function check(source:Flow,path:string[]=[]):Flow{
  return withWireSchemaCache(options.subgraphOptimizations?.browserWireSchemaCache!==false,()=>checkCore(source,path));
 }
 function checkCore(source:Flow,path:string[]):Flow{
  if(path.includes(source.id)||path.length>=32)throw new Error('Recursive graph calls or graph depth exceeded.');
  const flow=materializeHybrid(source,'browser');
  if(flow.mode==='backend'||flow.nodes.some(node=>node.environment!=='browser'))throw new ContractError([{code:'local_environment',path:`/graphs/${flow.id}`,message:'Der Graph enthält Backend-Ausführung.'}]);
  if(options.subgraphOptimizations?.localValidationReuse!==false&&checked.has(flow.id))return flow;
  const catalog=graphCatalog(flow,options.catalog,options.types);
  const errors=flowDesignations.validateUse(flow,catalog,{...(bundle?{graphs:bundle.document.graphs}:{})});
  if(errors.length)throw new ContractError(errors);
  // Prepare trusted browser definitions and validate the graph without executing it.
  const registry=options.registryFactory?.(options.types)??{nodes:options.nodes,codecs:options.codecs};
  registerValueNodes(flow,registry.nodes);registerCatalogValueCodecs(registry.codecs,catalog);
  if(bundle)registerGraphNodes(flow,bundle,registry.nodes,registry.codecs,async()=>{throw new Error('Validation cannot execute graphs.');});
  // Compile without constructing an execution: required input values arrive later.
  const plan=(options.preparePlan??compileFlow)(flow,catalog,options.types,{server:options.serverCodecs,browser:registry.codecs.catalog});
  const localCatalog=options.subgraphOptimizations?.localCatalogSnapshot?registry.nodes.catalog:undefined;
  for(const node of plan.nodes){
   const local=resolveDefinition(localCatalog??registry.nodes.catalog,node);
   if(!local||local.flowPort!==node.flowPort||canonicalJson(local.inputs)!==canonicalJson(node.inputs)||canonicalJson(local.outputs)!==canonicalJson(node.outputs)||canonicalJson(local.control??null)!==canonicalJson(node.control??null))throw new Error(`Unregistered browser node ${node.id}.`);
  }
  for(const node of flow.nodes.filter(node=>node.graph?.graphId)){
   if(!bundle)throw new Error('Graph nodes require a workspace snapshot.');
   check(bundle.resolve(bundle.reference(node.graph!.graphId!),node.graph!.signature,options.catalog),[...path,flow.id]);
  }
  checked.add(flow.id);return flow;
 }
 return check;
}

/** No transport or server session: all reachable graphs execute in this browser. */
export async function runLocalFlow(options:OrchestratorOptions):Promise<ExecutionSnapshot>{
 if(options.processTaskId)throw new Error('Persistierte Prozesse benötigen Backend-Koordination.');
 const started=performance.now(),types=new TypeRegistry(options.types);
 const factory=options.registryFactory;
 if(options.subgraphOptimizations?.localRegistryMetadata&&factory){
  let preparedFactory:(()=>BrowserRegistry)|undefined;
  options={...options,registryFactory:types=>{
   if(preparedFactory)return preparedFactory();
   const registry=factory(types);preparedFactory=registry.prepareMetadataFactory?.();return registry;
  }};
 }
 const bundle=options.bundle?new GraphBundleSnapshot(options.bundle):undefined;
 if(bundle&&!options.registryFactory)throw new Error('Local subgraphs require a fresh registry factory.');
 if(bundle&&canonicalJson(bundle.root)!==canonicalJson(options.flow))throw new Error('Root flow differs from workspace snapshot.');
 const events:ExecutionTrace[]=[];let sequence=0;
 const emit=(event:Omit<ExecutionTrace,'id'|'timestamp'|'environment'>)=>{const full={...event,id:`local-${sequence++}`,timestamp:new Date().toISOString(),environment:'browser' as const};events.push(full);options.onTrace?.(full);};
 const check=createLocalFlowCheck(options,bundle);
 check(options.flow);
 if(options.profiling)emit({kind:'profile',status:'preflight',graphId:options.flow.id,durationMs:performance.now()-started});
 // Scoped to this immutable run/bundle: no data or metadata can escape into another run.
 const prepared=new Map<string,{catalog:Catalog;plan:ExecutionPlan}>();
 async function execute(source:Flow,inputs:Record<string,JsonValue>,ancestors:string[]=[],parentInvocationId:string|null=null,callNodeId:string|null=null,parentSignal=options.signal):Promise<ExecutionSnapshot>{
  parentSignal?.throwIfAborted();
  const stop=new AbortController(),signal=AbortSignal.any([stop.signal,...(parentSignal?[parentSignal]:[])]);
  if(ancestors.includes(source.id)||ancestors.length>=32)throw new Error('Recursive graph calls or graph depth exceeded.');
  const preparationStarted=options.profiling?performance.now():0;
  const {flow,catalog,runtime,plan,executionId,root}=withWireSchemaCache(options.subgraphOptimizations?.browserWireSchemaCache!==false,()=>{
  const flow=check(source),cached=options.subgraphOptimizations?.localPreparationCache?prepared.get(flow.id):undefined;
  const catalog=cached?.catalog??graphCatalog(flow,options.catalog,options.types);
  const catalogFinished=options.profiling?performance.now():0;
  const errors=flowDesignations.validateUse(flow,catalog,{inputs,...(bundle?{graphs:bundle.document.graphs}:{})});
  if(errors.length)throw new ContractError(errors);
  const executionId=crypto.randomUUID(),root=parentInvocationId===null;
  const registryStarted=options.profiling?performance.now():0;
  const registry=options.registryFactory?.(options.types)??{nodes:options.nodes,codecs:options.codecs};
  const registryFinished=options.profiling?performance.now():0;
  registerValueNodes(flow,registry.nodes);registerCatalogValueCodecs(registry.codecs,catalog);
  if(bundle)registerGraphNodes(flow,bundle,registry.nodes,registry.codecs,async(nodeId,reference,signature,args,invocationSignal)=>{
   const childStarted=options.profiling?performance.now():0;let resolveMs=0;
   try{
    const child=bundle.resolve(reference,signature,options.catalog);
    if(options.profiling)resolveMs=performance.now()-childStarted;
    const result=await execute(child,args,[...ancestors,flow.id],executionId,nodeId,AbortSignal.any([signal,...(invocationSignal?[invocationSignal]:[])]));
    if(result.state!=='completed')throw failureError(result.error??{code:'failed',message:'Subgraph failed.',nodeId:null});
    return result.outputs;
   }finally{
    if(options.profiling)emit({kind:'profile',status:'childWait',graphId:flow.id,invocationId:executionId,parentInvocationId,callNodeId,nodeId,durationMs:performance.now()-childStarted,profile:{startMs:childStarted,resolveMs}});
   }
  });
  const specializationFinished=options.profiling?performance.now():0;
  const runtime=new BrowserExecution(executionId,flow,catalog,options.types,{server:options.serverCodecs,browser:registry.codecs.catalog},registry.nodes,registry.codecs,inputs,{preparePlan:options.preparePlan,...(cached?{plan:cached.plan}:{}),runtimeIndexes:options.subgraphOptimizations?.browserRuntimeIndexes!==false,snapshotNodeCatalog:options.subgraphOptimizations?.localCatalogSnapshot===true});
  const plan=runtime.plan;
  if(options.subgraphOptimizations?.localPreparationCache&&!cached)prepared.set(flow.id,{catalog,plan});
  if(options.profiling)emit({kind:'profile',status:'subgraphPreparation',graphId:flow.id,invocationId:executionId,parentInvocationId,callNodeId,durationMs:performance.now()-preparationStarted,profile:{catalogMs:catalogFinished-preparationStarted,designationMs:registryStarted-catalogFinished,registryMs:registryFinished-registryStarted,specializationMs:specializationFinished-registryFinished,runtimeMs:performance.now()-specializationFinished,cacheHits:cached?1:0,cacheMisses:options.subgraphOptimizations?.localPreparationCache&&!cached?1:0}});
  return {flow,catalog,runtime,plan,executionId,root};
  });
  const state:ExecutionSnapshot={executionId,state:'running',error:null,completedSegments:[],outputs:{},controlOutput:false};
  const trace=(event:Omit<ExecutionTrace,'id'|'timestamp'|'environment'>)=>emit({...event,graphId:flow.id,invocationId:executionId,parentInvocationId,callNodeId});
  const progress=()=>{if(root)options.onProgress?.(structuredClone(state));};
  try{
   requireFlowValues(plan.interface.inputs,inputs,'/inputs',types,!!options.allowUnknownInputs&&root);
   for(const parameter of plan.interface.inputs){
    let type=parameter.type;while(type.kind==='optional'||type.kind==='nullable')type=type.inner;
    const value=inputs[parameter.name];
    if(type.kind==='graph'&&isGraphReference(value)){
     if(!bundle)throw new Error('Graph inputs require a workspace snapshot.');
     check(bundle.resolve(value,type.signature,options.catalog),[...ancestors,flow.id]);
    }
   }
   progress();
   const jobs=new Map<string,Promise<void>>();
   for(const segment of plan.segments){
    const dependencies=segment.dependencies.map(id=>jobs.get(id)!);
    jobs.set(segment.id,(async()=>{
     await Promise.all(dependencies);signal.throwIfAborted();
     const result=await runtime.execute(segment.id,{},signal,event=>trace({kind:'node',segmentId:segment.id,...event}),entry=>trace({kind:'log',status:entry.level,nodeId:entry.nodeId,message:entry.message}),options.profiling?profile=>trace({kind:'profile',status:'segment',segmentId:segment.id,durationMs:profile.totalMs!,profile}):undefined);
     Object.assign(state.outputs,result.outputs);state.completedSegments.push(segment.id);progress();
    })().catch(error=>{stop.abort(error);throw error;}));
   }
   const results=await Promise.allSettled(jobs.values());
   const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
   requireFlowValues(plan.interface.outputs,state.outputs,'/outputs',types);
   const errors=flowDesignations.validateOutputs(flow,catalog,state.outputs);if(errors.length)throw new ContractError(errors);
   state.state='completed';state.controlOutput=plan.interface.control.output;
  }catch(error){parentSignal?.throwIfAborted();state.state='failed';state.error=inheritedFailure(error)??{code:error instanceof SegmentExecutionError?error.code:'failed',graphId:flow.id,executionId,message:error instanceof Error?error.message:String(error),nodeId:error instanceof SegmentExecutionError?error.nodeId:null};}
  finally{runtime.dispose();}
  trace({kind:'execution',status:state.state});progress();return state;
 }
 try{return {...await execute(options.flow,structuredClone(options.inputs??{})),events};}
 finally{if(options.profiling)emit({kind:'profile',status:'run',graphId:options.flow.id,durationMs:performance.now()-started});}
}
