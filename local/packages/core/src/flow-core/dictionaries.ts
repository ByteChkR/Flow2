import type {Diagnostic,TypeRef} from './model.js';

/** Ordered entries avoid object-key coercion and integer-property reordering. */
export interface DictionaryEntry {key:string;value:unknown}
export function dictionaryShape(items:TypeRef):TypeRef {
  return {kind:'array',items:{kind:'object',fields:{key:{kind:'string'},value:items}}};
}
export function dictionaryKeys(value:unknown,path=''):Diagnostic[] {
  const fail=(message:string,at=path):Diagnostic[]=>[{code:'value_type',path:at,message}];
  if(!Array.isArray(value))return fail('Expected dictionary entries.');
  const keys=new Set<string>();
  for(let i=0;i<value.length;i++){
    const entry=value[i];
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).length!==2||!Object.hasOwn(entry,'key')||!Object.hasOwn(entry,'value')||typeof entry.key!=='string')return fail('Expected dictionary entry { key, value }.',`${path}/${i}`);
    if(keys.has(entry.key))return fail('Duplicate dictionary key: '+entry.key,`${path}/${i}/key`);
    keys.add(entry.key);
  }
  return [];
}
