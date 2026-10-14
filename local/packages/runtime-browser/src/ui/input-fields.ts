import type {TypeRef} from '@adam-flow/core/flow-core/model.js';
import {parseScalar} from '@adam-flow/core/flow-core/scalars.js';
import {cellError} from './table-model.js';
export interface InputField {field:string;label?:string;helpText?:string;required?:boolean;min?:string;max?:string;minLength?:number;maxLength?:number;editor?:'value'|'dropdown'|'html';options?:{value:string;label:string}[]}
const text:TypeRef={kind:'string'},integer:TypeRef={kind:'scalar',name:'core.Integer'};
const optional=(inner:TypeRef):TypeRef=>({kind:'optional',inner});
export const inputFieldsType:TypeRef={kind:'array',items:{kind:'object',fields:{field:text,label:optional(text),helpText:optional(text),required:optional({kind:'scalar',name:'core.Bool'}),min:optional(text),max:optional(text),minLength:optional(integer),maxLength:optional(integer),editor:optional(text),options:optional({kind:'array',items:{kind:'object',fields:{value:text,label:text}}})}}};
export function baseType(type:TypeRef):TypeRef {while(type.kind==='optional'||type.kind==='nullable')type=type.inner;return type;}
export function parseFieldValue(type:TypeRef,value:string):unknown {
 type=baseType(type);
 if(type.kind==='string')return value;
 if(type.kind==='number'){if(!value.trim()||!Number.isFinite(Number(value)))throw new Error('Ungültige Zahl.');return Number(value);}
 if(type.kind==='boolean'||type.kind==='scalar'&&type.name==='core.Bool'){if(value!=='true'&&value!=='false')throw new Error('Bool-Auswahl benötigt true oder false.');return value==='true';}
 if(type.kind==='scalar'&&type.name==='core.Integer'&&!value.trim())throw new Error('Ganzzahl erforderlich.');
 if(type.kind==='scalar')return parseScalar(type.name,type.name==='core.Integer'?Number(value):value);
 throw new Error('Dropdowns unterstützen nur Text, Zahlen, Bool und skalare Werte.');
}
function compare(type:TypeRef,left:unknown,right:unknown):number {
 type=baseType(type);
 if(type.kind==='number'||type.kind==='scalar'&&type.name==='core.Integer')return Number(left)-Number(right);
 if(type.kind==='scalar'&&type.name==='core.DateTimeOffset'){
  const ticks=(value:unknown)=>{const text=String(value),match=/\.(\d+)(?=[+-])/.exec(text);return BigInt(Date.parse(text.replace(/\.\d+(?=[+-])/ ,'')))*10000n+BigInt((match?.[1]??'').padEnd(7,'0'));};
  const a=ticks(left),b=ticks(right);return a<b?-1:a>b?1:0;
 }
 const [lw,lf='']=String(left).split('.'),[rw,rf='']=String(right).split('.'),scale=Math.max(lf.length,rf.length);
 const a=BigInt(lw!+lf.padEnd(scale,'0')),b=BigInt(rw!+rf.padEnd(scale,'0'));return a<b?-1:a>b?1:0;
}
export function validateFieldOptions(type:TypeRef,field:Omit<InputField,'field'>):void {
 const base=baseType(type);
 if(field.editor!==undefined&&!['value','dropdown','html'].includes(field.editor))throw new Error('Unbekannter Feldeditor.');
 if(field.editor==='html'&&base.kind!=='string')throw new Error('HTML-Bearbeitung benötigt ein Textfeld.');
 if(field.options!==undefined&&field.editor!=='dropdown')throw new Error('Auswahloptionen benötigen den Dropdown-Editor.');
 if(field.editor==='dropdown'){
  if(!Array.isArray(field.options))throw new Error('Dropdown benötigt eine Optionsliste.');
  const values=new Set<string>();
  for(const option of field.options){if(typeof option.value!=='string'||typeof option.label!=='string'||!option.label.trim())throw new Error('Option benötigt Wert und Beschriftung.');const value=JSON.stringify(parseFieldValue(type,option.value));if(values.has(value))throw new Error('Dropdown-Werte müssen eindeutig sein.');values.add(value);}
 }
 if(field.min!==undefined||field.max!==undefined){
  if(base.kind!=='number'&&!(base.kind==='scalar'&&['core.Integer','core.Decimal','core.TimeSpan','core.DateTimeOffset'].includes(base.name)))throw new Error('Minimum/Maximum benötigen Zahl, Datum oder Dauer.');
  const min=field.min===undefined?undefined:parseFieldValue(type,field.min),max=field.max===undefined?undefined:parseFieldValue(type,field.max);
  if(min!==undefined&&max!==undefined&&compare(type,min,max)>0)throw new Error('Minimum darf nicht größer als Maximum sein.');
 }
 if(field.minLength!==undefined||field.maxLength!==undefined){
  if(!['string','array'].includes(base.kind))throw new Error('Längengrenzen benötigen Text oder Liste.');
  if([field.minLength,field.maxLength].some(n=>n!==undefined&&(!Number.isSafeInteger(n)||n<0)))throw new Error('Längengrenzen müssen nichtnegative ganze Zahlen sein.');
  if(field.minLength!==undefined&&field.maxLength!==undefined&&field.minLength>field.maxLength)throw new Error('Minimale Länge überschreitet maximale Länge.');
 }
}
export function resolveInputFields(type:TypeRef,value:unknown):InputField[]{
 if(type.kind!=='object'||!Array.isArray(value))throw new Error('Feldkonfiguration benötigt eine Liste und einen Record.');
 const names=new Set<string>();
 for(const field of value){
  if(!field||typeof field.field!=='string'||!Object.hasOwn(type.fields,field.field)||['__proto__','prototype','constructor'].includes(field.field))throw new Error('Unbekanntes Eingabefeld: '+String(field?.field));
  if(names.has(field.field))throw new Error('Feldkonfigurationen müssen eindeutig sein.');names.add(field.field);
  if(Object.keys(field).some(key=>!Object.hasOwn((inputFieldsType as {items:{fields:object}}).items.fields,key)))throw new Error('Unbekannte Feldoption.');
  if(['label','helpText','min','max','editor'].some(key=>field[key]!==undefined&&typeof field[key]!=='string')||field.required!==undefined&&typeof field.required!=='boolean')throw new Error('Ungültige Feldoption.');
  validateFieldOptions(type.fields[field.field]!,field);
 }
 // Explicit ordering first, remaining fields are never silently hidden.
 return [...value,...Object.keys(type.fields).filter(field=>!names.has(field)).map(field=>({field}))].map(field=>({label:field.field,required:!['optional','nullable'].includes(type.fields[field.field]!.kind),...structuredClone(field)}));
}
export function inputFieldError(type:TypeRef,value:unknown,field:Omit<InputField,'field'>):string {
 const error=cellError(type,value,field.required===true);if(error)return error;
 if(value===undefined||value===null)return '';
 if(field.editor==='dropdown'&&!field.options?.some(option=>Object.is(parseFieldValue(type,option.value),value)))return 'Bitte einen Wert aus der Auswahl wählen.';
 if(field.min!==undefined&&compare(type,value,parseFieldValue(type,field.min))<0)return `Minimum: ${field.min}.`;
 if(field.max!==undefined&&compare(type,value,parseFieldValue(type,field.max))>0)return `Maximum: ${field.max}.`;
 const length=typeof value==='string'?[...value].length:Array.isArray(value)?value.length:undefined;
 if(length!==undefined&&field.minLength!==undefined&&length<field.minLength)return `Mindestens ${field.minLength} Zeichen/Einträge erforderlich.`;
 if(length!==undefined&&field.maxLength!==undefined&&length>field.maxLength)return `Höchstens ${field.maxLength} Zeichen/Einträge erlaubt.`;
 return '';
}
