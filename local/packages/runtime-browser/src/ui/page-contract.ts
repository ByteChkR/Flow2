import {validateFieldOptions,inputFieldError,type InputField} from './input-fields.js';
import {options,validateOptions,validateFiles,type FlowFile} from './step-values.js';
import {resolveColumns,validateTable,type TablePanel} from './table-model.js';
import type {TypeRef} from '@adam-flow/core/flow-core/model.js';
import {TypeRegistry,validateValue} from '@adam-flow/core/flow-core/types.js';
import {pageConfigErrors} from '@adam-flow/core/flow-core/page-schema.js';
export interface PagePanel {type:string;[key:string]:unknown}
export interface PageConfig {id?:string;name:string;content:{panelColumns?:string;full?:boolean;panels:PagePanel[]};[key:string]:unknown}
export function requirePage(value:unknown):PageConfig {
  const errors=pageConfigErrors(value);if(errors.length)throw new Error(errors.map(e=>e.path+': '+e.message).join('\n'));
  return structuredClone(value) as PageConfig;
}
export function fieldType(type:TypeRef,path:unknown):TypeRef {
  if(!Array.isArray(path)||!path.length||path.some(p=>typeof p!=='string'||['__proto__','prototype','constructor'].includes(p)))throw new Error('Ungültiger Feldpfad.');
  for(const key of path){while(type.kind==='optional'||type.kind==='nullable')type=type.inner;if(type.kind!=='object'||!Object.hasOwn(type.fields,key))throw new Error('Unbekanntes Feld: '+path.join('.'));type=type.fields[key]!;}
  return type;
}
export function readField(data:Record<string,unknown>,path:string[]):unknown {let value:unknown=data;for(const key of path){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=(value as Record<string,unknown>)[key];}return value;}
export function writeField(data:Record<string,unknown>,path:string[],value:unknown):Record<string,unknown>{
  const next=structuredClone(data);let target=next;
  for(const key of path.slice(0,-1)){if(!target[key]||typeof target[key]!=='object')target[key]={};target=target[key] as Record<string,unknown>;}
  const last=path.at(-1)!;if(value===undefined)delete target[last];else target[last]=value;return next;
}
export function panels(page:PageConfig):PagePanel[]{
  const all:PagePanel[]=[];
  function visit(value:unknown){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}const record=value as Record<string,unknown>;if(typeof record.type==='string'&&record.type.startsWith('Flow'))all.push(record as PagePanel);Object.values(record).forEach(visit);}
  visit(page.content.panels);return all;
}
export function validatePageBindings(page:PageConfig,type:TypeRef):void {
  if(type.kind!=='object')throw new Error('Page-Daten benötigen einen Record.');
  const ids=new Set<string>();
  for(const panel of panels(page)){
    if(panel.field){const field=fieldType(type,panel.field);let actual=field;while(actual.kind==='optional'||actual.kind==='nullable')actual=actual.inner;
      if(panel.type==='FlowField')validateFieldOptions(field,panel as Omit<InputField,'field'>);
      if(panel.type==='FlowOptions'){
        if(actual.kind!=='array'||actual.items.kind!=='string')throw new Error('Optionsauswahl benötigt eine String-Liste.');
        options(panel.options);
      }
      if(panel.type==='FlowSignature'&&actual.kind!=='string')throw new Error('Unterschrift benötigt ein String-Feld.');
      if(panel.type==='FlowFiles'){
        if(actual.kind!=='array'||actual.items.kind!=='object')throw new Error('Dateiauswahl benötigt eine Datei-Liste.');
        const fields=actual.items.fields;
        if(['name','mimeType','content'].some(key=>fields[key]?.kind!=='string')||fields.size?.kind!=='scalar'||fields.size.name!=='core.Integer')throw new Error('Dateien benötigen Name, MIME-Typ, Base64-Inhalt und Integer-Größe.');
      }
      if(panel.type==='FlowTable'){
        if(actual.kind!=='array'||actual.items.kind!=='object')throw new Error('Tabelle benötigt eine Record-Liste.');
        resolveColumns(actual.items,panel.columns);
        const selection=fieldType(type,panel.selectionField);if(selection.kind!=='array'||selection.items.kind!=='scalar'||selection.items.name!=='core.Integer')throw new Error('Tabellenauswahl benötigt eine Integer-Liste.');
      }
      if(panel.type==='FlowSearch'){const expected=panel.multiple?actual.kind==='array'&&actual.items.kind==='scalar'&&actual.items.name==='core.Guid':actual.kind==='scalar'&&actual.name==='core.Guid';if(!expected)throw new Error('Suchauswahl benötigt Guid bzw. Guid-Liste.');}
      if(panel.type==='FlowDetails'&&(actual.kind!=='scalar'||actual.name!=='core.Guid'))throw new Error('Details benötigen ein Guid-Feld.');
    }
    if(panel.dataField)fieldType(type,panel.dataField);
    const actions=panel.type==='FlowActions'?panel.buttons as {id:string}[]:panel.type==='FlowDetails'&&panel.action?[{id:panel.action as string}]:[];
    for(const action of actions){
      for(const key of ['visibleField','disabledField']){const path=(action as unknown as Record<string,unknown>)[key];if(path){const value=fieldType(type,path);if(value.kind!=='scalar'||value.name!=='core.Bool')throw new Error('Aktionszustand benötigt ein Bool-Feld.');}}if(!action.id||action.id==='cancel'||ids.has(action.id))throw new Error('Aktions-IDs müssen eindeutig sein; cancel ist reserviert.');ids.add(action.id);}
  }
}
export interface PageAction {id:string;label?:string;icon?:string;disabled?:boolean;visible?:boolean;disabledField?:string[];visibleField?:string[]}
export function resolveAction(action:PageAction,data:Record<string,unknown>):PageAction{return {...action,disabled:action.disabledField?readField(data,action.disabledField)!==false:action.disabled??false,visible:action.visibleField?readField(data,action.visibleField)===true:action.visible??true};}
export function actions(page:PageConfig,data:Record<string,unknown>={}):PageAction[]{return panels(page).flatMap(p=>p.type==='FlowActions'?p.buttons as PageAction[]:p.type==='FlowDetails'&&p.action?[{id:p.action as string}]:[]).map(a=>resolveAction(a,data));}

export function requireData(type:TypeRef,data:unknown):Record<string,unknown>{const errors=validateValue(type,data,new TypeRegistry({schemaVersion:1,types:[]}));if(errors.length)throw new Error(errors.map(e=>e.path+': '+e.message).join('\n'));return project(type,data) as Record<string,unknown>;}
function project(type:TypeRef,value:unknown):unknown {
 if(value===undefined||value===null)return value;
 if(type.kind==='optional'||type.kind==='nullable')return project(type.inner,value);
 if(type.kind==='object')return Object.fromEntries(Object.entries(type.fields).filter(([key])=>Object.hasOwn(value as object,key)).map(([key,child])=>[key,project(child,(value as Record<string,unknown>)[key])]));
 if(type.kind==='array')return (value as unknown[]).map(item=>project(type.items,item));
 return structuredClone(value);
}

export function validatePageData(page:PageConfig,data:Record<string,unknown>,type?:TypeRef):void {for(const panel of panels(page)){if(panel.type==='FlowField'&&type){const error=inputFieldError(fieldType(type,panel.field),readField(data,panel.field as string[]),panel as Omit<InputField,'field'>);if(error)throw new Error(String(panel.label??(panel.field as string[]).join('.'))+': '+error);continue;}if(panel.type==='FlowOptions'){validateOptions(options(panel.options),readField(data,panel.field as string[]) as string[],panel.multiple===true,panel.required===true,panel.checklist===true);continue;}if(panel.type==='FlowFiles'){validateFiles(readField(data,panel.field as string[]) as FlowFile[],String(panel.accept),Number(panel.maxFiles),Number(panel.maxBytes),panel.required===true);continue;}if(panel.type==='FlowSignature'){const image=readField(data,panel.field as string[]);if(image!==undefined&&(typeof image!=='string'||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(image)))throw new Error('Ungültige Unterschrift.');}if(panel.type==='FlowTable'){validateTable(panel as unknown as TablePanel,data);continue;}if(!panel.required||!panel.field)continue;const value=readField(data,panel.field as string[]);if(value===undefined||value===null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length)throw new Error(String(panel.label??(panel.field as string[]).join('.'))+': Wert erforderlich.');}}
