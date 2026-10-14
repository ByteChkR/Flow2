import type {Catalog,Flow} from '@adam-flow/core/flow-core/index.js';
import type {ExecutionTrace} from '../runtime-browser/trace.js';

/** Invocation IDs distinguish concurrent calls of the same graph/node. */
export function activeNodeLabels(events:ExecutionTrace[],graphs:{id:string;name:string;flow:Flow}[],catalog:Catalog|undefined):string[] {
  const active=new Map<string,ExecutionTrace>();
  for(const event of events){
    if(event.kind!=='node'||!event.nodeId)continue;
    const key=JSON.stringify([event.invocationId,event.graphId,event.nodeId,event.environment]);
    if(event.status==='running')active.set(key,event);
    else if(['completed','failed','cancelled','skipped'].includes(event.status))active.delete(key);
  }
  return [...active.values()].map(event=>{
    const graph=graphs.find(item=>item.id===event.graphId);
    const node=graph?.flow.nodes.find(item=>item.id===event.nodeId);
    const label=catalog?.nodes.find(item=>item.type===node?.type&&item.version===node.typeVersion)?.metadata?.label??node?.type??event.nodeId;
    return `${graph?.name??event.graphId??'Flow'} · ${label} (${event.nodeId}) · ${event.environment==='browser'?'Frontend':'Backend'}`;
  });
}
