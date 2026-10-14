import type {ExecutionTrace} from '@adam-flow/runtime-browser/runtime-browser/trace.js';

export function performanceDuration(ms:number):string {
  if(!Number.isFinite(ms))return '—';
  if(ms===0)return '0 µs';
  if(ms<1)return `${(Math.max(0,ms)*1000).toLocaleString('de-DE',{maximumFractionDigits:1})} µs`;
  if(ms<1000)return `${ms.toLocaleString('de-DE',{maximumFractionDigits:2})} ms`;
  return `${(ms/1000).toLocaleString('de-DE',{maximumFractionDigits:3})} s`;
}
export function percentile(values:number[],p:number):number {
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]!;
}
/** Union in a single runtime's monotonic clock; overlapping child calls count only once. */
export function intervalUnion(intervals:[number,number][]):number {
  let total=0,end=-Infinity;
  for(const [start,stop] of [...intervals].sort((a,b)=>a[0]-b[0])){total+=Math.max(0,stop-Math.max(start,end));end=Math.max(end,stop);}
  return total;
}
/** Never subtract overlapping node/child durations from the graph wall time. */
export function summarizePerformance(events:ExecutionTrace[]) {
  const unique=[...new Map(events.map(event=>[`${event.environment}/${event.invocationId??''}/${event.id}`,event])).values()];
  const profiled=unique.filter(event=>event.kind==='profile');
  const childWaits=new Map<string,ExecutionTrace[]>();
  const ownerKey=(event:ExecutionTrace)=>JSON.stringify([event.environment,event.invocationId,event.nodeId]);
  for(const event of profiled.filter(event=>event.status==='childWait')){const key=ownerKey(event);const spans=childWaits.get(key)??[];spans.push(event);childWaits.set(key,spans);}
  const samples=unique.filter(event=>event.kind==='node'&&event.profile&&event.status!=='running');
  const rows=new Map<string,{key:string;graphId:string;nodeId:string;environment:string;count:number;failed:number;inputItems:number|null;childCalls:number;implementationMs:number;overheadMs:number;waitMs:number;childMs:number;selfMs:number;durations:number[]}>();
  for(const sample of samples){
    const key=JSON.stringify([sample.graphId,sample.nodeId,sample.environment]);
    const row=rows.get(key)??{key,graphId:sample.graphId??'',nodeId:sample.nodeId!,environment:sample.environment,count:0,failed:0,inputItems:null,childCalls:0,implementationMs:0,overheadMs:0,waitMs:0,childMs:0,selfMs:0,durations:[]};
    const start=sample.profile!.startMs??0,end=start+(sample.durationMs??0);
    const childMs=intervalUnion((childWaits.get(ownerKey(sample))??[]).map(event=>[Math.max(start,event.profile?.startMs??0),Math.min(end,(event.profile?.startMs??0)+(event.durationMs??0))] as [number,number]).filter(([a,b])=>b>a));
    row.childCalls+=(childWaits.get(ownerKey(sample))??[]).filter(event=>{const time=event.profile?.startMs;return time!==undefined&&time>=start&&time<=end;}).length;
    if(sample.profile!.inputItems!==undefined)row.inputItems=(row.inputItems??0)+sample.profile!.inputItems;
    row.childMs+=childMs;row.selfMs+=Math.max(0,(sample.profile!.implementationMs??0)-childMs-(sample.profile!.waitMs??0));
    row.count++;if(sample.status==='failed')row.failed++;
    row.implementationMs+=sample.profile!.implementationMs??0;row.overheadMs+=sample.profile!.overheadMs??0;row.waitMs+=sample.profile!.waitMs??0;
    row.durations.push(sample.durationMs??0);rows.set(key,row);
  }
  const segments=profiled.filter(event=>event.status==='segment');
  const sum=(items:ExecutionTrace[],key:string)=>items.reduce((total,event)=>total+(event.profile?.[key]??0),0);
  const run=profiled.findLast(event=>event.status==='run');
  return {samples,profiled,segments,rows:[...rows.values()].sort((a,b)=>b.overheadMs-a.overheadMs),runMs:run?.durationMs??null,
    count:samples.length,failed:samples.filter(event=>event.status==='failed').length,
    boundaries:unique.filter(event=>event.kind==='boundary'&&event.status==='transferred').length,
    inputBytes:sum(segments,'inputBytes'),outputBytes:sum(segments,'outputBytes'),
    scheduleMs:sum(segments,'scheduleMs'),decodeMs:sum(segments,'decodeMs'),encodeMs:sum(segments,'encodeMs'),
    cacheHits:sum(profiled,'cacheHits'),cacheMisses:sum(profiled,'cacheMisses')};
}
