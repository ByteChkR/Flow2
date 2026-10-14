import {createStandardRegistry} from '@adam-flow/runtime-browser/registry.js';
import {valueNodeDefinition} from '@adam-flow/core/flow-core/value-nodes.js';
import {graphControlDefinition} from '@adam-flow/core/flow-core/graph-controls.js';
import {valueNames,graphNames} from '@adam-flow/core/flow-core/node-names.js';
import type {Flow,FlowNode,FlowInterface,TypeRef,NodeDefinition,GraphNodeBinding,ValueNodeBinding,JsonValue} from '@adam-flow/core/flow-core/model.js';
const integer:TypeRef={kind:'scalar',name:'core.Integer'},text:TypeRef={kind:'string'};
const scalar=(id:string,type:string):FlowNode=>({id,type,typeVersion:1,environment:'browser',config:{}});
const edge=(a:string,ap:string,b:string,bp:string)=>({source:{nodeId:a,port:ap},target:{nodeId:b,port:bp}});
const link=(a:string,b:string)=>({...edge(a,'out',b,'in'),kind:'control' as const});
const input=(name:string,type:TypeRef):FlowNode=>({...scalar('input_'+name,'Standard.Flow.Input'),config:{name},value:{operation:'input',type}});
const output=(name:string,type:TypeRef):FlowNode=>({...scalar('output_'+name,'Standard.Flow.Output'),config:{name},value:{operation:'output',type}});
const value=(binding:ValueNodeBinding):FlowNode=>({...scalar('operation',valueNames[binding.operation]),value:binding});
const param=(name:string,type:TypeRef)=>({name,nodeId:name,type});
const registry=createStandardRegistry({schemaVersion:1,types:[]}).nodes;
function definition(node:FlowNode):NodeDefinition{return node.value?valueNodeDefinition(node):node.graph?graphControlDefinition(node):registry.catalog.nodes.find(n=>n.type===node.type)!;}
function root(id:string,node:FlowNode,bodies:Record<string,Flow>={}):Flow{
 const contract=definition(node),flow:Flow={schemaVersion:2,id,version:1,mode:'interactive',nodes:[scalar('start','Standard.Flow.Start'),node],connections:[]};
 if(contract.control?.input)flow.connections.push(link('start',node.id));
 for(const [name,type] of Object.entries(contract.inputs)){
  if(type.kind==='graph'){
   const ref:FlowNode={...scalar('ref_'+name,'Standard.Flow.Reference'),graph:{operation:'reference',graphId:bodies[name]!.id,signature:type.signature}};
   flow.nodes.push(ref);flow.connections.push(edge(ref.id,'graph',node.id,name));
  }else{const port=input(name,type);flow.nodes.push(port);flow.connections.push(edge(port.id,'value',node.id,name));}
 }
 for(const [name,type] of Object.entries(contract.outputs)){
  const port=output(name,type);flow.nodes.push(port);flow.connections.push(edge(node.id,name,port.id,'value'),link(contract.control?.output?node.id:'start',port.id));
 }
 return flow;
}
function body(id:string,signature:FlowInterface,source:string,arithmetic=false):Flow{
 const flow:Flow={schemaVersion:2,id,version:1,mode:'interactive',nodes:[scalar('start','Standard.Flow.Start'),...signature.inputs.map(p=>input(p.name,p.type)),...signature.outputs.map(p=>output(p.name,p.type))],connections:[]};
 if(arithmetic){flow.nodes.push(scalar('add','Standard.Math.Integer.Add'));flow.connections.push(edge('input_item','value','add','left'),edge('input_accumulator','value','add','right'));}
 for(const p of signature.outputs)flow.connections.push(edge(arithmetic?'add':'input_'+source,'value','output_'+p.name,'value'),link('start','output_'+p.name));
 return flow;
}
function extensionExamples(){
 const examples:{id:string;name:string;flow:Flow;children:Flow[];inputs:Record<string,JsonValue>;expected:Record<string,JsonValue>}[]=[];
 function add(id:string,name:string,node:FlowNode,inputs:Record<string,JsonValue>,expected:Record<string,JsonValue>,bodies:Record<string,Flow>={}){examples.push({id,name,flow:root(id,node,bodies),children:Object.values(bodies),inputs,expected});}
 const mapping:FlowInterface={inputs:[param('item',integer),param('index',integer)],outputs:[param('value',integer)],control:{input:false,output:false}};
 const control=(operation:GraphNodeBinding['operation'],signature:FlowInterface):FlowNode=>({...scalar('operation',graphNames[operation]),graph:{operation,signature}});
 const doubleBody=(id:string)=>{
  const flow=body(id,mapping,'item');flow.nodes.push({...scalar('double','Standard.Math.Integer.Multiply'),inlineInputs:{right:{enabled:true,value:2}}});
  flow.connections=flow.connections.filter(e=>e.kind==='control');flow.connections.push(edge('input_item','value','double','left'),edge('double','value','output_value','value'));return flow;
 };
 add('list-map','C · Map mit Inline-Graph',control('map',mapping),{items:[3,1,7]},{value:[6,2,14]},{body:doubleBody('map-body')});
 const aggregation:FlowInterface={inputs:[param('item',integer),param('index',integer),param('accumulator',integer)],outputs:[param('accumulator',integer)],control:{input:false,output:false}};
 add('list-aggregate','F · Summe mit Aggregate',control('aggregate',aggregation),{items:[1,2,3],seed:0},{result:6},{body:body('aggregate-body',aggregation,'',true)});
 return examples;
}

export const caseIds=['empty','chain','subgraph-repeat','subgraph-depth','map','aggregate','pingpong','default-values'] as const;
export function fixture(id:string,size:number){
 const items=Array.from({length:size},(_,i)=>i+1);
 const examples=extensionExamples();
 if(['map','aggregate','subgraph-repeat'].includes(id)){
  const example=structuredClone(examples.find(e=>e.id===(id==='aggregate'?'list-aggregate':'list-map'))!);
  if(id==='subgraph-repeat'){
   const child=example.children[0]!;child.nodes=child.nodes.filter(n=>n.id!=='double');
   child.connections=child.connections.filter(e=>e.source.nodeId!=='double'&&e.target.nodeId!=='double');
   child.connections.push(edge('input_item','value','output_value','value'));
  }
  return {...example,inputs:{...example.inputs,items},expected:id==='aggregate'?{result:size*(size+1)/2}:{value:id==='map'?items.map(i=>i*2):items}};
 }
 const flow:Flow={schemaVersion:2,id:'bench_'+id.replaceAll('-','_'),version:1,mode:'interactive',nodes:[scalar('start','Standard.Flow.Start')],connections:[]};
 if(id==='empty')return {flow,children:[],inputs:{},expected:{}};
 if(id==='subgraph-depth'){
  const signature:FlowInterface={inputs:[{name:'value',nodeId:'input_value',type:integer}],outputs:[{name:'value',nodeId:'output_value',type:integer}],control:{input:false,output:false}};
  const children:Flow[]=[];
  for(let level=size;level>=0;level--){
   const g=body(level===0?flow.id:`depth_${level}`,signature,'value');
   if(level<size){
    g.nodes.push({...scalar('call',graphNames.invoke),graph:{operation:'invoke',graphId:`depth_${level+1}`,signature}});
    g.connections=g.connections.filter(e=>e.kind==='control');g.connections.push(edge('input_value','value','call','in_input_value'),edge('call','out_output_value','output_value','value'));
   }
   children.unshift(g);
  }
  return {flow:children.shift()!,children,inputs:{value:7},expected:{value:7}};
 }
 if(id==='default-values'){
  // Deterministic detail-default workload: parent projection, child calculation,
  // list mapping/aggregation and a single record result; no external services.
  const map=structuredClone(examples.find(e=>e.id==='list-map')!);
  const g=map.flow;g.id=flow.id;
  g.nodes=g.nodes.filter(n=>n.id!=='output_value');g.connections=g.connections.filter(e=>e.target.nodeId!=='output_value');
  const parent:TypeRef={kind:'object',fields:{name:text}};
  const result:TypeRef={kind:'object',fields:{name:text,total:integer,values:{kind:'array',items:integer}}};
  g.nodes.push(input('parent',parent),{...scalar('name',valueNames.getProperty),value:{operation:'getProperty',type:parent,member:'name'}},{...scalar('sum',valueNames.sum),value:{operation:'sum',type:integer}},{...scalar('record',valueNames.record),value:{operation:'record',type:result}},output('DefaultValues',result));
  g.connections.push(edge('input_parent','value','name','value'),edge('name','value','record','field_name'),edge('operation','value','sum','items'),edge('sum','value','record','field_total'),edge('operation','value','record','field_values'),edge('record','value','output_DefaultValues','value'),link('operation','output_DefaultValues'));
  return {flow:g,children:map.children,inputs:{items,parent:{name:'Benchmark parent'}},expected:{DefaultValues:{name:'Benchmark parent',total:size*(size+1),values:items.map(i=>i*2)}}};
 }
 if(!['chain','pingpong'].includes(id))throw new Error(`Unknown case ${id}`);
 flow.nodes.push(input('value',integer),output('value',integer));let source='input_value';
 for(let i=0;i<size;i++){
  const n={...scalar(`step_${i}`,'Standard.Math.Integer.Add'),inlineInputs:{right:{enabled:true,value:1}}};flow.nodes.push(n);flow.connections.push(edge(source,'value',n.id,'left'));source=n.id;
 }
 flow.connections.push(edge(source,'value','output_value','value'),link('start','output_value'));
 return {flow,children:[],inputs:{value:0},expected:{value:size}};
}
