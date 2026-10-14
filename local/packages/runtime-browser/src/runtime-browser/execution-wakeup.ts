export type SubscribeFlowChanges=(changed:(executionId?:string)=>void)=>()=>void;
/** Notify the single root reconciliation loop; revisions retain hints arriving during HTTP requests. */
export class ExecutionWakeup {
  revision=0;
  private readonly listeners=new Set<()=>void>();
  constructor(private readonly signal:AbortSignal,private readonly fallbackMs=5000){}
  pulse():void {this.revision++;for(const listener of [...this.listeners])listener();}
  wait(after:number):Promise<void>{
    this.signal.throwIfAborted();
    if(after!==this.revision)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);this.listeners.delete(wake);this.signal.removeEventListener('abort',abort);};
      const wake=()=>{cleanup();resolve();};
      const abort=()=>{cleanup();reject(this.signal.reason);};
      const timer=setTimeout(wake,this.fallbackMs);
      this.listeners.add(wake);this.signal.addEventListener('abort',abort,{once:true});
      if(this.signal.aborted)abort();else if(after!==this.revision)wake();
    });
  }
}
