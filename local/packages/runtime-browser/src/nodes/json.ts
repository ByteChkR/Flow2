import {defineNode,port,type AuthoredNode} from '../runtime-browser/authoring.js';
import {jsonValueType,wrapJson,unwrapJson,stringifyJson} from '@adam-flow/core/flow-core/json-values.js';
const json=port.custom<{json:string}>(jsonValueType);
const description='JSON-Dokument als Record mit json-Text. Erhält Zahlenpräzision. Maximal 4.194.304 Zeichen und 64 Ebenen, keine doppelten Feldnamen.';
export const jsonNodes:AuthoredNode[]=[
 defineNode({type:'Standard.JSON.Parse',version:1,label:'JSON Parse',category:'JSON',description,inputs:{text:port.string()},outputs:{value:json},execute:({text})=>({value:wrapJson(text)})}),
 defineNode({type:'Standard.JSON.Stringify',version:1,label:'JSON Stringify',category:'JSON',description,inputs:{value:json},outputs:{value:port.string()},execute:({value})=>({value:stringifyJson(unwrapJson(value))})}),
 defineNode({type:'Standard.JSON.GetField',version:1,label:'JSON Get Field',category:'JSON',description,inputs:{value:json,name:port.string()},outputs:{value:port.optional(json)},execute:({value,name})=>{
   const object=unwrapJson(value);if(object.kind!=='object')throw new Error('Expected JSON object.');
   const field=object.fields!.get(name);return field?{value:wrapJson(field.raw)}:{};
 }}),
 defineNode({type:'Standard.JSON.SetField',version:1,label:'JSON Set Field',category:'JSON',description,inputs:{value:json,name:port.string(),field:json},outputs:{value:json},execute:({value,name,field})=>{
   const object=unwrapJson(value);if(object.kind!=='object')throw new Error('Expected JSON object.');
   // Match backend insertion order, including replacement of an existing field.
   object.fields!.delete(name);object.fields!.set(name,unwrapJson(field));return {value:wrapJson(stringifyJson(object))};
 }})
];

/** JSON Pointer-style segments. Empty path addresses the root; no wildcard expansion. */
export function jsonPathSegments(path:string):string[]{
 if(path==='')return [];
 if(!path.startsWith('/')||/~(?:[^01]|$)/.test(path))throw new Error('path: Expected /-separated segments with ~0 and ~1 escapes.');
 return path.slice(1).split('/').map(segment=>segment.replace(/~1/g,'/').replace(/~0/g,'~'));
}
const found=port.scalar('core.Bool');
jsonNodes.push(
 defineNode({type:'Standard.JSON.TryParse',version:1,label:'JSON Try Parse',category:'JSON',description,inputs:{text:port.string()},outputs:{found,value:port.optional(json)},execute:({text})=>{
  try{return {found:true,value:wrapJson(text)};}catch{return {found:false};}
 }}),
 defineNode({type:'Standard.JSON.HasField',version:1,label:'JSON Has Field',category:'JSON',description,inputs:{value:json,name:port.string()},outputs:{value:found},execute:({value,name})=>{
  const object=unwrapJson(value);if(object.kind!=='object')throw new Error('Expected JSON object.');return {value:object.fields!.has(name)};
 }}),
 defineNode({type:'Standard.JSON.RemoveField',version:1,label:'JSON Remove Field',category:'JSON',description,inputs:{value:json,name:port.string()},outputs:{value:json,removed:found},execute:({value,name})=>{
  const object=unwrapJson(value);if(object.kind!=='object')throw new Error('Expected JSON object.');const removed=object.fields!.delete(name);return {value:wrapJson(stringifyJson(object)),removed};
 }}),
 defineNode({type:'Standard.JSON.GetPath',version:1,label:'JSON Get Path',category:'JSON',description:description+' Pfad: /items/0/name, ~0 für ~ und ~1 für /. Leerer Pfad liefert das gesamte Dokument; fehlende Werte ergeben found=false.',inputs:{value:json,path:port.string()},outputs:{found,value:port.optional(json)},execute:({value,path})=>{
  let part:ReturnType<typeof unwrapJson>|undefined=unwrapJson(value);
  for(const segment of jsonPathSegments(path)){
   if(part?.kind==='object')part=part.fields!.get(segment);
   else if(part?.kind==='array')part=/^(0|[1-9][0-9]*)$/.test(segment)&&segment.length<=10?part.items![Number(segment)]:undefined;
   else part=undefined;
  }
  return part?{found:true,value:wrapJson(part.raw)}:{found:false};
 }})
);
