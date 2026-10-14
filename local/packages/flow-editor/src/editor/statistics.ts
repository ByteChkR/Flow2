import type {Flow,GraphBundle} from '@adam-flow/core/flow-core/index.js';
import type {Inspection} from '@adam-flow/runtime-browser/runtime-browser/workspace.js';

/** Definition counts are deliberately separate from repeated runtime invocations. */
export function graphStatistics(flow:Flow,bundle:GraphBundle|undefined,inspect:(flow:Flow)=>Inspection){
 const graphs=new Map((bundle?.graphs??[]).map(graph=>[graph.id,graph]));graphs.set(flow.id,flow);
 const visited=new Set<string>(),missing=new Set<string>();let dynamicCalls=0;
 function visit(graph:Flow){
  if(visited.has(graph.id))return;visited.add(graph.id);
  for(const node of graph.nodes){
   if(node.graph?.graphId){const child=graphs.get(node.graph.graphId);if(child)visit(child);else missing.add(node.graph.graphId);}
   else if(node.graph)dynamicCalls++;
  }
 }
 visit(flow);
 let inspection:Inspection;
 try{inspection=inspect(flow);}catch(error){inspection={diagnostics:[{code:'statistics',path:'',message:error instanceof Error?error.message:String(error)}],preview:''};}
 const plan=inspection.plan;
 const planned=Array.isArray(plan?.segments)&&Array.isArray(plan?.nodes);
 return {graphId:flow.id,version:flow.version,mode:flow.mode,nodeCount:flow.nodes.length,connectionCount:flow.connections.length,
  controlConnections:flow.connections.filter(edge=>edge.kind==='control').length,
  dataConnections:flow.connections.filter(edge=>edge.kind!=='control').length,
  subgraphs:visited.size-1,missing:[...missing],dynamicCalls,
  planned,plannedNodes:planned?plan!.nodes.length:null,skipped:planned?plan!.skippedNodeIds.length:null,
  browserNodes:planned?plan!.nodes.filter(node=>node.environment==='browser').length:null,
  serverNodes:planned?plan!.nodes.filter(node=>node.environment==='server').length:null,
  boundaries:planned?plan!.connections.filter(edge=>edge.boundary).length:null,
  segments:planned?plan!.segments:[],diagnostics:inspection.diagnostics};
}
