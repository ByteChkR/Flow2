import { parseContract } from '@adam-flow/flow-core';
import { compileFlow } from '@adam-flow/flow-compiler';
import { runOrchestratedFlow } from '@adam-flow/runtime-browser';
import { createBrowserNodes, createBrowserCodecs } from '@adam-flow/nodes-browser';
import flowJson from '../../contracts/examples/v1/contact.flow.json';
import catalogJson from '../../contracts/examples/v1/catalog.json';
import typesJson from '../../contracts/examples/v1/types.json';
import codecsJson from '../../contracts/examples/v1/codecs.json';
function assert(value:unknown,message:string):asserts value {if(!value) throw new Error(message);}
function setup() {
 const flow=parseContract('flow',JSON.stringify(flowJson)),catalog=parseContract('catalog',JSON.stringify(catalogJson));
 const types=parseContract('types',JSON.stringify(typesJson)),serverCodecs=parseContract('codecs',JSON.stringify(codecsJson));
 const codecs=createBrowserCodecs(types);let displayed=false;
 const nodes=createBrowserNodes(types,{readContactId:()=> 'contact-1',displayContact:()=>{displayed=true;}});
 const options={flow,catalog,types,serverCodecs,nodes,codecs};
 const plan=compileFlow(flow,catalog,types,{server:serverCodecs,browser:codecs.catalog});
 return {options,plan,displayed:()=>displayed};
}
export const orchestratorCases=[
 {name:'orchestrator/browser-handshake-and-cleanup',run:async()=>{
  const s=setup();let next=0,results=0,closed=false;
  const traceEvents: import('@adam-flow/runtime-browser').ExecutionTrace[]=[];
  const state=(status='waiting_for_browser')=>({executionId:'execution',state:status,error:null,completedSegments:[],events:[{id:'server-0',timestamp:new Date().toISOString(),environment:'server',kind:'execution',status:'running'}]});
  const fetcher:typeof fetch=async(url,init)=>{
   assert(init?.credentials==='same-origin','Cookie credentials missing');
   if(url==='/api/sessions') return Response.json({sessionId:'session'});
   if(url==='/api/executions') {assert(JSON.parse(init.body as string).sessionId==='session','Start not bound');return Response.json(state());}
   if(String(url).endsWith('/next')) {
    assert((init.headers as Record<string,string>)['X-Flow-Session']==='session','Polling not bound');
    const index=next++===0?0:2;
    return Response.json({execution:state(),segment:s.plan.segments[index],attemptId:`attempt-${index}`,wires:index===0?{}:{'3':s.options.codecs.encode({typeId:'crm.ContactDTO@1',version:1},{id:'contact-1',name:'Ada'})}});
   }
   if(String(url).endsWith('/result')) {results++;const body=JSON.parse(init.body as string);assert(!('generatedJavaScript' in body),'Source was transmitted');return Response.json(state(results===2?'completed':'waiting_for_browser'));}
   if(init.method==='DELETE') {closed=true;return new Response(null,{status:204});}
   throw new Error('Unexpected request');
  };
  const result=await runOrchestratedFlow({...s.options,fetcher,onTrace:event=>traceEvents.push(event)});
  assert(traceEvents.filter(event=>event.id==='server-0').length===1,'Polling duplicated events');
  assert(traceEvents.filter(event=>event.kind==='node' && event.status==='completed').map(event=>event.nodeId).join(',')==='input,display','Browser node trace missing');
  assert(result.state==='completed'&&s.displayed()&&closed&&results===2,'Incomplete lifecycle');
 }},
 {name:'orchestrator/browser-closes-session-on-start-rejection',run:async()=>{
  const s=setup();let closed=false,rejected=false;
  const fetcher:typeof fetch=async(url,init)=>{
   if(url==='/api/sessions') return Response.json({sessionId:'session'});
   if(init?.method==='DELETE') {closed=true;return new Response(null,{status:204});}
   return Response.json({state:'rejected'},{status:409});
  };
  try{await runOrchestratedFlow({...s.options,fetcher});}catch{rejected=true;}
  assert(rejected&&closed,'Rejected run leaked session');
 }},
 {name:'orchestrator/browser-cancellation-still-closes-session',run:async()=>{
  const s=setup(),controller=new AbortController();let closed=false;
  const fetcher:typeof fetch=async(url,init)=>{
   if(url==='/api/sessions') return Response.json({sessionId:'session'});
   if(init?.method==='DELETE') {assert(!init.signal?.aborted,'Cleanup used aborted signal');closed=true;return new Response(null,{status:204});}
   controller.abort();throw new DOMException('Cancelled','AbortError');
  };
  try{await runOrchestratedFlow({...s.options,signal:controller.signal,fetcher});}catch{/* Expected abort */}
  assert(closed,'Cancellation leaked session');
 }}
];
