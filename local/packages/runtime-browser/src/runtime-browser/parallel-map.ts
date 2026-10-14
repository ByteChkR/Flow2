import type {FlowNode,GraphReference,JsonValue} from '@adam-flow/core/flow-core/model.js';
import {graphInputPort} from '@adam-flow/core/flow-core/graph-nodes.js';
import type {GraphInvoker} from './graph-nodes.js';

export async function executeParallelMap(node:FlowNode,inputs:Readonly<Record<string,unknown>>,invoke:GraphInvoker,signal?:AbortSignal):Promise<Record<string,unknown>> {
  const concurrency=inputs.maxConcurrency as number;
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw new Error('maxConcurrency: Expected 1–16.');
  signal?.throwIfAborted();
  const signature=node.graph!.signature,items=inputs.items as JsonValue[],values:JsonValue[]=new Array(items.length);
  const stopped=new AbortController(),combined=signal?AbortSignal.any([signal,stopped.signal]):stopped.signal;
  let next=0,failed=false,failure:unknown;
  async function worker(){
    while(!combined.aborted){
      const index=next++;
      if(index>=items.length)return;
      try{
        const args=Object.fromEntries(signature.inputs.flatMap(p=>p.name==='item'?[[p.name,items[index]!]]:p.name==='index'?[[p.name,index]]:Object.hasOwn(inputs,graphInputPort(p))?[[p.name,inputs[graphInputPort(p)] as JsonValue]]:[]));
        const result=await invoke(node.id,inputs.body as GraphReference,signature,structuredClone(args),combined,`body:${index}`);
        combined.throwIfAborted();
        values[index]=structuredClone(result.value!);
      }catch(error){
        if(!failed){failed=true;failure=error;stopped.abort(error);}
        return;
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},()=>worker()));
  signal?.throwIfAborted();
  if(failed)throw failure;
  return {value:values};
}
