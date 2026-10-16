import {compileFlow,type ExecutionPlan} from '@adam-flow/core/flow-compiler/index.js';

/** Workspace-owned, content-addressed compiler cache. Never stores execution data.
 * Copies on both boundaries keep mutable runtime plans out of the shared template. */
export class BrowserPlanCache {
 private entries=new Map<string,{plan:ExecutionPlan;bytes:number}>();
 private bytes=0;
 hits=0;misses=0;
 constructor(private readonly compiler:typeof compileFlow=compileFlow,private readonly maxEntries=32,private readonly maxBytes=8*1024*1024){}
 clear(){this.entries.clear();this.bytes=0;this.hits=0;this.misses=0;}
 readonly prepare:typeof compileFlow=(...args)=>{
  // All compiler inputs, including graph-specialized catalogs and codec versions.
  const key=JSON.stringify(args),cached=this.entries.get(key);
  if(cached){this.hits++;return structuredClone(cached.plan);}
  this.misses++;
  const plan=this.compiler(...args);
  const bytes=2*(key.length+JSON.stringify(plan).length);
  if(bytes<=this.maxBytes){
   while(this.entries.size&&(this.entries.size>=this.maxEntries||this.bytes+bytes>this.maxBytes)){
    const oldest=this.entries.keys().next().value!;this.bytes-=this.entries.get(oldest)!.bytes;this.entries.delete(oldest);
   }
   this.entries.set(key,{plan:structuredClone(plan),bytes});this.bytes+=bytes;
  }
  return plan;
 };
}
