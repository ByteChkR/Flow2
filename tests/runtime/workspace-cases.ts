import { FlowWorkspace } from '@adam-flow/runtime-browser';
import { createBrowserNodes,createBrowserCodecs } from '@adam-flow/nodes-browser';
import flow from '../../contracts/examples/v1/contact.flow.json';
import catalog from '../../contracts/examples/v1/catalog.json';
import types from '../../contracts/examples/v1/types.json';
import codecs from '../../contracts/examples/v1/codecs.json';
function assert(value:unknown,message:string):asserts value {if(!value) throw new Error(message);}
function workspace() {
 const server={...catalog,nodes:catalog.nodes.filter(node=>node.environments.includes('server')).map(node=>({...node,environments:['server']}))};
 return new FlowWorkspace(types=>({nodes:createBrowserNodes(types,{readContactId:()=> 'contact-1',displayContact:()=>{}}),codecs:createBrowserCodecs(types)}),async url=>Response.json(String(url).endsWith('/catalog')?server:String(url).endsWith('/types')?types:codecs));
}
export const workspaceCases=[
 {name:'workspace/loads-dynamic-catalog-and-compiles-example',run:async()=>{
  const client=workspace(),loaded=await client.load();assert(loaded.serverCount>0,'No catalog');
  const result=client.inspect(JSON.stringify(flow));assert(result.plan?.segments.length===3,'Missing plan');assert(result.preview.includes('host.invokeNode'),'Missing generated source');
 }},
 {name:'workspace/invalid-json-and-schema-remain-visible-diagnostics',run:async()=>{
  const client=workspace();await client.load();assert(client.inspect('{').diagnostics[0]?.code==='json','Missing JSON error');
  assert(client.inspect('{"nodes":[null]}').diagnostics.length>0,'Malformed flow accepted');
 }},
 {name:'workspace/port-type-error-includes-node-port-and-environment',run:async()=>{
  const client=workspace();await client.load();const invalid=structuredClone(flow);invalid.connections[0]!.target.port='missing';
  const diagnostic=client.inspect(JSON.stringify(invalid)).diagnostics.find(item=>item.code==='unknown_port');
  assert(diagnostic?.node==='input → get' && diagnostic.port==='id → missing' && diagnostic.environment==='browser → server' && diagnostic.type==='string → ?','Missing diagnostic context');
 }},
 {name:'workspace/unavailable-catalog-blocks-start',run:async()=>{
  const client=new FlowWorkspace(()=>{throw new Error('must not create runtime');},async()=>new Response('offline',{status:503}));
  try{await client.load();}catch{/* Expected unavailable catalog */}
  assert(client.inspect(JSON.stringify(flow)).diagnostics[0]?.code==='catalog','Missing catalog diagnostic');
  let rejected=false;try{await client.run(JSON.stringify(flow));}catch{rejected=true;}assert(rejected,'Execution started without catalog');
 }}
];
