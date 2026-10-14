import axios from 'axios';
import {writable} from 'svelte/store';
export interface ValidationProgressSnapshot {
 startedAt:string; phase:string; detail?:string; connectionWarning?:boolean;
 changedAt?:string; sampledAt?:string; finishedAt?:string; receivedAt?:number;
 graphs:{id:string;name:string;state:string}[];
}
/** One tracker per editor operation; polling never changes its success/failure result. */
export function validationProgress(){
 const store=writable<ValidationProgressSnapshot|null>(null);
 let stop:()=>void=()=>{};
 return {subscribe:store.subscribe,stop:()=>stop(),
  async run<T>(action:(id:string,report:(value:ValidationProgressSnapshot)=>void)=>Promise<T>,names:Record<string,string>={},signal?:AbortSignal):Promise<T>{
   stop();
   const id=crypto.randomUUID(),controller=new AbortController();
   const started=Date.now();
   let active=true,timer:ReturnType<typeof setTimeout>|undefined;
   const cleanup=()=>{active=false;clearTimeout(timer);controller.abort();signal?.removeEventListener('abort',cleanup);store.set(null);};
   stop=cleanup;signal?.addEventListener('abort',cleanup,{once:true});
   const report=(value:ValidationProgressSnapshot)=>{if(active)store.set({...value,graphs:value.graphs.map(g=>({...g,name:names[g.id]??g.name}))});};
   report({startedAt:new Date().toISOString(),phase:'Validierung wird vorbereitet',graphs:[]});
   async function poll(){
    try{
     const {data}=await axios.get(`flow2/workspace/validation-progress/${id}`,{signal:controller.signal,timeout:5000});
     if(data?.startedAt&&Array.isArray(data.graphs))report({...data,receivedAt:Date.now()});
     else if(active&&Date.now()-started>5000)store.update(value=>value?{...value,connectionWarning:true}:value);
    }catch{if(active)store.update(value=>value?{...value,connectionWarning:true}:value);}
    if(active)timer=setTimeout(poll,400);
   }
   timer=setTimeout(poll,150);
   try{return await action(id,report);}finally{cleanup();}
  }
 };
}
