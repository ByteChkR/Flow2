import {performanceDuration} from './performance.js';
import type { Flow } from '@adam-flow/core/flow-core/index.js';
import type { ExecutionTrace } from '@adam-flow/runtime-browser/runtime-browser/trace.js';
import type { ExecutionFailure } from '@adam-flow/runtime-browser/runtime-browser/orchestrator.js';

export type NodeStatus='queued'|'running'|'completed'|'failed'|'cancelled'|'skipped';
export interface NodeDebug {
  status:NodeStatus;
  environment:string;
  startedAt?:number;
  timestamp?:string;
  durationMs?:number;
  message?:string;
  profile?:Record<string,number>;
}
export type NodeDebugMap=Record<string,NodeDebug>;
export const nodeStatusLabels:Record<NodeStatus,string>={queued:'Wartet',running:'Läuft',completed:'Abgeschlossen',failed:'Fehlgeschlagen',cancelled:'Abgebrochen',skipped:'Nicht ausgeführt'};
export function startDebug(flow:Flow,skippedNodeIds:string[]=[]):NodeDebugMap {
  return Object.fromEntries(flow.nodes.map(node=>[node.id,{status:skippedNodeIds.includes(node.id)?'skipped':'queued',environment:node.environment}]));
}
export function traceDebug(nodes:NodeDebugMap,event:ExecutionTrace,now:number):NodeDebugMap {
  if(event.kind!=='node'||!event.nodeId)return nodes;
  const previous=nodes[event.nodeId];
  if(!previous||event.environment!==previous.environment||!['running','completed','failed'].includes(event.status))return nodes;
  if(!['queued','running'].includes(previous.status))return nodes;
  const next:NodeDebug={...previous,status:event.status as NodeStatus};
  if(event.status==='running'&&previous.startedAt===undefined){next.startedAt=now;next.timestamp=event.timestamp;}
  if(event.durationMs!=null)next.durationMs=event.durationMs;
  if(event.message)next.message=event.message;
  if(event.profile)next.profile=event.profile;
  return {...nodes,[event.nodeId]:next};
}
export function finishDebug(nodes:NodeDebugMap,outcome:'completed'|'failed'|'cancelled',now:number,error?:ExecutionFailure|null):NodeDebugMap {
  return Object.fromEntries(Object.entries(nodes).map(([id,node])=>{
    if(node.status==='completed')return [id,node];
    if(outcome==='cancelled'&&(node.status==='running'||node.status==='failed'))
      return [id,{...node,status:'cancelled',message:'Ausführung abgebrochen.',durationMs:node.durationMs??(node.startedAt===undefined?0:now-node.startedAt)}];
    if(node.status==='failed')return [id,node];
    if(error?.nodeId===id||node.status==='running')return [id,{...node,status:outcome==='completed'?'completed':'failed',
      durationMs:node.durationMs??(node.startedAt===undefined?0:now-node.startedAt),...(error?{message:error.message}:{})}];
    return [id,{...node,status:'skipped'}];
  }));
}
export function durationLabel(milliseconds:number):string {
  if(milliseconds<1)return performanceDuration(milliseconds);
  return milliseconds<1000?`${Math.max(0,Math.round(milliseconds))} ms`:`${(milliseconds/1000).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})} s`;
}
