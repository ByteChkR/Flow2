import type {Catalog,Diagnostic,Flow,FlowInterface,GraphBundle,GraphReference,TypeRef,Environment} from './model.js';
import {isTransportable} from './transport.js';
import {ContractError,parseContract} from './schema.js';
import {flowInterface} from './interface.js';

/** Port IDs identify declarations; public names and exact types define interchangeability. */
export function signatureShape(signature:FlowInterface):unknown {
  const ports=(direction:'inputs'|'outputs')=>Object.fromEntries([...signature[direction]].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).map(port=>[port.name,typeShape(port.type)]));
  return {inputs:ports('inputs'),outputs:ports('outputs'),control:{input:signature.control.input,output:signature.control.output}};
}
function typeShape(type:TypeRef):unknown {
  if(type.kind==='graph')return {kind:'graph',signature:signatureShape(type.signature)};
  if(type.kind==='object')return {kind:'object',fields:Object.fromEntries(Object.keys(type.fields).sort().map(key=>[key,typeShape(type.fields[key]!)]))};
  if(type.kind==='grouping')return {kind:type.kind,key:typeShape(type.key),items:typeShape(type.items)};
  if((type.kind==='array'||type.kind==='dictionary')||(type.kind==='queryable'||type.kind==='orderedQueryable'||type.kind==='enumerable'))return {kind:type.kind,items:typeShape(type.items)};
  if(type.kind==='optional'||type.kind==='nullable')return {kind:type.kind,inner:typeShape(type.inner)};
  if(type.kind==='scalar'||type.kind==='entity'||type.kind==='entityRef')return {kind:type.kind,name:type.name};
  return {kind:type.kind};
}
export function sameGraphSignature(left:FlowInterface,right:FlowInterface):boolean {
  return !signatureDiagnostics(left).length&&!signatureDiagnostics(right).length&&JSON.stringify(signatureShape(left))===JSON.stringify(signatureShape(right));
}
export function signatureDiagnostics(signature:FlowInterface,path=''):Diagnostic[]{
  const errors:Diagnostic[]=[];
  for(const direction of ['inputs','outputs'] as const){
    const names=new Set<string>(),ids=new Set<string>();
    for(const [index,port] of signature[direction].entries()){
      if(names.has(port.name)||ids.has(port.nodeId))errors.push({code:'graph_signature',path:`${path}/${direction}/${index}`,message:'Graph ports require unique names and IDs per direction.'});
      names.add(port.name);ids.add(port.nodeId);
    }
  }
  return errors;
}
export function isGraphReference(value:unknown):value is GraphReference {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const record=value as Record<string,unknown>;
  return Object.keys(record).length===2&&Object.hasOwn(record,'graphId')&&Object.hasOwn(record,'revision')&&typeof record.graphId==='string'&&/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(record.graphId)&&typeof record.revision==='number'&&Number.isInteger(record.revision)&&record.revision>=1&&record.revision<=2147483647;
}

/** A run owns its definitions. Accessors return copies so edits cannot mutate the snapshot. */
export class GraphBundleSnapshot {
  private readonly bundle:GraphBundle;
  private readonly definitions:Map<string,Flow>;
  constructor(value:unknown){
    this.bundle=parseContract('bundle',JSON.stringify(value));
    this.definitions=new Map();
    for(const flow of this.bundle.graphs){
      if(this.definitions.has(flow.id))throw new ContractError([{code:'duplicate_graph',path:'/bundle/graphs',message:`Duplicate graph ${flow.id}.`}]);
      this.definitions.set(flow.id,flow);
    }
    for(const graph of this.bundle.graphs)if(graph.mode==='hybrid')for(const node of graph.nodes)if(node.graph?.graphId&&this.definitions.get(node.graph.graphId)?.mode!=='hybrid')throw new ContractError([{code:'hybrid_graph',path:`/graphs/${graph.id}/nodes/${node.id}`,message:'Hybrid graphs may reference only hybrid subgraphs.'}]);
    if(!this.definitions.has(this.bundle.rootGraphId))throw new ContractError([{code:'graph_missing',path:'/bundle/rootGraphId',message:'Root graph is missing.'}]);
  }
  get root():Flow{return structuredClone(this.definitions.get(this.bundle.rootGraphId)!);}
  get document():GraphBundle{return structuredClone(this.bundle);}
  reference(graphId:string):GraphReference {
    const flow=this.definitions.get(graphId);
    if(!flow)throw new ContractError([{code:'graph_missing',path:'/graphId',message:`Unknown workspace graph ${graphId}.`}]);
    return {graphId,revision:flow.version};
  }
  resolve(value:unknown,signature:FlowInterface,catalog:Catalog):Flow {
    if(!isGraphReference(value))throw new ContractError([{code:'graph_reference',path:'/graph',message:'Expected a graph reference with graphId and revision.'}]);
    const graph=this.definitions.get(value.graphId);
    if(!graph||graph.version!==value.revision)throw new ContractError([{code:'graph_reference',path:'/graph',message:'Graph reference is missing or belongs to a different revision.'}]);
    const actual=flowInterface(graph,catalog);
    const errors=[...signatureDiagnostics(signature),...signatureDiagnostics(actual)];
    if(errors.length)throw new ContractError(errors);
    if(!sameGraphSignature(actual,signature))throw new ContractError([{code:'graph_signature',path:'/graph',message:'Graph interface does not match the expected signature.'}]);
    return structuredClone(graph);
  }
}

/** Select one runtime for the entire portable definition without mutating its snapshot. */
export function materializeHybrid(flow:Flow,environment:Environment='server'):Flow {
  if(flow.mode!=='hybrid')return structuredClone(flow);
  return {...structuredClone(flow),nodes:flow.nodes.map(node=>({...structuredClone(node),environment})),connections:flow.connections.map(({codec,...edge})=>structuredClone(edge))};
}

export function isHybridType(type:TypeRef):boolean {
  if(type.kind==='graph')return [...type.signature.inputs,...type.signature.outputs].every(port=>isHybridType(port.type));
  if((type.kind==='array'||type.kind==='dictionary'))return isHybridType(type.items);
  if(type.kind==='object')return Object.values(type.fields).every(isHybridType);
  if(type.kind==='optional'||type.kind==='nullable')return isHybridType(type.inner);
  return isTransportable(type);
}
