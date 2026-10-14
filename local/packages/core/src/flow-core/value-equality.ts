import type {DictionaryEntry} from './dictionaries.js';
import type {TypeRef} from './model.js';
import {decimalMath} from './numeric.js';
import {dateTimeOffsetMath,timeSpanMath} from './temporal.js';
import {parseScalar} from './scalars.js';

/** Equality follows the declared value contract, never JS object identity or JSON text. */
export function supportsValueEquality(type:TypeRef):boolean {
  switch(type.kind){
    case 'string':case 'number':case 'boolean':case 'null':case 'scalar':case 'entity':case 'entityRef':return true;
    case 'optional':case 'nullable':return supportsValueEquality(type.inner);
    case 'dictionary':case 'array':return supportsValueEquality(type.items);
    case 'object':return Object.values(type.fields).every(supportsValueEquality);
    default:return false;
  }
}
export function valuesEqual(type:TypeRef,left:unknown,right:unknown):boolean {
  if(!supportsValueEquality(type))throw new Error(`Equality is not supported for ${type.kind}.`);
  function equal(t:TypeRef,a:unknown,b:unknown):boolean {
    if(t.kind==='optional')return a===undefined||b===undefined?a===b:equal(t.inner,a,b);
    if(t.kind==='nullable')return a===null||b===null?a===b:equal(t.inner,a,b);
    switch(t.kind){
      case 'null':case 'string':case 'number':case 'boolean':return a===b;
      case 'scalar':
        switch(t.name){
          case 'core.Decimal':return decimalMath.compare(a as string,b as string)===0;
          case 'core.DateTimeOffset':return dateTimeOffsetMath.compare(a as string,b as string)===0;
          case 'core.TimeSpan':return timeSpanMath.compare(a as string,b as string)===0;
          case 'core.Guid':return parseScalar('core.Guid',a)===parseScalar('core.Guid',b);
          default:return a===b;
        }
      case 'dictionary':{
        const x=a as DictionaryEntry[],y=new Map((b as DictionaryEntry[]).map(e=>[e.key,e.value]));
        return x.length===y.size&&x.every(e=>y.has(e.key)&&equal(t.items,e.value,y.get(e.key)));
      }
      case 'array':{
        const x=a as unknown[],y=b as unknown[];
        return x.length===y.length&&x.every((value,index)=>equal(t.items,value,y[index]));
      }
      case 'object':{
        const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
        return Object.entries(t.fields).every(([name,field])=>{
          const hasX=Object.hasOwn(x,name),hasY=Object.hasOwn(y,name);
          return hasX===hasY&&(!hasX||equal(field,x[name],y[name]));
        });
      }
      case 'entityRef':{
        const x=a as {type:string;id:string},y=b as {type:string;id:string};
        return x.type===y.type&&x.id===y.id;
      }
      case 'entity':throw new Error('Native entity equality requires backend execution.');
      default:throw new Error(`Equality is not supported for ${t.kind}.`);
    }
  }
  return equal(type,left,right);
}
