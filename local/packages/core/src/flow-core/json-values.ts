import {dictionaryShape,dictionaryKeys} from './dictionaries.js';
import type {TypeRef} from './model.js';
import {parseScalar} from './scalars.js';

export const jsonValueType:TypeRef={kind:'object',fields:{json:{kind:'string'}}};
export const jsonSupports=(t:TypeRef):boolean=>['string','null','scalar'].includes(t.kind)||(t.kind==='optional'||t.kind==='nullable')&&jsonSupports(t.inner)||(t.kind==='array'||t.kind==='dictionary')&&jsonSupports(t.items)||t.kind==='object'&&Object.values(t.fields).every(jsonSupports);
interface JsonPart {raw:string;kind:'object'|'array'|'string'|'number'|'boolean'|'null';fields?:Map<string,JsonPart>;items?:JsonPart[]}

/** Parse structure without converting JSON numeric tokens to JS floating-point numbers. */
export function parseJson(text:string):JsonPart {
  if(text.length>4*1024*1024)throw new Error('JSON document exceeds 4,194,304 characters.');
  let i=0;
  const skip=()=>{while(/[\x20\t\r\n]/.test(text[i]??'x'))i++;};
  const fail=():never=>{throw new Error(`Invalid JSON at offset ${i}.`);};
  function string():string {
    const start=i++;let escaped=false;
    while(i<text.length){const c=text[i++]!;if(c==='"'&&!escaped)return JSON.parse(text.slice(start,i));if(c==='\\'&&!escaped)escaped=true;else escaped=false;}
    return fail();
  }
  function value(depth:number):JsonPart {
    skip();const start=i,c=text[i];if((c==='{'||c==='[')&&depth>=64)throw new Error('JSON depth exceeds 64.');
    if(c==='{'){
      i++;skip();const fields=new Map<string,JsonPart>();
      if(text[i]!=='}')while(true){
        skip();if(text[i]!=='"')fail();const name=string();if(fields.has(name))throw new Error(`Duplicate JSON field: ${name}`);
        skip();if(text[i++]!==':')fail();fields.set(name,value(depth+1));skip();
        if(text[i]===','){i++;continue;}break;
      }
      if(text[i++]!=='}')fail();return {kind:'object',fields,raw:text.slice(start,i)};
    }
    if(c==='['){
      i++;skip();const items:JsonPart[]=[];
      if(text[i]!==']')while(true){items.push(value(depth+1));skip();if(text[i]===','){i++;continue;}break;}
      if(text[i++]!==']')fail();return {kind:'array',items,raw:text.slice(start,i)};
    }
    if(c==='"'){string();return {kind:'string',raw:text.slice(start,i)};}
    for(const literal of ['true','false','null'])if(text.startsWith(literal,i)){i+=literal.length;return {kind:literal==='null'?'null':'boolean',raw:literal};}
    const number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if(number){i+=number[0].length;return {kind:'number',raw:number[0]};}
    return fail();
  }
  const result=value(0);skip();if(i!==text.length)fail();return result;
}
export const wrapJson=(text:string)=>({json:parseJson(text).raw});
export function unwrapJson(value:unknown):JsonPart {
  if(!value||typeof value!=='object'||!('json' in value)||typeof value.json!=='string')throw new Error('JSON value requires a json string.');
  return parseJson(value.json);
}
export function stringifyJson(part:JsonPart):string {
  if(part.kind==='object')return '{'+[...part.fields!].map(([name,item])=>JSON.stringify(name)+':'+stringifyJson(item)).join(',')+'}';
  if(part.kind==='array')return '['+part.items!.map(stringifyJson).join(',')+']';
  return part.raw;
}
function expandNumber(text:string):string {
  const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);if(!m)throw new Error('Expected JSON number.');
  const exponent=Number(m[4]??0);if(!Number.isInteger(exponent)||Math.abs(exponent)>1000)throw new Error('Number exponent out of range.');
  const digits=m[2]!+(m[3]??''),point=m[2]!.length+exponent;
  return m[1]+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point));
}
export function jsonToValue(t:TypeRef,json:JsonPart):unknown {
  if(t.kind==='dictionary'){const value=jsonToValue(dictionaryShape(t.items),json),errors=dictionaryKeys(value);if(errors.length)throw new Error(errors[0]!.message);return value;}
  if(t.kind==='optional')return jsonToValue(t.inner,json);
  if(t.kind==='nullable')return json.kind==='null'?null:jsonToValue(t.inner,json);
  if(t.kind==='null'&&json.kind==='null')return null;
  if(t.kind==='object'&&json.kind==='object'){
    const result:Record<string,unknown>=Object.create(null);
    if([...json.fields!.keys()].some(name=>!Object.hasOwn(t.fields,name)))throw new Error('JSON contains fields outside the target record contract.');
    for(const [name,field] of Object.entries(t.fields)){
      const item=json.fields!.get(name);
      if(item)result[name]=jsonToValue(field,item);else if(field.kind!=='optional')throw new Error(`Missing JSON field: ${name}`);
    }
    return result;
  }
  if(t.kind==='array'&&json.kind==='array')return json.items!.map(item=>jsonToValue(t.items,item));
  if(t.kind==='scalar'){
    if(t.name==='core.Decimal'||t.name==='core.Integer'){
      if(json.kind!=='number')throw new Error('Expected JSON number.');
      const exact=parseScalar('core.Decimal',expandNumber(json.raw)) as string;
      if(t.name==='core.Decimal')return exact;
      if(exact.includes('.'))throw new Error('Expected integer.');
      return parseScalar('core.Integer',Number(exact));
    }
    return parseScalar(t.name,JSON.parse(json.raw));
  }
  if(t.kind==='string'&&json.kind==='string')return JSON.parse(json.raw);
  throw new Error('JSON does not match target type.');
}
export function jsonFromValue(t:TypeRef,value:unknown):string {
  if(t.kind==='dictionary'){const errors=dictionaryKeys(value);if(errors.length)throw new Error(errors[0]!.message);return jsonFromValue(dictionaryShape(t.items),value);}
  if(t.kind==='nullable'||t.kind==='optional')return value===null?'null':jsonFromValue(t.inner,value);
  if(t.kind==='null')return 'null';
  if(t.kind==='array')return '['+(value as unknown[]).map(item=>jsonFromValue(t.items,item)).join(',')+']';
  if(t.kind==='object'){
    const record=value as Record<string,unknown>,fields:string[]=[];
    for(const [name,field] of Object.entries(t.fields)){
      if(Object.hasOwn(record,name))fields.push(JSON.stringify(name)+':'+jsonFromValue(field,record[name]));
      else if(field.kind!=='optional')throw new Error(`Missing field: ${name}`);
    }
    return '{'+fields.join(',')+'}';
  }
  if(t.kind==='scalar'){const parsed=parseScalar(t.name,value);return t.name==='core.Decimal'?parsed as string:JSON.stringify(parsed);}
  if(t.kind==='string'&&typeof value==='string')return JSON.stringify(value);
  throw new Error('Unsupported JSON value type.');
}
