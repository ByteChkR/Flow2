import {TypeRegistry} from '@adam-flow/core/flow-core/types.js';
import {stringExpressions,isStringExpression} from '@adam-flow/core/flow-core/string-expressions.js';
import type {ExpressionGraph,ExpressionNode,ExpressionOperation} from '@adam-flow/core/flow-core/expressions.js';
import {expressionTypes} from '@adam-flow/core/flow-core/expressions.js';
import type {TypeDocument,TypeRef} from '@adam-flow/core/flow-core/model.js';

export const expressionLabels={...Object.fromEntries(Object.entries(stringExpressions).map(([key,value])=>[key,value.label])),external:'Flow-Parameter',parameter:'Parameter',property:'Eigenschaft',optionalProperty:'Eigenschaft (?.)',ternary:'Bedingung (? :)',constant:'Konstante',record:'Record erstellen',equal:'Gleich',notEqual:'Ungleich',greaterThan:'Größer',lessThan:'Kleiner',greaterOrEqual:'Größer / gleich',lessOrEqual:'Kleiner / gleich',and:'Und',or:'Oder',xor:'Exklusiv oder',not:'Nicht',isNull:'Ist null',groupKey:'Gruppenschlüssel',groupElements:'Gruppenelemente',count:'Count',sum:'Sum',min:'Min',max:'Max'} as Record<ExpressionOperation,string>;
export function expressionInputs(operation:ExpressionOperation,inputs:Record<string,string>={}):string[]{
  if(isStringExpression(operation))return [...stringExpressions[operation].inputs];
  if(operation==='ternary')return ['condition','whenTrue','whenFalse'];
  if(operation==='record')return Object.keys(inputs);
  return operation==='external'||operation==='parameter'||operation==='constant'?[]:['property','optionalProperty','not','isNull','groupKey','groupElements','count','sum','min','max'].includes(operation)?['value']:['left','right'];
}
export function expressionNodeType(graph:ExpressionGraph,id:string,types:TypeDocument):TypeRef|undefined {
  const reachable=new Set<string>();
  function visit(id:string){if(reachable.has(id))return;reachable.add(id);Object.values(graph.nodes.find(node=>node.id===id)?.inputs??{}).forEach(visit);}
  visit(id);
  try{return expressionTypes({...graph,result:id,nodes:graph.nodes.filter(node=>reachable.has(node.id))},types).get(id);}catch{return undefined;}
}
export function expressionFields(graph:ExpressionGraph,node:ExpressionNode,types:TypeDocument,inferred?:Map<string,TypeRef>):Record<string,TypeRef>{
  let owner=inferred?inferred.get(node.inputs.value??''):expressionNodeType(graph,node.inputs.value??'',types);
  if(['sum','min','max'].includes(node.operation)&&(owner?.kind==='grouping'||owner?.kind==='enumerable'))owner=owner.items;
  if(['property','optionalProperty'].includes(node.operation)&&owner?.kind==='nullable')owner=owner.inner;
  const fields=owner?.kind==='entity'?types.types.find(type=>type.id===owner.name)?.fields??{}:owner?.kind==='object'?owner.fields:{};
  return ['sum','min','max'].includes(node.operation)?Object.fromEntries(Object.entries(fields).filter(([,type])=>{const value=type.kind==='nullable'?type.inner:type;return value.kind==='scalar'&&['core.Integer','core.Decimal'].includes(value.name);})):fields;
}
export function removeExpressionNode(graph:ExpressionGraph,id:string):ExpressionGraph {
  return {...graph,result:graph.result===id?'':graph.result,nodes:graph.nodes.filter(node=>node.id!==id).map(node=>({...node,inputs:Object.fromEntries(Object.entries(node.inputs).filter(([,source])=>source!==id))}))};
}

/** One analysis per draft, retaining usable port types even while another node is incomplete. */
export function analyzeExpression(graph:ExpressionGraph,types:TypeDocument,registry:TypeRegistry,predicate:boolean,scalarResult:boolean){
  const errors=new Map<string,string>();let inferred=new Map<string,TypeRef>();
  try{
    inferred=expressionTypes(graph,types,{registry,errors});
    const result=inferred.get(graph.result),scalar=result?.kind==='nullable'?result.inner:result;
    let error=errors.values().next().value??'';
    if(!error&&predicate&&(result?.kind!=='scalar'||result.name!=='core.Bool'))error='Das Ergebnis muss Bool sein.';
    if(!error&&scalarResult&&scalar?.kind!=='scalar'&&scalar?.kind!=='string')error='Der Sortierschlüssel muss skalar sein.';
    return {inferred,error};
  }catch(cause){return {inferred,error:String(cause)};}
}
