import { parseContract } from '@adam-flow/flow-core';
import { BrowserExecution, SegmentExecutionError, BrowserNodeRegistry } from '@adam-flow/runtime-browser';
import { createBrowserNodes, createBrowserCodecs } from '@adam-flow/nodes-browser';
import flowJson from '../../contracts/examples/v1/contact.flow.json';
import catalogJson from '../../contracts/examples/v1/catalog.json';
import typesJson from '../../contracts/examples/v1/types.json';
import codecsJson from '../../contracts/examples/v1/codecs.json';
function setup(throwDisplay=false) {
 const types=parseContract('types',JSON.stringify(typesJson)), catalog=parseContract('catalog',JSON.stringify(catalogJson));
 const flow=parseContract('flow',JSON.stringify(flowJson));
 const server=parseContract('codecs',JSON.stringify(codecsJson));
 const codecs=createBrowserCodecs(types); let displayed:unknown;
 const nodes=createBrowserNodes(types,{readContactId:()=> 'contact-1',displayContact:value=>{if(throwDisplay) throw new Error('Display failed');displayed=value;}});
 return {flow,catalog,types,server,codecs,nodes,displayed:()=>displayed,create:()=>new BrowserExecution('execution-test',flow,catalog,types,{server,browser:codecs.catalog},nodes,codecs)};
}
function assert(condition:unknown,message:string): asserts condition {if(!condition) throw new Error(message);}
function failure(action:()=>unknown,nodeId?:string) {
 try {action();} catch(error) {
  assert(error instanceof SegmentExecutionError,'Expected attributed segment error');
  assert(error.executionId==='execution-test','Wrong execution ID');
  if(nodeId) assert(error.nodeId===nodeId,'Wrong node ID');
  return error;
 }
 throw new Error('Expected rejection');
}
export const compilerCases = [
 {name:'compiler/browser-generated-segment-encodes-and-decodes',run:()=>{
  const s=setup(), execution=s.create();
  const first=execution.execute('segment-0',{});
  assert(JSON.parse(first.wires['0']!).payload==='contact-1','Input did not execute');
  const wire=s.codecs.encode({typeId:'crm.ContactDTO@1',version:1},{id:'contact-1',name:'Ada'});
  execution.execute('segment-2',{'3':wire});
  assert((s.displayed() as {name:string}).name==='Ada','Display did not execute');execution.dispose();
 }},
 {name:'compiler/browser-target-rejects-tampered-payload',run:()=>{
  const execution=setup().create(); failure(()=>execution.execute('segment-2',{'3':'{}'}),'display');
 }},
 {name:'compiler/browser-cancellation-attributed',run:()=>{
  const execution=setup().create(), controller=new AbortController();controller.abort();
  assert(failure(()=>execution.execute('segment-0',{},controller.signal),'input').code==='cancelled','Wrong error code');
 }},
 {name:'compiler/browser-replay-rejected',run:()=>{
  const execution=setup().create();execution.execute('segment-0',{});failure(()=>execution.execute('segment-0',{}));
 }},
 {name:'compiler/browser-plan-mutation-does-not-change-execution',run:()=>{
  const execution=setup().create();execution.plan.segments[0]!.nodeIds=[];
  assert(Boolean(execution.execute('segment-0',{}).wires['0']),'Plan mutation changed execution');
 }},
 {name:'compiler/browser-missing-actual-codec-rejected-before-node',run:()=>{
  const s=setup();s.server.codecs=[];
  let rejected=false;try{s.create();}catch{rejected=true;} assert(rejected,'Missing actual codec accepted');
 }}
 ,{name:'compiler/browser-multiple-nodes-join-with-local-values',run:()=>{
  const s=setup(), nodes=new BrowserNodeRegistry(s.types);let result:unknown;
  nodes.register({type:'number',version:1,environments:['browser'],inputs:{},outputs:{value:{kind:'number'}}},(_,context)=>({value:context.config['value']}));
  nodes.register({type:'sum',version:1,environments:['browser'],inputs:{a:{kind:'number'},b:{kind:'number'}},outputs:{}},inputs=>{result=(inputs['a'] as number)+(inputs['b'] as number);return {};});
  const flow={schemaVersion:1 as const,id:'join',version:1,mode:'interactive' as const,nodes:[
   {id:'join',type:'sum',typeVersion:1,environment:'browser' as const,config:{}},
   {id:'a',type:'number',typeVersion:1,environment:'browser' as const,config:{value:20}},
   {id:'b',type:'number',typeVersion:1,environment:'browser' as const,config:{value:22}}],connections:[
   {source:{nodeId:'a',port:'value'},target:{nodeId:'join',port:'a'}},
   {source:{nodeId:'b',port:'value'},target:{nodeId:'join',port:'b'}}]};
  const execution=new BrowserExecution('execution-test',flow,nodes.catalog,s.types,{server:s.server,browser:s.codecs.catalog},nodes,s.codecs);
  assert(execution.plan.segments.length===1,'Unexpected segment split');
  execution.execute('segment-0',{});assert(result===42,'Local join failed');execution.dispose();
 }}
 ,{name:'compiler/browser-failure-is-traced-without-false-completion',run:()=>{
  const s=setup(true),execution=s.create();const events:import('@adam-flow/runtime-browser').NodeTrace[]=[];
  const wire=s.codecs.encode({typeId:'crm.ContactDTO@1',version:1},{id:'contact-1',name:'Ada'});
  failure(()=>execution.execute('segment-2',{'3':wire},undefined,event=>events.push(event)),'display');
  assert(events.map(event=>event.status).join(',')==='running,failed','Wrong failure trace');
  assert(events[1]?.nodeId==='display' && (events[1]?.durationMs ?? -1)>=0,'Missing trace context');
 }}
];
