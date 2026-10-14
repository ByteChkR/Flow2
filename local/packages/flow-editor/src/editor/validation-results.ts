import type {Catalog,Diagnostic,GraphBundle,TypeDocument,TypeRef} from '@adam-flow/core/flow-core/model.js';
import {graphCatalog} from '@adam-flow/core/flow-core/graph-nodes.js';
import {resolveDefinition} from '@adam-flow/core/flow-core/node-resolution.js';
import {typeLabel} from './value-model.js';
export interface GraphDiagnostic extends Diagnostic {graphId:string;nodeIds:string[];labels:string[];localPath:string}
function describe(type:TypeRef):string {
 if(type.kind==='object')return `Record {${Object.entries(type.fields).map(([name,t])=>`${name}: ${describe(t)}`).join(', ')}}`;
 if(type.kind==='graph')return `Graph (${type.signature.inputs.map(p=>`${p.name}: ${describe(p.type)}`).join(', ')} → ${type.signature.outputs.map(p=>`${p.name}: ${describe(p.type)}`).join(', ')}; Ablauf ${type.signature.control.input?'ja':'nein'}/${type.signature.control.output?'ja':'nein'})`;
 if(type.kind==='optional')return `${describe(type.inner)} (optional)`;
 if(type.kind==='nullable')return `${describe(type.inner)} | null`;
 if(type.kind==='array')return `Liste<${describe(type.items)}>`;
 return typeLabel(type);
}
/** Resolve the innermost call before interpreting node/connection indices. */
export function locateDiagnostics(diagnostics:Diagnostic[],bundle:GraphBundle,catalog:Catalog,types:TypeDocument):GraphDiagnostic[]{
 const result:GraphDiagnostic[]=[];
 for(const diagnostic of diagnostics){
  let graphId=bundle.rootGraphId,localPath=diagnostic.path;
  const root=/^\/graphs\/([^/]+)/.exec(localPath);
  if(root){graphId=bundle.graphs.find(g=>g.id===root[1])?.id??bundle.graphs[Number(root[1])]?.id??graphId;localPath=localPath.slice(root[0].length);}
  for(const call of localPath.matchAll(/\/calls\/[^/]+\/([^/]+)/g))graphId=call[1]!;
  const lastFlow=localPath.lastIndexOf('/flow/');if(lastFlow>=0)localPath=localPath.slice(lastFlow);
  localPath=localPath.replace(/^\/flow(?=\/|$)/,'');
  const graph=bundle.graphs.find(g=>g.id===graphId);
  const connection=/\/connections\/(\d+)/.exec(localPath),nodeMatch=/\/nodes\/([^/]+)/.exec(localPath);
  const edge=connection?graph?.connections[Number(connection[1])]:undefined;
  const node=nodeMatch?graph?.nodes.find(n=>n.id===nodeMatch[1])??graph?.nodes[Number(nodeMatch[1])]:undefined;
  const nodeIds=edge?[edge.source.nodeId,edge.target.nodeId]:node?[node.id]:[];
  let message=diagnostic.message;let actualType:string|undefined,expectedType:string|undefined;const labels:string[]=[];
  try{
   const definitions=graph?graphCatalog(graph,catalog,types):catalog;
   for(const id of nodeIds){const n=graph?.nodes.find(n=>n.id===id),def=n?resolveDefinition(definitions,n):undefined;labels.push(def?.metadata?.label??n?.type??id);}
   if(edge&&diagnostic.code==='type_mismatch'){
    const source=graph!.nodes.find(n=>n.id===edge.source.nodeId),target=graph!.nodes.find(n=>n.id===edge.target.nodeId);
    const from=source?resolveDefinition(definitions,source)?.outputs[edge.source.port]:undefined,to=target?resolveDefinition(definitions,target)?.inputs[edge.target.port]:undefined;
    actualType=from?describe(from):undefined;expectedType=to?describe(to):undefined;
    message=`${labels[0]}.${edge.source.port} (${from?describe(from):'unbekannter Typ'}) → ${labels[1]}.${edge.target.port} (${to?describe(to):'unbekannter Typ'}): Die Typen sind nicht kompatibel.`;
   }
  }catch{/* Keep the original diagnostic even when definitions are invalid. */}
  if(!result.some(d=>d.graphId===graphId&&d.localPath===localPath&&d.code===diagnostic.code&&d.message===message))result.push({...diagnostic,...(actualType?{actualType}:{}),...(expectedType?{expectedType}:{}),message,graphId,nodeIds,labels,localPath});
 }
 return result;
}
