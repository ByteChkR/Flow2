import axios from 'axios';
export interface TemplateOption {Id:string;Name:string;Entity?:string|null;Type?:string;VorlagenGruppeId?:string|null;StandardVorlage?:boolean}
export interface TemplateGroupOption {Id:string;Name:string}
export interface TemplateOptions {templates:TemplateOption[];groups:TemplateGroupOption[]}
let cached:Promise<TemplateOptions>|undefined;
/** Shared metadata only; never fetch template bodies for the node palette. */
export function loadTemplateOptions():Promise<TemplateOptions>{
 if(cached)return cached;
 async function pages<T>(entity:string,select:string):Promise<T[]>{
  const result:T[]=[];const size=200;
  for(let position=0;;position+=size){
   const response=await axios.get(`/${entity}/search`,{params:{select,orderby:'Name, Id',position,rowCount:size}});
   const rows=response.data?.resultSet;
   if(!Array.isArray(rows))throw new Error('Ungültige Antwort beim Laden der Vorlagen.');
   result.push(...rows);
   if(rows.length<size)return result;
  }
 }
 const request=Promise.all([pages<TemplateOption>('vorlage','Id, Name, Entity, Type, VorlagenGruppeId, StandardVorlage'),pages<TemplateGroupOption>('vorlagengruppe','Id, Name')]).then(([templates,groups])=>({templates,groups}));
 cached=request;void request.then(()=>{if(cached===request)cached=undefined;},()=>{if(cached===request)cached=undefined;});return request;
}
