import type {DictionaryEntry} from './dictionaries.js';
import type {TypeRef} from './model.js';
import {decimalMath} from './numeric.js';
import {dateTimeOffsetMath,timeSpanMath,dateTimeOffsetKey} from './temporal.js';
import {parseScalar} from './scalars.js';
import {valuesEqual,supportsValueEquality} from './value-equality.js';
export const supportsValueOrder=(t:TypeRef):boolean=>t.kind==='nullable'?supportsValueOrder(t.inner):['string','number','boolean','scalar','null'].includes(t.kind);
export function compareValues(t:TypeRef,a:unknown,b:unknown):number {
 if(!supportsValueOrder(t))throw new Error('Type does not support ordering.');
 if(t.kind==='nullable')return a===null||b===null?a===b?0:a===null?-1:1:compareValues(t.inner,a,b);
 if(t.kind==='scalar'){
  if(t.name==='core.Decimal')return decimalMath.compare(a as string,b as string);
  if(t.name==='core.TimeSpan')return timeSpanMath.compare(a as string,b as string);
  if(t.name==='core.DateTimeOffset')return dateTimeOffsetMath.compare(a as string,b as string);
  if(t.name==='core.Guid'){a=parseScalar(t.name,a);b=parseScalar(t.name,b);}
 }
 return a===b?0:(a as string|number)<(b as string|number)?-1:1;
}
const text=(s:string)=>`${s.length}:${s}`;
const bits=(value:number)=>{const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value===0?0:value,false);return view.getBigUint64(0,false).toString(16).padStart(16,'0');};
/** Stable UTF-16 FNV hash; equality is always checked inside collision buckets. */
export function valueHash(type:TypeRef,value:unknown):number {
 if(!supportsValueEquality(type))throw new Error('Type does not support hashing.');
 function key(t:TypeRef,v:unknown):string{
  if(t.kind==='optional')return v===undefined?'missing':'present'+key(t.inner,v);
  if(t.kind==='nullable')return v===null?'null':'nonnull'+key(t.inner,v);
  if(t.kind==='dictionary')return 'dictionary'+(v as DictionaryEntry[]).slice().sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).map(e=>text(e.key)+text(key(t.items,e.value))).join('');
  if(t.kind==='array')return 'array'+text((v as unknown[]).map(x=>text(key(t.items,x))).join(''));
  if(t.kind==='object')return 'record'+Object.keys(t.fields).sort().map(name=>text(name)+(Object.hasOwn(v as object,name)?'present'+text(key(t.fields[name]!, (v as Record<string,unknown>)[name])):'missing')).join('');
  if(t.kind==='entityRef'){const e=v as {type:string;id:string};return 'entityRef'+text(e.type)+text(e.id);}
  if(t.kind==='entity')throw new Error('Native entity hashing requires backend execution.');
  if(t.kind==='null')return 'null';
  if(t.kind==='number')return 'number'+bits(v as number);
  if(t.kind==='scalar'){
   if(t.name==='core.DateTimeOffset')return t.name+text(dateTimeOffsetKey(v as string));
   return t.name+text(String(parseScalar(t.name,v)));
  }
  return t.kind+text(String(v));
 }
 let hash=2166136261;for(const unit of key(type,value).split(''))hash=Math.imul(hash^unit.charCodeAt(0),16777619)>>>0;
 return hash;
}
export class ValueIndex<T> {
 private buckets=new Map<number,{key:unknown;value:T}[]>();
 constructor(private type:TypeRef){}
 get(key:unknown):T|undefined{return this.buckets.get(valueHash(this.type,key))?.find(entry=>valuesEqual(this.type,entry.key,key))?.value;}
 add(key:unknown,value:T):void{const hash=valueHash(this.type,key);const bucket=this.buckets.get(hash)??[];bucket.push({key,value});this.buckets.set(hash,bucket);}
}
