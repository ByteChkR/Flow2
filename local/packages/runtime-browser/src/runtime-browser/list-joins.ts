import type {GraphNodeBinding,JsonValue} from '@adam-flow/core/flow-core/model.js';
import {ValueIndex} from '@adam-flow/core/flow-core/value-order.js';
export async function executeListJoin(binding:GraphNodeBinding,inputs:Readonly<Record<string,unknown>>,select:(slot:string,item:JsonValue,index:number)=>Promise<Record<string,JsonValue>>,signal?:AbortSignal):Promise<Record<string,unknown>> {
 const index=new ValueIndex<JsonValue[]>(binding.signature.outputs[0]!.type);
 async function key(slot:string,item:JsonValue,position:number){
  signal?.throwIfAborted();const result=await select(slot,item,position);signal?.throwIfAborted();
  if(!Object.hasOwn(result,'value'))throw new Error('Join selector must return value.');return result.value!;
 }
 signal?.throwIfAborted();
 for(const [position,item] of (inputs.right as JsonValue[]).entries()){
  const value=await key('rightKey',item,position),bucket=index.get(value);
  if(bucket)bucket.push(item);else index.add(value,[item]);
 }
 const value:JsonValue[]=[];
 for(const [position,left] of (inputs.left as JsonValue[]).entries()){
  const selected=await key('leftKey',left,position),matches=index.get(selected)??[];
  if(binding.operation==='groupJoinByKey'){value.push({left,right:[...matches]});continue;}
  if(!matches.length&&binding.operation==='leftJoinByKey')value.push({left,found:false});
  for(const right of matches)value.push(binding.operation==='leftJoinByKey'?{left,right,found:true}:{left,right});
 }
 signal?.throwIfAborted();return {value};
}
