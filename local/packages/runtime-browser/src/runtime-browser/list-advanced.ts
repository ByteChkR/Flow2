import type {ValueNodeBinding} from '@adam-flow/core/flow-core/model.js';
import {ValueIndex,compareValues} from '@adam-flow/core/flow-core/value-order.js';
import {decimalMath,integerMath} from '@adam-flow/core/flow-core/numeric.js';
export function executeListAdvanced(b:ValueNodeBinding,inputs:Record<string,unknown>):Record<string,unknown>{
 const items=inputs.items as unknown[],other=inputs.other as unknown[],op=b.operation;
 if(op==='zip')return {value:items.slice(0,other.length).map((left,i)=>({left,right:other[i]}))};
 if(op==='sort')return {value:items.map((value,index)=>({value,index})).sort((a,z)=>(inputs.descending===true?-1:1)*compareValues(b.type,a.value,z.value)||a.index-z.index).map(x=>x.value)};
 if(op==='min'||op==='max'){
  if(!items.length)return {};let best=items[0];
  for(const value of items.slice(1))if(compareValues(b.type,value,best)*(op==='min'?1:-1)<0)best=value;
  return {value:best};
 }
 if(op==='sum'||op==='average'){
  const integer=b.type.kind==='scalar'&&b.type.name==='core.Integer';
  if(op==='sum'&&integer)return {value:(items as number[]).reduce((sum,value)=>integerMath.add(sum,value),0)};
  if(op==='average'&&!items.length)return {};
  const sum=items.reduce<string>((sum,value)=>decimalMath.add(sum,String(value)),'0');
  return {value:op==='sum'?sum:decimalMath.divide(sum,String(items.length))};
 }
 const seen=new ValueIndex<boolean>(b.type),membership=new ValueIndex<boolean>(b.type),value:unknown[]=[];
 if(op==='intersect'||op==='except')for(const item of other)if(!membership.get(item))membership.add(item,true);
 for(const item of op==='union'?items.concat(other):items){
  if(seen.get(item))continue;seen.add(item,true);
  if(op==='intersect'&&!membership.get(item)||op==='except'&&membership.get(item))continue;
  value.push(item);
 }
 return {value};
}
