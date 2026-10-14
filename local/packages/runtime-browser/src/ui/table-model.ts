import type {TypeRef} from '@adam-flow/core/flow-core/model.js';
import {TypeRegistry,validateValue} from '@adam-flow/core/flow-core/types.js';
export interface TableColumn {field:string;label?:string;readonly?:boolean;required?:boolean;width?:number}
export interface TablePanel {field:string[];selectionField:string[];columns:TableColumn[];editable:boolean;selection:'none'|'single'|'multiple';required:boolean;pageSize:number}
let registry:TypeRegistry|undefined;
export function resolveColumns(type:TypeRef,value:unknown):TableColumn[]{
  if(type.kind!=='object')throw new Error('Tabellen benötigen einen Record als Zeilentyp.');
  if(!Array.isArray(value))throw new Error('Spalten müssen eine Liste sein.');
  const columns=value.length?value:Object.keys(type.fields).map(field=>({field}));
  const names=new Set<string>();
  for(const column of columns){
    if(!column||typeof column!=='object'||typeof column.field!=='string'||!Object.hasOwn(type.fields,column.field)||['__proto__','prototype','constructor'].includes(column.field))throw new Error('Unbekanntes Tabellenfeld: '+String(column?.field));
    if(names.has(column.field))throw new Error('Tabellenspalten müssen eindeutig sein.');names.add(column.field);
    if(Object.keys(column).some(key=>!['field','label','readonly','required','width'].includes(key)))throw new Error('Unbekannte Spaltenoption.');
    if(column.label!==undefined&&typeof column.label!=='string'||column.readonly!==undefined&&typeof column.readonly!=='boolean'||column.required!==undefined&&typeof column.required!=='boolean')throw new Error('Ungültige Spaltenoption.');
    if(column.width!==undefined&&(!Number.isInteger(column.width)||column.width<60||column.width>1200))throw new Error('Spaltenbreite muss zwischen 60 und 1200 liegen.');
  }
  return structuredClone(columns);
}
export function cellError(type:TypeRef,value:unknown,required=false):string {
  if(required&&(value===undefined||value===null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length))return 'Wert erforderlich.';
  return validateValue(type,value,registry??=new TypeRegistry({schemaVersion:1,types:[]})).map(e=>e.message).join('; ');
}
export function readPath(data:Record<string,unknown>,path:string[]):unknown {let value:unknown=data;for(const key of path){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=(value as Record<string,unknown>)[key];}return value;}
export function validateSelection(indices:unknown,count:number,selection:TablePanel['selection'],required=false):asserts indices is number[]{
  if(!Array.isArray(indices)||indices.some(index=>!Number.isInteger(index)||index<0||index>=count)||new Set(indices).size!==indices.length)throw new Error('Ungültige Zeilenauswahl.');
  if(selection==='none'&&indices.length||selection==='single'&&indices.length>1)throw new Error('Unzulässige Anzahl ausgewählter Zeilen.');
  if(required&&selection!=='none'&&!indices.length)throw new Error('Bitte mindestens eine Zeile auswählen.');
}
export function validateTable(panel:TablePanel,data:Record<string,unknown>):void {
  const rows=readPath(data,panel.field);if(!Array.isArray(rows))throw new Error('Tabellenzeilen fehlen.');
  validateSelection(readPath(data,panel.selectionField),rows.length,panel.selection,panel.required);
  for(const [index,row] of rows.entries())for(const column of panel.columns)if(column.required){
    const value=row[column.field];if(value===undefined||value===null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length)throw new Error(`Zeile ${index+1}, ${column.label??column.field}: Wert erforderlich.`);
  }
}
function equal(a:unknown,b:unknown):boolean {
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
  return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.hasOwn(right,key)&&equal(left[key],right[key]));
}
/** The host checks the entire result, including filtered-out rows and noneditable fields. */
export function validateTableChanges(panel:TablePanel,before:Record<string,unknown>,after:Record<string,unknown>,rowType:TypeRef):void {
  const original=readPath(before,panel.field) as Record<string,unknown>[],rows=readPath(after,panel.field) as Record<string,unknown>[];
  if(!Array.isArray(rows)||rows.length!==original.length)throw new Error('Die Anzahl der Tabellenzeilen darf nicht geändert werden.');
  const editable=new Set(panel.editable?resolveColumns(rowType,panel.columns).filter(c=>!c.readonly).map(c=>c.field):[]);
  for(let index=0;index<rows.length;index++){
    const old=original[index]!,row=rows[index]!;
    for(const key of new Set([...Object.keys(old),...Object.keys(row)]))if(!editable.has(key)&&(!equal(old[key],row[key])||Object.hasOwn(old,key)!==Object.hasOwn(row,key)))throw new Error(`Zeile ${index+1}: ${key} ist schreibgeschützt.`);
  }
}
export function cellText(value:unknown):string {return value===undefined?'—':value===null?'null':typeof value==='object'?JSON.stringify(value):typeof value==='boolean'?value?'Ja':'Nein':String(value);}
function compare(a:unknown,b:unknown,type:TypeRef):number {
  if(a===b)return 0;if(a===undefined)return -1;if(b===undefined)return 1;if(a===null)return -1;if(b===null)return 1;
  while(type.kind==='optional'||type.kind==='nullable')type=type.inner;
  if(type.kind==='scalar'&&['core.Decimal','core.TimeSpan'].includes(type.name)){
    const pattern=/^-?\d+(?:\.\d+)?$/;if(pattern.test(String(a))&&pattern.test(String(b))){const [aw,af='']=String(a).split('.'),[bw,bf='']=String(b).split('.');const scale=Math.max(af.length,bf.length);const x=BigInt(aw!+af.padEnd(scale,'0')),y=BigInt(bw!+bf.padEnd(scale,'0'));return x<y?-1:x>y?1:0;}
  }
  if(typeof a==='number'&&typeof b==='number')return a-b;
  if(typeof a==='boolean'&&typeof b==='boolean')return Number(a)-Number(b);
  if(type.kind==='scalar'&&type.name==='core.DateTimeOffset'){const x=Date.parse(String(a)),y=Date.parse(String(b));if(Number.isFinite(x)&&Number.isFinite(y))return x-y;}
  return cellText(a).localeCompare(cellText(b),'de',{numeric:true,sensitivity:'base'});
}
export function tableView(rows:Record<string,unknown>[],type:TypeRef,filters:Record<string,string>,sortField:string,direction:number){
  const fields=type.kind==='object'?type.fields:{};
  const result=rows.map((row,index)=>({row,index})).filter(({row})=>Object.entries(filters).every(([key,filter])=>!filter||cellText(row[key]).toLocaleLowerCase('de').includes(filter.toLocaleLowerCase('de'))));
  if(fields[sortField])result.sort((a,b)=>direction*compare(a.row[sortField],b.row[sortField],fields[sortField]! )||a.index-b.index);
  return result;
}
