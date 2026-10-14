import {ContractError} from '@adam-flow/core/flow-core/schema.js';
import {flowInterface} from '@adam-flow/core/flow-core/interface.js';
import {graphNodeDefinition,graphNodeType} from '@adam-flow/core/flow-core/graph-nodes.js';
import type {Catalog,Flow,NodeDefinition} from '@adam-flow/core/flow-core/model.js';
/** Toolbox identities are independent of runtime node types: many flows use the same Invoke type. */
export function workspacePalette(graphs:Flow[],catalog:Catalog,names:Record<string,string>):NodeDefinition[]{
 const definitions:NodeDefinition[]=[];
 let firstReference:NodeDefinition|undefined;
 for(const graph of graphs){
  try{
  const definition=graphNodeDefinition({id:`invoke:${graph.id}`,type:graphNodeType('','invoke'),typeVersion:1,environment:'server',config:{},graph:{operation:'invoke',graphId:graph.id,signature:flowInterface(graph,catalog)}});
  const name=names[graph.id]??graph.id;
  const reference=graphNodeDefinition({id:`reference:${graph.id}`,type:graphNodeType('','reference'),typeVersion:1,environment:'server',config:{},graph:{operation:'reference',graphId:graph.id,signature:definition.graph!.signature}});
  definitions.push({...reference,metadata:{...reference.metadata,label:`${name} Referenz`,category:`Workspace/Flows/${name}`}});
  definitions.push({...definition,metadata:{...definition.metadata,label:`${name} Ausführen`,category:`Workspace/Flows/${name}`}});
  firstReference??=graphNodeDefinition({id:'reference',type:graphNodeType('','reference'),typeVersion:1,environment:'server',config:{},graph:{operation:'reference',graphId:graph.id,signature:definition.graph!.signature}});
  }catch(error){
   // A partially edited interface must not break every open editor. Keep its
   // original names; it becomes callable again once the contract is valid.
   if(!(error instanceof ContractError))throw error;
  }
 }
 const invoke=graphNodeDefinition({id:'invoke',type:graphNodeType('','invoke'),typeVersion:1,environment:'server',config:{},graph:{operation:'invoke',signature:{inputs:[],outputs:[],control:{input:false,output:false}}}});
 definitions.push({...invoke,metadata:{...invoke.metadata,label:'Graph aufrufen',category:'Workspace'}});
 if(firstReference)definitions.push({...firstReference,metadata:{...firstReference.metadata,label:'Graph-Referenz',category:'Workspace'}});
 return definitions;
}
