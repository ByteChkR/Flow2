import {isGraphJoin,isGraphLoop,isGraphPredicate,graphControlOperations,graphControlSlots,graphSlotSignature,graphControlDefinition} from '@adam-flow/core/flow-core/graph-controls.js';
import {graphNodeType} from '@adam-flow/core/flow-core/graph-nodes.js';
import {sameGraphSignature} from '@adam-flow/core/flow-core/graphs.js';
import type {Flow,FlowInterface,NodeDefinition,TypeRef} from '@adam-flow/core/flow-core/model.js';

export function controlPalette(nodes:NodeDefinition[]):NodeDefinition[]{
 const controls=graphControlOperations.map(operation=>{
  const signature:FlowInterface={inputs:[],outputs:[],control:{input:false,output:false}};
  if(operation==='retry')signature.inputs=[{name:'attempt',nodeId:'attempt',type:{kind:'scalar',name:'core.Integer'}}];
  if(operation==='repeat')signature.inputs=[{name:'index',nodeId:'index',type:{kind:'scalar',name:'core.Integer'}}];
  if(isGraphLoop(operation)){
   signature.inputs=[{name:'item',nodeId:'item',type:{kind:'string'}},{name:'index',nodeId:'index',type:{kind:'scalar',name:'core.Integer'}}];
   if(operation!=='forEach')signature.outputs=[{name:'value',nodeId:'value',type:isGraphPredicate(operation)?{kind:'scalar',name:'core.Bool'}:operation==='flatMap'?{kind:'array',items:{kind:'string'}}:{kind:'string'}}];
  }
  if(isGraphJoin(operation)){
   signature.inputs=[{name:'leftItem',nodeId:'leftItem',type:{kind:'string'}},{name:'rightItem',nodeId:'rightItem',type:{kind:'string'}},{name:'index',nodeId:'index',type:{kind:'scalar',name:'core.Integer'}}];
   signature.outputs=[{name:'value',nodeId:'value',type:{kind:'string'}}];
  }
  if(operation==='aggregate'){
   signature.inputs.push({name:'accumulator',nodeId:'accumulator',type:{kind:'string'}});
   signature.outputs=[{name:'accumulator',nodeId:'accumulatorResult',type:{kind:'string'}}];
  }
  return graphControlDefinition({id:'prototype',type:graphNodeType('',operation),typeVersion:1,environment:'server',config:{},graph:{operation,signature,...(operation==='switch'?{cases:['case1','case2']}:{})}});
 });
 return [...nodes.filter(node=>!controls.some(control=>control.type===node.type)),...controls];
}

/** Infer from the first connected graph; never silently invalidate existing argument/result wiring. */
export function inferControlSignature(flow:Flow,nodeId:string,slot:string,type:TypeRef):Flow {
 const node=flow.nodes.find(node=>node.id===nodeId);
 if(!node?.graph||type.kind!=='graph')return flow;
 const invocation=node.graph.operation==='invoke'&&!node.graph.graphId&&slot==='graph';
 if(!invocation&&!graphControlSlots(node.graph).includes(slot))return flow;
 if(sameGraphSignature(invocation?node.graph.signature:graphSlotSignature(node.graph,slot),type.signature))return flow;
 if(flow.connections.some(edge=>edge.kind!=='control'&&(edge.source.nodeId===nodeId||edge.target.nodeId===nodeId&&edge.target.port!==slot&&!(edge.target.port==='condition'&&['if','ifElse'].includes(node.graph!.operation)||edge.target.port==='selector'&&node.graph!.operation==='switch'))))
  throw new Error('Die Graph-Schnittstelle passt nicht zu den vorhandenen Verbindungen. Entferne diese vor einem Wechsel der Schnittstelle.');
 const signature=structuredClone(type.signature);
 if(isGraphJoin(node.graph.operation)){
  const own=slot==='leftKey'?'leftItem':'rightItem',other=slot==='leftKey'?'rightItem':'leftItem';
  if(!signature.inputs.some(p=>p.name==='item'))throw new Error('Der Schlüssel-Graph benötigt item und index.');
  signature.inputs=signature.inputs.map(p=>p.name==='item'?{...p,name:own,nodeId:node.graph!.signature.inputs.find(p=>p.name===own)!.nodeId}:p);
  signature.inputs.push(structuredClone(node.graph.signature.inputs.find(p=>p.name===other)!));
 }

 if(node.graph.operation==='while'&&slot==='condition')signature.outputs=signature.inputs.map(input=>({...input}));
 if(node.graph.operation==='try'&&slot==='catch')signature.inputs=signature.inputs.filter(input=>input.name!=='error');
 if(node.graph.operation==='try'&&slot==='finally')throw new Error('Bitte zuerst den body-Graphen auswählen.');
 const replacement={...node,graph:{...node.graph,signature}};
 if(!invocation)graphControlDefinition(replacement);
 if(!invocation&&!sameGraphSignature(graphSlotSignature(replacement.graph,slot),type.signature))throw new Error('Der Graph passt nicht zur erwarteten Schnittstelle dieses Eingangs.');
 return {...flow,nodes:flow.nodes.map(item=>item.id===nodeId?replacement:item)};
}
