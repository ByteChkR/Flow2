import type { ExecutionTrace } from './trace.js';
import { canonicalJson } from '@adam-flow/flow-core';
import type { Catalog, CodecCatalog, Flow, TypeDocument } from '@adam-flow/flow-core';
import { compileFlow } from '@adam-flow/flow-compiler';
import { BrowserExecution, SegmentExecutionError } from './segments.js';
import { BrowserNodeRegistry } from './index.js';
import { BrowserCodecRegistry } from './codecs.js';

export interface ExecutionFailure { code: string; message: string; nodeId: string | null }
export interface ExecutionSnapshot { executionId: string; state: 'created'|'running'|'waiting_for_browser'|'completed'|'failed'; error: ExecutionFailure|null; completedSegments: string[]; events?: ExecutionTrace[] }
export interface OrchestratorOptions {
  flow: Flow; catalog: Catalog; types: TypeDocument; serverCodecs: CodecCatalog;
  nodes: BrowserNodeRegistry; codecs: BrowserCodecRegistry; signal?: AbortSignal;
  onProgress?: (snapshot: ExecutionSnapshot) => void; onTrace?: (event: ExecutionTrace) => void; fetcher?: typeof fetch;
}
function snapshot(value: unknown): ExecutionSnapshot {
  if(!value || typeof value!=='object') throw new Error('Invalid execution response.');
  const s=value as ExecutionSnapshot;
  if(typeof s.executionId!=='string' || !['created','running','waiting_for_browser','completed','failed'].includes(s.state) ||
    !Array.isArray(s.completedSegments) || !s.completedSegments.every(id=>typeof id==='string')) throw new Error('Invalid execution response.');
  return s;
}

/** Session ownership is provided by an HttpOnly browser cookie plus the session header. */
export async function runOrchestratedFlow(options: OrchestratorOptions): Promise<ExecutionSnapshot> {
  const {flow,catalog,types,nodes,codecs,serverCodecs,signal}=options;
  const fetcher=options.fetcher ?? fetch;
  const seen=new Set<string>();let localSequence=0;
  const progress=(state:ExecutionSnapshot)=>{
    for(const event of state.events ?? []) {
      const key=`${state.executionId}/${event.id}`;
      if(!seen.has(key)) {seen.add(key);options.onTrace?.(event);}
    }
    options.onProgress?.(state);
  };
  const plan=compileFlow(flow,catalog,types,{server:serverCodecs,browser:codecs.catalog});
  let sessionId:string|undefined, execution:BrowserExecution|undefined;
  const request=async(path:string,method:string,body?:unknown):Promise<any>=>{
    const response=await fetcher(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(sessionId?{'X-Flow-Session':sessionId}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
    const result=await response.json();
    if(!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${JSON.stringify(result)}`);
    return result;
  };
  try {
    if(flow.mode==='interactive') {
      const session=await request('/api/sessions','POST',{browserCatalog:nodes.catalog,browserCodecs:codecs.catalog});
      if(typeof session.sessionId!=='string') throw new Error('Missing session ID.');
      sessionId=session.sessionId;
    }
    let state=snapshot(await request('/api/executions','POST',{flow,...(sessionId?{sessionId}:{})}));
    const executionId=state.executionId;
    execution=new BrowserExecution(executionId,flow,catalog,types,{server:serverCodecs,browser:codecs.catalog},nodes,codecs);
    progress(state);
    while(state.state!=='completed' && state.state!=='failed') {
      signal?.throwIfAborted();
      const work=await request(`/api/executions/${executionId}/next`,'GET');
      state=snapshot(work.execution);
      if(state.executionId!==executionId) throw new Error('Unexpected execution ID.');
      progress(state);
      if(state.state==='waiting_for_browser') {
        const segment=plan.segments.find(item=>item.id===work.segment?.id);
        if(!segment || segment.environment!=='browser' || canonicalJson(segment)!==canonicalJson(work.segment) || typeof work.attemptId!=='string')
          throw new Error('Server segment does not match the locally validated plan.');
        let result;
        try {
          result={...execution.execute(segment.id,work.wires,signal,event=>options.onTrace?.({
            id:`browser-${localSequence++}`,timestamp:new Date().toISOString(),environment:'browser',kind:'node',segmentId:segment.id,...event})),attemptId:work.attemptId};
        } catch(error) {
          result={segmentId:segment.id,attemptId:work.attemptId,wires:{},error:{code:'failed',message:error instanceof Error?error.message:String(error),nodeId:error instanceof SegmentExecutionError?error.nodeId:null}};
        }
        // Only protocol fields are transmitted; executable source is never submitted.
        state=snapshot(await request(`/api/executions/${executionId}/result`,'POST',{
          segmentId:result.segmentId,attemptId:result.attemptId,wires:result.wires,...('error' in result?{error:result.error}:{})}));
        if(state.executionId!==executionId) throw new Error('Unexpected execution ID.');
        progress(state);
      } else if(state.state==='running'||state.state==='created') {
        await new Promise<void>((resolve,reject)=>{
          const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};
          const timer=setTimeout(finish,100);
          const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal?.reason);};
          signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted) abort();
        });
      }
    }
    return state;
  } finally {
    execution?.dispose();
    if(sessionId) {
      // Cleanup has its own deadline, so cancellation of the run does not skip session invalidation.
      try {await fetcher(`/api/sessions/${sessionId}`,{method:'DELETE',credentials:'same-origin',signal:AbortSignal.timeout(3000)});} catch { /* Lease expiry is the fallback when disconnected. */ }
    }
  }
}
