import {defineNode,port,type AuthoredNode} from '../runtime-browser/authoring.js';
import casing from '@adam-flow/core/contracts/unicode-casing.json';
import {scalarNodes} from './scalars.js';
import type {ScalarName} from '@adam-flow/core/flow-core/scalars.js';

/** Codepoint indices never split a valid surrogate pair. Reject malformed UTF-16. */
export function characters(value:string):string[]{
 const result=Array.from(value);
 if(result.some(c=>c.length===1&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdfff))throw new Error('value: Invalid Unicode surrogate.');
 return result;
}
export function changeCase(value:string,operation:'lower'|'upper'):string {
 const table=casing[operation] as Record<string,string>;
 return characters(value).map(c=>table[String(c.codePointAt(0))]??c).join('');
}
const whitespace=/^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$/;
const integer=port.scalar('core.Integer'),bool=port.scalar('core.Bool'),text=port.string();
export const textNodes:AuthoredNode[]=[
 defineNode({type:'Standard.Text.Length',version:1,label:'Text Length',category:'Text',description:'Anzahl Unicode-Codepunkte. Ein Emoji zählt als ein Codepunkt, kombinierte Zeichen können mehrere enthalten.',inputs:{value:text},outputs:{value:integer},execute:({value})=>({value:characters(value).length})}),
 defineNode({type:'Standard.Text.Substring',version:1,label:'Substring',category:'Text',description:'Bereich mit nullbasiertem Codepunkt-Index und Länge. Grenzen werden strikt geprüft.',inputs:{value:text,index:integer,length:integer},outputs:{value:text},execute:({value,index,length})=>{
  const chars=characters(value);if(index<0||length<0||index>chars.length||length>chars.length-index)throw new Error('index/length: Text range out of bounds.');return {value:chars.slice(index,index+length).join('')};
 }}),
 defineNode({type:'Standard.Text.IndexOf',version:1,label:'Text Index Of',category:'Text',description:'Ordinaler Vergleich; Codepunkt-Index des ersten Treffers oder -1. start ist optional und nullbasiert.',inputs:{value:text,search:text,start:port.optional(integer)},outputs:{value:integer},execute:({value,search,start=0})=>{
  const chars=characters(value);characters(search);if(start<0||start>chars.length)throw new Error('start: Text index out of bounds.');
  const offset=chars.slice(0,start).join('').length,found=value.indexOf(search,offset);return {value:found<0?-1:characters(value.slice(0,found)).length};
 }}),
 defineNode({type:'Standard.Text.IsEmpty',version:1,label:'Text Is Empty',category:'Text',inputs:{value:text},outputs:{value:bool},execute:({value})=>({value:value.length===0})}),
 defineNode({type:'Standard.Text.IsNullOrWhiteSpace',version:1,label:'Is Null Or White Space',category:'Text',description:'Prüft null, leeren Text oder dieselben Leerzeichen wie Text Trim.',inputs:{value:port.nullable(text)},outputs:{value:bool},execute:({value})=>({value:value===null||whitespace.test(value)})}),
 defineNode({type:'Standard.Text.Split',version:1,label:'Split',category:'Text',description:'Literaler, nichtleerer Separator. Leere Teile bleiben erhalten, außer removeEmpty ist true.',inputs:{value:text,separator:text,removeEmpty:port.optional(bool)},outputs:{value:port.array(text)},execute:({value,separator,removeEmpty=false})=>{
  characters(value);characters(separator);if(separator==='')throw new Error('separator: Must not be empty.');const parts=value.split(separator);return {value:removeEmpty?parts.filter(p=>p!==''):parts};
 }}),
 ...(['lower','upper'] as const).map(operation=>defineNode({type:operation==='lower'?'Standard.Text.ToLower':'Standard.Text.ToUpper',version:1,label:operation==='lower'?'To Lower':'To Upper',category:'Text',description:'Unicode 16.0.0 pro Codepunkt; ohne Sprach- oder Kontextregeln. Mehrere Ergebniszeichen pro Codepunkt sind möglich.',inputs:{value:text},outputs:{value:text},execute:({value})=>({value:changeCase(value,operation)})}))
];
for(const name of ['Bool','Integer','Decimal','Guid','TimeSpan','DateTimeOffset'] as const){
 const parser=scalarNodes.find(n=>n.definition.type===`Standard.Convert.${name}.Parse`)!;
 textNodes.push(defineNode({type:`Standard.Convert.${name}.TryParse`,version:1,label:`Try Parse (${name})`,category:'Convert',description:'Verwendet denselben Parser wie Parse. Bei ungültigem Text: found=false, value fehlt.',inputs:{value:text},outputs:{found:bool,value:port.optional(port.scalar(`core.${name}` as ScalarName))},execute:async(values,context)=>{
  try{const parsed=await parser.execute(values,context);return {found:true,value:parsed.value as string|number|boolean};}catch{return {found:false};}
 }}));
}
