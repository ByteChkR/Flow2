import type {GraphNodeBinding,TypeRef,JsonValue} from '@adam-flow/core/flow-core/model.js';
import {ValueIndex,compareValues} from '@adam-flow/core/flow-core/value-order.js';

/** The selector is evaluated exactly once per input, in order, before sorting/grouping. */
export async function executeListSelector(binding:GraphNodeBinding,inputs:Readonly<Record<string,unknown>>,select:(item:JsonValue,index:number)=>Promise<Record<string,JsonValue>>,signal?:AbortSignal):Promise<Record<string,unknown>> {
 const type=binding.signature.outputs[0]!.type,operation=binding.operation;
 const directions: {type:TypeRef;field?:string;descending:boolean}[]=type.kind==='object'&&operation==='sortBy'?(inputs.orderBy as {field:string;descending:boolean}[]).map(key=>{
  if(!Object.hasOwn(type.fields,key.field))throw new Error(`orderBy: Unknown key field ${key.field}.`);
  return {...key,type:type.fields[key.field]!};
 }):[{type,descending:inputs.descending===true}];
 if(operation==='sortBy'&&(!directions.length||new Set(directions.map(key=>key.field)).size!==directions.length))throw new Error('orderBy: Provide at least one distinct key field.');
 const rows:{item:JsonValue;key:JsonValue;index:number}[]=[];
 signal?.throwIfAborted();
 for(const [index,item] of (inputs.items as JsonValue[]).entries()){
  signal?.throwIfAborted();const output=await select(item,index);signal?.throwIfAborted();
  if(!Object.hasOwn(output,'value'))throw new Error('Selector must return value.');
  rows.push({item,key:output.value!,index});
 }
 const compare=(a:typeof rows[number],b:typeof rows[number])=>{
  for(const direction of directions){
   const av=direction.field===undefined?a.key:(a.key as Record<string,JsonValue>)[direction.field],bv=direction.field===undefined?b.key:(b.key as Record<string,JsonValue>)[direction.field];
   const order=compareValues(direction.type,av,bv)*(direction.descending?-1:1);if(order)return order;
  }
  return 0;
 };
 if(operation==='sortBy')return {value:rows.sort((a,b)=>compare(a,b)||a.index-b.index).map(row=>row.item)};
 if(operation==='minBy'||operation==='maxBy'){
  if(!rows.length)return {};let best=rows[0]!;
  for(const row of rows.slice(1))if(compare(row,best)*(operation==='minBy'?1:-1)<0)best=row;
  return {value:best.item};
 }
 const index=new ValueIndex<JsonValue[]>(type),groups:{key:JsonValue;items:JsonValue[]}[]=[],distinct:JsonValue[]=[];
 for(const row of rows){
  const group=index.get(row.key);
  if(group){if(operation==='groupBy')group.push(row.item);continue;}
  const items=[row.item];index.add(row.key,items);groups.push({key:row.key,items});distinct.push(row.item);
 }
 return {value:operation==='groupBy'?groups:distinct};
}
