/** Transportable values used by process steps; no browser File objects cross runtime boundaries. */
export interface Option {id:string;label:string;description?:string;disabled?:boolean;required?:boolean}
export interface FlowFile {name:string;mimeType:string;size:number;content:string}
export function options(value:unknown):Option[]{
 if(!Array.isArray(value))throw new Error('Optionen müssen eine Liste sein.');
 const ids=new Set<string>();
 for(const item of value){if(!item||typeof item.id!=='string'||!item.id.trim()||typeof item.label!=='string'||!item.label.trim()||ids.has(item.id))throw new Error('Optionen benötigen eindeutige IDs und Beschriftungen.');ids.add(item.id);}
 return structuredClone(value);
}
export function validateOptions(items:Option[],selected:string[],multiple:boolean,required:boolean,checklist=false){
 if(new Set(selected).size!==selected.length||(!multiple&&selected.length>1)||selected.some(id=>!items.some(item=>item.id===id&&!item.disabled)))throw new Error('Ungültige Auswahl.');
 if(required&&!selected.length)throw new Error('Bitte mindestens eine Option auswählen.');
 if(checklist&&items.some(item=>item.required&&!item.disabled&&!selected.includes(item.id)))throw new Error('Bitte alle erforderlichen Punkte bestätigen.');
}
export function acceptsFile(file:Pick<FlowFile,'name'|'mimeType'>,accept:string):boolean {
 return !accept.trim()||accept.split(',').some(raw=>{const rule=raw.trim().toLowerCase();return rule.startsWith('.')?file.name.toLowerCase().endsWith(rule):rule.endsWith('/*')?file.mimeType.toLowerCase().startsWith(rule.slice(0,-1)):file.mimeType.toLowerCase()===rule;});
}
export function validateFiles(files:FlowFile[],accept:string,maxFiles:number,maxBytes:number,required:boolean){
 if(files.length>maxFiles)throw new Error(`Höchstens ${maxFiles} Dateien erlaubt.`);
 if(required&&!files.length)throw new Error('Bitte eine Datei auswählen.');
 for(const file of files){
  if(!file.name.trim()||!Number.isSafeInteger(file.size)||file.size<0||file.size>maxBytes)throw new Error('Datei ist ungültig oder zu groß.');
  if(!acceptsFile(file,accept))throw new Error(`Dateityp nicht erlaubt: ${file.name}`);
  if(file.content.length!==4*Math.ceil(file.size/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.content)||atob(file.content).length!==file.size)throw new Error('Ungültiger Dateiinhalt.');
 }
}
export async function readFiles(files:File[],accept:string,maxFiles:number,maxBytes:number,signal?:AbortSignal):Promise<FlowFile[]>{
 if(files.length>maxFiles)throw new Error(`Höchstens ${maxFiles} Dateien erlaubt.`);
 const result:FlowFile[]=[];
 for(const file of files){
  signal?.throwIfAborted();
  if(file.size>maxBytes||!acceptsFile({name:file.name,mimeType:file.type},accept))throw new Error(`Dateityp oder Größe nicht erlaubt: ${file.name}`);
  const bytes=new Uint8Array(await file.arrayBuffer());signal?.throwIfAborted();let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  result.push({name:file.name,mimeType:file.type||'application/octet-stream',size:file.size,content:btoa(binary)});
 }
 return result;
}
