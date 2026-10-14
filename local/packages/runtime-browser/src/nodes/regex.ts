import {defineNode,port,type AuthoredNode} from '../runtime-browser/authoring.js';
import program from '@adam-flow/core/contracts/regex-program.json';
export const regexProgram='var regexFold='+JSON.stringify(program.fold)+';\n'+program.lines.join('\n');
export interface RegexRequest {operation:'test'|'replace'|'extract';value:string;pattern:string;flags?:string;replacement?:string;timeoutMilliseconds?:number}
export function executeRegex(request:RegexRequest,signal?:AbortSignal):Promise<Record<string,unknown>> {
 const timeout=request.timeoutMilliseconds??100;
 if(!Number.isInteger(timeout)||timeout<1||timeout>5000)return Promise.reject(new Error('timeoutMilliseconds: Expected 1–5000.'));
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(new Blob([regexProgram+'\nonmessage=function(event){try{postMessage({result:runRegex(event.data)});}catch(error){postMessage({error:String(error.message||error)});}};postMessage({ready:true});'],{type:'text/javascript'}));
  let worker:Worker;try{worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);reject(error);return;}
  let timer:ReturnType<typeof setTimeout>,settled=false;
  function done(error?:unknown,result?:Record<string,unknown>){if(settled)return;settled=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);signal?.removeEventListener('abort',abort);if(error!==undefined)reject(error);else resolve(result!);}
  const abort=()=>done(signal?.reason??new DOMException('Aborted','AbortError'));
  signal?.addEventListener('abort',abort,{once:true});
  // Worker startup has its own bound; the requested budget starts after readiness.
  timer=setTimeout(()=>done(new Error('Regex worker startup timed out.')),10000);
  worker.onerror=event=>done(new Error(event.message||'Regex worker failed.'));
  worker.onmessage=event=>{
   if(event.data.ready){clearTimeout(timer);timer=setTimeout(()=>done(new Error('Regex execution timed out.')),timeout);worker.postMessage(JSON.stringify(request));return;}
   if(event.data.error){done(new Error(event.data.error));return;}
   try{done(undefined,JSON.parse(event.data.result));}catch(error){done(error);}
  };
  if(signal?.aborted)abort();
 });
}
const text=port.string(),integer=port.scalar('core.Integer');
const match=port.object({value:text,index:integer,length:integer,groups:port.array(port.nullable(text))});
export const regexNodes:AuthoredNode[]=(['test','replace','extract'] as const).map(operation=>defineNode({
 type:`Standard.Text.Regex.${operation[0]!.toUpperCase()+operation.slice(1)}`,version:1,label:`Regex ${operation}`,category:'Text/Regex',
 description:'Portabler ECMAScript-Teilumfang mit Unicode-16-Faltung. Keine Rückreferenzen, benannten Gruppen, Lookbehinds, Unicode-Properties oder Wiederholung von Capture-Gruppen. Flags i/m/s optional. Default-Zeitlimit 100 ms, maximal 5000 ms; maximal 10000 Treffer. Extract liefert Codepunkt-Indizes und null für nicht beteiligte Gruppen. Replace unterstützt $$, $& und $1–$99.',
 inputs:{value:text,pattern:text,flags:port.optional(text),timeoutMilliseconds:port.optional(integer),...(operation==='replace'?{replacement:text}:{})},
 outputs:{value:operation==='test'?port.scalar('core.Bool'):operation==='replace'?text:port.array(match)},
 execute:async(inputs,context)=>executeRegex({...inputs,operation} as RegexRequest,context.signal) as Promise<{value:any}>
}));
