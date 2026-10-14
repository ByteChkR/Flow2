import type {InvocationInfo} from './orchestrator.js';

/** Child calls await the root's authoritative snapshots; they never poll independently. */
export class InvocationTracker {
  private readonly states=new Map<string,InvocationInfo>();
  private readonly waiters=new Map<string,Set<(state:InvocationInfo)=>void>>();
  constructor(private readonly signal:AbortSignal){}
  observe(invocations:readonly InvocationInfo[]):void {
    for(const state of invocations){
      const previous=this.states.get(state.executionId);
      if(previous&&(previous.state==='completed'||previous.state==='failed'))continue;
      this.states.set(state.executionId,state);
      if(state.state==='completed'||state.state==='failed')for(const resolve of [...this.waiters.get(state.executionId)??[]])resolve(state);
    }
  }
  wait(id:string):Promise<InvocationInfo>{
    this.signal.throwIfAborted();
    const state=this.states.get(id);
    if(state&&(state.state==='completed'||state.state==='failed'))return Promise.resolve(state);
    return new Promise((resolve,reject)=>{
      const entries=this.waiters.get(id)??new Set();this.waiters.set(id,entries);
      const cleanup=()=>{entries.delete(done);if(!entries.size)this.waiters.delete(id);this.signal.removeEventListener('abort',abort);};
      const done=(value:InvocationInfo)=>{cleanup();resolve(value);};
      const abort=()=>{cleanup();reject(this.signal.reason);};
      entries.add(done);this.signal.addEventListener('abort',abort,{once:true});
      if(this.signal.aborted)abort();
    });
  }
}
