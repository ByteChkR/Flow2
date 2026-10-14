import {resolveDefinition} from './node-resolution.js';
import {valueNodeDefinition} from './value-nodes.js';
import {graphNodeDefinition} from './graph-nodes.js';
import type {Catalog,Flow,FlowInterface,FlowParameter,Diagnostic,JsonValue} from './model.js';
import {TypeRegistry,validateValue} from './types.js';
import {ContractError} from './schema.js';

/** A graph's public signature is derived from its explicit input/output nodes. */
export function flowInterface(flow:Flow,catalog:Catalog):FlowInterface {
  const signature:FlowInterface={inputs:[],outputs:[],control:{input:flow.control?.input??false,output:flow.control?.output??false}};
  for(const node of flow.nodes){
    const def=node.graph?graphNodeDefinition(node):node.value?valueNodeDefinition(node):resolveDefinition(catalog,node);
    if(!def?.flowPort)continue;
    const name=node.config.name??def.config?.name?.default;
    const type=(def.flowPort==='input'?def.outputs:def.inputs).value;
    if(typeof name==='string'&&type)signature[def.flowPort==='input'?'inputs':'outputs'].push({name,nodeId:node.id,type});
  }
  return signature;
}
export function validateInterface(signature:FlowInterface,active:Set<string>):Diagnostic[]{
  const errors:Diagnostic[]=[];
  for(const direction of ['inputs','outputs'] as const){
    const seen=new Set<string>();
    for(const parameter of signature[direction]){
      if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parameter.name)||seen.has(parameter.name))
        errors.push({code:'parameter_name',path:`/flow/nodes/${parameter.nodeId}/config/name`,message:'Flow-Parameter brauchen einen eindeutigen Namen (Buchstaben, Ziffern, Unterstrich).'});
      seen.add(parameter.name);
      if(direction==='outputs'&&!active.has(parameter.nodeId))errors.push({code:'inactive_output',path:`/flow/nodes/${parameter.nodeId}`,message:'Flow Output muss mit dem Start-Kontrollfluss verbunden sein.'});
    }
  }
  return errors;
}
export function requireFlowValues(parameters:FlowParameter[],values:Record<string,JsonValue>,path='/inputs',registry=new TypeRegistry({schemaVersion:1,types:[]}),allowUnknown=false):void {
  const errors:Diagnostic[]=[];
  if(!values||typeof values!=='object'||Array.isArray(values))throw new ContractError([{code:'parameter_value',path,message:'Expected named flow values.'}]);
  for(const parameter of parameters){
    const value=values[parameter.name];
    const diagnostics=validateValue(parameter.type,Object.hasOwn(values,parameter.name)?value:undefined,registry,`${path}/${parameter.name}`);
    errors.push(...diagnostics.map(item=>({...item,code:'parameter_value',message:`Node ${parameter.nodeId}, value (${parameter.name}): ${item.message}`})));
  }
  for(const name of Object.keys(values))
    if(!allowUnknown && !parameters.some(parameter=>parameter.name===name))
      errors.push({code:'parameter_value',path:`${path}/${name}`,message:`Unbekannter Flow-Parameter: ${name}.`});
  if(errors.length)throw new ContractError(errors);
}
