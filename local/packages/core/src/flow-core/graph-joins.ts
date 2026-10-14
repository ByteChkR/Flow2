import {describeNode} from './node-descriptions.js';
import type {FlowNode,GraphNodeBinding,FlowInterface,NodeDefinition,TypeRef,PortMetadata} from './model.js';
import {isTransportable} from './transport.js';
import {supportsValueEquality} from './value-equality.js';
import {graphInputPort} from './graph-nodes.js';
export function joinSlotSignature(binding:GraphNodeBinding,slot:string):FlowInterface {
 if(slot!=='leftKey'&&slot!=='rightKey')throw new Error('Invalid Join slot.');
 const own=slot==='leftKey'?'leftItem':'rightItem',other=slot==='leftKey'?'rightItem':'leftItem';
 const signature=structuredClone(binding.signature);
 signature.inputs=signature.inputs.filter(p=>p.name!==other).map(p=>p.name===own?{...p,name:'item'}:p);
 return signature;
}
function joinDefinitionCore(node:FlowNode):NodeDefinition {
 const b=node.graph!,s=b.signature;
 const left=s.inputs.find(p=>p.name==='leftItem'),right=s.inputs.find(p=>p.name==='rightItem'),index=s.inputs.find(p=>p.name==='index');
 if(!left||!right||left.type.kind==='optional'||right.type.kind==='optional'||index?.type.kind!=='scalar'||index.type.name!=='core.Integer'||s.inputs.some(p=>p.name==='item'))throw new Error('Join requires leftItem, rightItem and Integer index inputs; item is reserved.');
 if(s.outputs.length!==1||s.outputs[0]!.name!=='value'||s.outputs[0]!.type.kind==='optional'||!supportsValueEquality(s.outputs[0]!.type))throw new Error('Join selectors must return one required value supporting equality.');
 const inputs:Record<string,TypeRef>={left:{kind:'array',items:left.type},right:{kind:'array',items:right.type}},labels:Record<string,PortMetadata>={};
 for(const slot of ['leftKey','rightKey'])inputs[slot]={kind:'graph',signature:joinSlotSignature(b,slot)};
 for(const p of s.inputs.filter(p=>!['leftItem','rightItem','index'].includes(p.name))){const key=graphInputPort(p);inputs[key]=p.type;labels[key]={label:p.name};}
 const fields:Record<string,TypeRef>={left:left.type,right:b.operation==='groupJoinByKey'?{kind:'array',items:right.type}:b.operation==='leftJoinByKey'?{kind:'optional',inner:right.type}:right.type};
 if(b.operation==='leftJoinByKey')fields.found={kind:'scalar',name:'core.Bool'};
 return {nodeId:node.id,type:node.type,version:1,environments:[...s.inputs,...s.outputs].every(p=>isTransportable(p.type))?['server','browser']:['server'],inputs,outputs:{value:{kind:'array',items:{kind:'object',fields}}},metadata:{label:b.operation,category:'Control/Graphs',inputs:labels},control:{input:true,output:true,start:false},graph:structuredClone(b)};
}

export function joinDefinition(node:FlowNode):NodeDefinition {return describeNode(joinDefinitionCore(node));}
