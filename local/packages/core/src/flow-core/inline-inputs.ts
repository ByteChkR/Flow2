import type {TypeRef,FlowNode,NodeDefinition,Flow,Diagnostic} from './model.js';
import {TypeRegistry,validateValue} from './types.js';
export const isPrimitiveInput=(type:TypeRef):boolean=>type.kind==='optional'||type.kind==='nullable'?isPrimitiveInput(type.inner):['scalar','string','number','boolean','null'].includes(type.kind);
export function validateInlineInputs(node:FlowNode,definition:NodeDefinition,flow:Flow,registry:TypeRegistry):Diagnostic[]{
  const errors:Diagnostic[]=[];
  for(const [port,literal] of Object.entries(node.inlineInputs??{})){
    const path=`/flow/nodes/${node.id}/inlineInputs/${port}`,type=definition.inputs[port];
    if(!type||!isPrimitiveInput(type)){errors.push({code:'inline_input',path,message:'Inline values require an existing primitive input.'});continue;}
    if(!literal.enabled)continue;
    if(flow.connections.some(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port===port))errors.push({code:'inline_connected',path,message:'Connected inputs cannot also enable an inline value.'});
    if(!Object.hasOwn(literal,'value'))errors.push({code:'inline_value',path,message:'An enabled inline input needs a value.'});
    else errors.push(...validateValue(type,literal.value,registry,path+'/value'));
  }
  return errors;
}
