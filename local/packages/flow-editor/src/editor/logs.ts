import type {ExecutionTrace} from '@adam-flow/runtime-browser/runtime-browser/trace.js';
export interface LogEntry {id:string;timestamp:string;environment:'server'|'browser';level:string;nodeId?:string;label:string;message:string}
/** Polling can replay server events; keep one chronological entry per origin and event ID. */
export function appendLog(entries:LogEntry[],event:ExecutionTrace,label?:string):LogEntry[]{
  if(event.kind!=='log'||entries.some(entry=>entry.id===`${event.environment}/${event.id}`))return entries;
  const entry:LogEntry={id:`${event.environment}/${event.id}`,timestamp:event.timestamp,environment:event.environment,level:event.status,
    label:label??event.nodeId??'Flow',message:event.message??'',...(event.nodeId?{nodeId:event.nodeId}:{})};
  return [...entries,entry].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
}
