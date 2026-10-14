import type {FlowInterface} from '@adam-flow/core/flow-core/index.js';
const inputs=new Map<string,{signature:string;value:unknown}[]>();
export function rememberInputs(id:string,signature:FlowInterface['inputs'],values:Record<string,unknown>):void {
 inputs.set(id,signature.filter(p=>Object.hasOwn(values,p.nodeId)).map(p=>({signature:JSON.stringify([p.nodeId,p.name,p.type]),value:structuredClone(values[p.nodeId])})));
}
export function restoreInputs(id:string,signature:FlowInterface['inputs']):Record<string,unknown> {
 return Object.fromEntries(signature.flatMap(p=>{const entry=inputs.get(id)?.find(e=>e.signature===JSON.stringify([p.nodeId,p.name,p.type]));return entry?[[p.nodeId,structuredClone(entry.value)]]:[];}));
}
export function readPreference(key:string):unknown {try{return JSON.parse(localStorage.getItem(`flow2.editor.${key}`)??'null');}catch{return null;}}
export function writePreference(key:string,value:unknown):void {try{localStorage.setItem(`flow2.editor.${key}`,JSON.stringify(value));}catch{/* Browser storage may be disabled. */}}
