import {dictionaryKeys,type DictionaryEntry} from '@adam-flow/core/flow-core/dictionaries.js';
import type {ValueNodeBinding} from '@adam-flow/core/flow-core/model.js';
export function executeDictionary(binding:ValueNodeBinding,inputs:Record<string,unknown>):Record<string,unknown>{
 const input=inputs[binding.operation==='dictCreate'?'entries':'dictionary'];
 // Create projects the declared entry fields just like a typed record/list boundary.
 const source=binding.operation==='dictCreate'&&Array.isArray(input)?input.map(entry=>Object.fromEntries(['key','value'].filter(name=>Object.hasOwn(entry,name)).map(name=>[name,entry[name]]))):input;
 const errors=dictionaryKeys(source);if(errors.length)throw new Error(errors[0]!.message);
 const entries=source as DictionaryEntry[],key=inputs.key as string;
 const index=entries.findIndex(entry=>entry.key===key),found=index!==-1;
 switch(binding.operation){
  case 'dictCreate':return {value:entries.map(entry=>({...entry}))};
  case 'dictGet':if(!found)throw new Error('Dictionary key not found: '+key);return {value:entries[index]!.value};
  case 'dictTryGet':return found?{found:true,value:entries[index]!.value}:{found:false};
  case 'dictContainsKey':return {value:found};
  case 'dictKeys':return {value:entries.map(entry=>entry.key)};
  case 'dictValues':return {value:entries.map(entry=>entry.value)};
  case 'dictRemove':return {value:entries.filter(entry=>entry.key!==key).map(entry=>({...entry})),removed:found};
  case 'dictSet':{
   const value=entries.map(entry=>({...entry}));
   if(found)value[index]={key,value:inputs.item};else value.push({key,value:inputs.item});
   return {value};
  }
  default:throw new Error('Unknown dictionary operation.');
 }
}
