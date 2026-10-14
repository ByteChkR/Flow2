import {fixture} from './flows.js';
import {createStandardRegistry} from '@adam-flow/runtime-browser/registry.js';
import {FlowWorkspace} from '@adam-flow/runtime-browser/runtime-browser/workspace.js';
import {summarizePerformance} from '@adam-flow/editor/editor/performance.js';
import {canonicalJson} from '@adam-flow/core/flow-core/transport.js';
import type {SubgraphOptimizations} from '@adam-flow/runtime-browser/runtime-browser/orchestrator.js';

export async function run(config:{caseId:string;size:number;mode:string;flags:SubgraphOptimizations;profiling:boolean;samples:number;warmups:number;timeout:number}){
 let requests=0,sent=0,received=0;
 const fetcher:typeof fetch=async(path,init={})=>{
  if(config.mode==='browser')throw new Error('Local run attempted a backend request');
  requests++;sent+=new TextEncoder().encode(typeof init.body==='string'?init.body:'').length;
  const response=await fetch(String(path),init);const text=await response.text();received+=new TextEncoder().encode(text).length;
  if(!response.ok)throw new Error(`HTTP ${response.status} ${path}: ${text}`);
  return new Response(response.status===204?null:text,{status:response.status,headers:response.headers});
 };
 const host=new FlowWorkspace(createStandardRegistry,fetcher,changed=>{const timer=setInterval(changed,25);return ()=>clearInterval(timer);});
 if(config.mode==='browser')host.loadLocal();else await host.load();
 const example=fixture(config.caseId,config.size);
 const graphs=[example.flow,...example.children].map(g=>({...g,mode:config.mode==='backend'?'backend' as const:g.mode,nodes:g.nodes.map((n,index)=>({...n,environment:config.mode==='backend'?'server' as const:config.mode==='mixed'&&(config.caseId==='pingpong'?n.id.startsWith('step_')&&Number(n.id.slice(5))%2===0:n.id==='operation'||n.id==='call'||n.id==='sum'||n.id.startsWith('step_')&&index%2===0)?'server' as const:'browser' as const}))}));
 const bundle={schemaVersion:1 as const,rootGraphId:example.flow.id,graphs};
 if(config.mode==='mixed')for(let i=0;i<graphs.length;i++){
  const original=graphs[i]!;let connected={...original,connections:[] as typeof original.connections};
  for(const e of original.connections)connected=host.connect(connected,e.source,e.target,e.kind,bundle);
  graphs[i]=connected;
 }
 await (window as any).benchFixture({bundle,inputs:example.inputs,expected:example.expected});
 for(let run=0;run<1+config.warmups+config.samples;run++){
  const phase=run===0?'cold':run<=config.warmups?'warmup':'warm';
  requests=sent=received=0;const events:any[]=[];const started=performance.now();
  let row:any;
  try{
   const result=await host.run(JSON.stringify(graphs[0]),{bundle,inputs:example.inputs,executionMode:config.mode==='browser'?'local':'coordinated',profiling:config.profiling,subgraphOptimizations:config.flags,onTrace:e=>events.push(e),signal:AbortSignal.timeout(config.timeout)});
   const wallMs=performance.now()-started;
   if(result.state!=='completed')throw new Error(JSON.stringify(result.error??result.state));
   if(canonicalJson(result.outputs)!==canonicalJson(example.expected))throw new Error(`Output mismatch: ${JSON.stringify(result.outputs)}`);
   const report=summarizePerformance(result.events??events);
   const sum=(key:'selfMs'|'overheadMs')=>report.rows.reduce((n,r)=>n+r[key],0);
   row={status:'passed',wallMs,selfMs:config.profiling?sum('selfMs'):null,systemMs:config.profiling?sum('overheadMs'):null,selfSystemMs:config.profiling?sum('selfMs')+sum('overheadMs'):null,nodeExecutions:config.profiling?report.count:null,segments:config.profiling?report.segments.length:null,childCalls:config.profiling?report.rows.reduce((n,r)=>n+r.childCalls,0):null,preparationMs:config.profiling?report.profiled.filter(e=>e.status==='preparation'||e.status==='subgraphPreparation').reduce((n,e)=>n+(e.durationMs??0),0):null};
   await (window as any).benchTrace(run,config.profiling?result.events??events:[]);
  }catch(error){const message=error instanceof Error?error.message:String(error);row={status:/timeout|timed out/i.test(message)||error instanceof DOMException&&error.name==='TimeoutError'?'timeout':'failed',wallMs:performance.now()-started,error:message};}
  await (window as any).benchSample({...row,phase,run,requests,requestBytes:sent,responseBytes:received,staticNodes:graphs.reduce((n,g)=>n+g.nodes.length,0),staticGraphs:graphs.length});
 }
}
(window as any).runBenchmark=run;
