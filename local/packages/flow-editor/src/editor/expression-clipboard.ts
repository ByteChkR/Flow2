import type {ExpressionGraph} from '@adam-flow/core/flow-core/expressions.js';
import {parseContract,canonicalJson} from '@adam-flow/core/flow-core/index.js';
import type {Point} from './model.js';
export const expressionClipboardMime='application/x-adam-flow2-expression-nodes';
export interface ExpressionClipboard {kind:'adam-flow2-expression-nodes';version:1;graph:ExpressionGraph;positions:Record<string,Point>}
export function copyExpressionNodes(graph:ExpressionGraph,positions:Record<string,Point>,selection:readonly string[]):ExpressionClipboard {
  const ids=new Set(selection),nodes=graph.nodes.filter(node=>ids.has(node.id));
  return structuredClone({kind:'adam-flow2-expression-nodes',version:1,graph:{...graph,result:nodes[0]?.id??'',nodes:nodes.map(node=>({...node,inputs:Object.fromEntries(Object.entries(node.inputs).map(([port,id])=>[port,ids.has(id)?id:'']))}))},positions:Object.fromEntries(nodes.map(node=>[node.id,positions[node.id]??{x:0,y:0}]))});
}
export function readExpressionNodes(text:string):ExpressionClipboard|null {
  let data;try{data=JSON.parse(text);}catch{return null;}
  if(data?.kind==='adam-flow2-nodes')throw new Error('Flow-Nodes können nicht in den LINQ-Editor eingefügt werden.');
  if(data?.kind!=='adam-flow2-expression-nodes')return null;
  if(data.version!==1)throw new Error('Unbekannte Version der LINQ-Zwischenablage.');
  // Empty inputs are valid editor drafts, including named fields of a partial Record.
  const raw=data.graph;
  const graph=parseContract('expression',JSON.stringify({...raw,nodes:raw?.nodes?.map((node:{inputs?:Record<string,unknown>})=>({...node,inputs:Object.fromEntries(Object.entries(node.inputs??{}).map(([port,id])=>[port,id===''?'__unconnected__':id]))}))}));
  graph.nodes.forEach((node,index)=>{for(const port of Object.keys(node.inputs))if(raw.nodes[index].inputs[port]==='')node.inputs[port]='';});
  const ids=new Set(graph.nodes.map(node=>node.id));
  if(ids.size!==graph.nodes.length||graph.nodes.some(node=>Object.values(node.inputs).some(id=>id&&!ids.has(id))))throw new Error('Ungültige Verbindungen in der LINQ-Zwischenablage.');
  const positions=Object.fromEntries(graph.nodes.map(node=>{const p=data.positions?.[node.id];if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new Error('Ungültige Node-Position.');return [node.id,{x:p.x,y:p.y}];}));
  return {kind:'adam-flow2-expression-nodes',version:1,graph,positions};
}
export function pasteExpressionNodes(target:ExpressionGraph,positions:Record<string,Point>,fragment:ExpressionClipboard,point:Point,idFactory=()=>`expr_${crypto.randomUUID()}`){
  if(target.nodes.length+fragment.graph.nodes.length>512)throw new Error('Ein LINQ-Ausdruck darf höchstens 512 Nodes enthalten.');
  if(fragment.graph.nodes.some(node=>node.operation==='parameter')&&canonicalJson(target.parameter)!==canonicalJson(fragment.graph.parameter))throw new Error('Die kopierten Parameter-Nodes benötigen denselben Parametertyp im Zielausdruck.');
  const used=new Set(target.nodes.map(node=>node.id)),ids=new Map<string,string>();
  for(const node of fragment.graph.nodes){const id=idFactory();if(used.has(id))throw new Error('Doppelte Node-ID.');used.add(id);ids.set(node.id,id);}
  const minX=Math.min(...Object.values(fragment.positions).map(p=>p.x)),minY=Math.min(...Object.values(fragment.positions).map(p=>p.y));
  return {graph:{...target,nodes:[...target.nodes,...structuredClone(fragment.graph.nodes).map(node=>({...node,id:ids.get(node.id)!,inputs:Object.fromEntries(Object.entries(node.inputs).map(([port,id])=>[port,ids.get(id)??'']))}))]},ids:[...ids.values()],positions:{...positions,...Object.fromEntries([...ids].map(([old,id])=>[id,{x:point.x+fragment.positions[old]!.x-minX,y:point.y+fragment.positions[old]!.y-minY}]))}};
}
