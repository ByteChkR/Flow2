import {extendGraphCatalog} from './extensions.js';
import {efCatalog} from './ef-nodes.js';
import type {TypeDocument} from './model.js';
import {graphNames} from './node-names.js';
import {valueNodeDefinition} from './value-nodes.js';
import {valueCodecDefinition} from './value-codecs.js';
import {isTransportable} from './transport.js';
import {isGraphControl,graphControlDefinition} from './graph-controls.js';
import {canonicalJson} from './transport.js';
import type {Catalog,CodecDefinition,Flow,FlowInterface,FlowNode,FlowParameter,GraphBundle,GraphNodeBinding,NodeDefinition,TypeRef} from './model.js';
import {ContractError,validateSchema} from './schema.js';
import {signatureDiagnostics} from './graphs.js';
import {queryCatalog} from './query-nodes.js';

export const graphInputPort=(parameter:FlowParameter)=>`in_${parameter.nodeId}`;
export const graphOutputPort=(parameter:FlowParameter)=>`out_${parameter.nodeId}`;
export function graphNodeType(id:string,operation:GraphNodeBinding['operation']):string{return graphNames[operation as keyof typeof graphNames];}
/** Only these four fixed operations are executable. A document never supplies code. */
export function graphNodeDefinition(node:FlowNode):NodeDefinition {
  const binding=node.graph;
  if(!binding)throw new Error('Missing graph node binding.');
  const errors=validateSchema('type',{kind:'graph',signature:binding.signature});
  if(errors.length)throw new ContractError(errors);
  errors.push(...signatureDiagnostics(binding.signature));
  if((!isGraphControl(binding.operation)&&!['reference','invoke'].includes(binding.operation))||node.type!==graphNodeType(node.id,binding.operation)||node.typeVersion!==1||
    (binding.operation==='reference'&&!binding.graphId))
    errors.push({code:'graph_node',path:`/flow/nodes/${node.id}`,message:'Invalid built-in graph node binding.'});
  if(errors.length)throw new ContractError(errors);
  if(isGraphControl(binding.operation))return graphControlDefinition(node);
  if(binding.cases!==undefined)throw new Error('Only Switch may declare cases.');
  const graphType:TypeRef={kind:'graph',signature:binding.signature};
  const inputs:Record<string,TypeRef>={},outputs:Record<string,TypeRef>={};
  const metadata:NonNullable<NodeDefinition['metadata']>={category:'Workspace',inputs:{},outputs:{}};
  const definition:NodeDefinition={nodeId:node.id,type:node.type,version:1,environments:['server','browser'],inputs,outputs,metadata,graph:structuredClone(binding)};
  switch(binding.operation){
    case 'reference':metadata.label='Graph-Referenz';outputs.graph=graphType;break;
    case 'invoke':
      metadata.label='Graph aufrufen';
      if(!binding.graphId)inputs.graph=graphType;
      for(const parameter of binding.signature.inputs){const key=graphInputPort(parameter);inputs[key]=parameter.type;metadata.inputs![key]={label:parameter.name};}
      for(const parameter of binding.signature.outputs){const key=graphOutputPort(parameter);outputs[key]=parameter.type;metadata.outputs![key]={label:parameter.name};}
      if(binding.signature.control.input||binding.signature.control.output)definition.control={...binding.signature.control,start:false};
  }
  if(definition.flowPort)definition.config={name:{type:'string',default:'graph',label:'Name'}};
  return definition;
}
export function graphCatalog(flow:Flow,base:Catalog,types:TypeDocument={schemaVersion:1,types:[]}):Catalog {
  base=extendGraphCatalog(flow,efCatalog(flow,base,types));
  const generated=flow.nodes.filter(node=>node.graph).map(graphNodeDefinition);
  for(const definition of generated)if(base.nodes.some(node=>node.type===definition.type&&node.nodeId===definition.nodeId))throw new Error('A graph built-in cannot replace a registered node.');
  return queryCatalog(flow,{schemaVersion:1,nodes:[...base.nodes,...generated]});
}
/** Stable across graph order/deletion; uses UTF-16 code units in both runtimes. */
export function codecIdentity(type:TypeRef,prefix='workspace.Graph.'):string {
  const key=(value:unknown):string=>{
    if(typeof value==='string')return 's'+Array.from({length:value.length},(_,i)=>value.charCodeAt(i).toString(16).padStart(4,'0')).join('')+';';
    if(Array.isArray(value))return '['+value.map(key).join('')+']';
    if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,item])=>key(name)+key(item)).join('')+'}';
    return String(value)+';';
  };
  let hash=14695981039346656037n;
  for(const character of key(type))hash=BigInt.asUintN(64,(hash^BigInt(character.charCodeAt(0)))*1099511628211n);
  return prefix+hash.toString(16).padStart(16,'0');
}
export function graphCodecs(bundle:GraphBundle):CodecDefinition[]{
  const codecs:CodecDefinition[]=[];
  for(const flow of bundle.graphs)for(const node of flow.nodes){
    if(!node.graph&&!node.value)continue;
    const def=node.graph?graphNodeDefinition(node):valueNodeDefinition(node);
    for(const direction of ['inputs','outputs'] as const)for(const [port,type] of Object.entries(def[direction])){
      if(codecs.some(codec=>canonicalJson(codec.valueType)===canonicalJson(type)))continue;
      if(type.kind!=='graph'){if(['array','object','nullable','optional','entityRef','number','boolean','null'].includes(type.kind)&&isTransportable(type))codecs.push(valueCodecDefinition(type));continue;}
      codecs.push({typeId:codecIdentity(type),version:1,valueType:type,
        wireSchema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{graphId:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_.-]*$'},revision:{type:'integer',minimum:1,maximum:2147483647}},required:['graphId','revision'],additionalProperties:false}});
    }
  }
  if(new Set(codecs.map(codec=>codec.typeId)).size!==codecs.length)throw new Error('Graph codec identity collision.');
  return codecs;
}
