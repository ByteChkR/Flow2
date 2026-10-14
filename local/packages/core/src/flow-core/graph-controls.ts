import {joinDefinition,joinSlotSignature} from './graph-joins.js';
import {supportsValueOrder} from './value-order.js';
import {supportsValueEquality} from './value-equality.js';
import {canonicalJson,isTransportable} from './transport.js';
import type {FlowNode,GraphNodeBinding,FlowInterface,NodeDefinition,TypeRef,PortMetadata} from './model.js';
import {graphInputPort,graphOutputPort} from './graph-nodes.js';
export const graphControlOperations=['parallelMap','timeout','retry','repeat','while','if','ifElse','switch','forEach','map','filter','aggregate','flatMap','any','all','find','findIndex','takeWhile','skipWhile','partition','sortBy','distinctBy','groupBy','minBy','maxBy','joinByKey','leftJoinByKey','groupJoinByKey','try'] as const;
export const isGraphJoin=(operation:string)=>['joinByKey', 'leftJoinByKey', 'groupJoinByKey'].includes(operation);
export const isGraphControl=(operation:string)=>graphControlOperations.some(value=>value===operation);
export const isGraphPredicate=(operation:string)=>['filter','any','all','find','findIndex','takeWhile','skipWhile','partition'].includes(operation);
export const isGraphSelector=(operation:string)=>['sortBy', 'distinctBy', 'groupBy', 'minBy', 'maxBy'].includes(operation);
export const isGraphLoop=(operation:string)=>['parallelMap','forEach','map','filter','aggregate','flatMap','any','all','find','findIndex','takeWhile','skipWhile','partition','sortBy','distinctBy','groupBy','minBy','maxBy'].includes(operation);
export function graphControlSlots(binding:GraphNodeBinding):string[]{
  if(isGraphJoin(binding.operation))return ['leftKey','rightKey'];
  switch(binding.operation){
    case 'timeout':case 'retry':case 'repeat':return ['body'];
    case 'while':return ['condition','body'];
    case 'if':return ['then'];case 'ifElse':return ['then','else'];
    case 'switch':return [...(binding.cases??[]).map((_,i)=>`case_${i}`),'default'];
    case 'try':return ['body','catch','finally'];
    case 'parallelMap':case 'forEach':case 'map':case 'filter':case 'aggregate':case 'flatMap':case 'any':case 'all':case 'find':case 'findIndex':case 'takeWhile':case 'skipWhile':case 'partition':case 'sortBy':case 'distinctBy':case 'groupBy':case 'minBy':case 'maxBy':return ['body'];default:return [];
  }
}
export function graphSlotSignature(binding:GraphNodeBinding,slot:string):FlowInterface {
  if(isGraphJoin(binding.operation))return joinSlotSignature(binding,slot);
  const signature=structuredClone(binding.signature);
  if(binding.operation==='while'&&slot==='condition')signature.outputs=[{name:'value',nodeId:'__condition',type:{kind:'scalar',name:'core.Bool'}}];
  if(binding.operation==='try'){
    if(slot==='catch')signature.inputs.push({name:'error',nodeId:'__error',type:{kind:'string'}});
    else if(slot==='finally')signature.outputs=[];
    else if(slot!=='body')throw new Error('Invalid Try slot.');
  }
  return signature;
}
export function graphControlDefinition(node:FlowNode):NodeDefinition {
  const b=node.graph!,signature=b.signature;
  function require(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
  require(isGraphControl(b.operation)&&b.graphId===undefined,'Control nodes require explicit typed graph inputs.');
  require(b.operation!=='try'||signature.inputs.every(p=>p.name!=='error'&&p.nodeId!=='__error'),'error/__error are reserved for the Catch input.');
  require(b.operation==='switch'?b.cases&&b.cases.length>0&&b.cases.length<=64&&new Set(b.cases).size===b.cases.length:b.cases===undefined,'Switch requires 1–64 distinct case labels; other operations cannot declare cases.');
  require(node.environment!=='browser'||[...signature.inputs,...signature.outputs].every(p=>isTransportable(p.type)),'Native graph arguments require backend execution.');
  if(isGraphJoin(b.operation))return joinDefinition(node);
  if(b.operation==='retry')require(signature.inputs.some(p=>p.name==='attempt'&&p.type.kind==='scalar'&&p.type.name==='core.Integer'),'Retry body requires Integer attempt.');
  if(b.operation==='repeat')require(signature.inputs.some(p=>p.name==='index'&&p.type.kind==='scalar'&&p.type.name==='core.Integer')&&signature.outputs.length===0,'Repeat body requires Integer index and no outputs.');
  if(b.operation==='while'){
    require(signature.inputs.length===signature.outputs.length&&signature.inputs.every(input=>signature.outputs.some(output=>output.name===input.name&&canonicalJson(output.type)===canonicalJson(input.type))),'While body must return each input by the same name and type.');
    whileLimit(node);
  }
  const inputs:Record<string,TypeRef>={},outputs:Record<string,TypeRef>={},labels:Record<string,PortMetadata>={},outputLabels:Record<string,PortMetadata>={};
  for(const slot of graphControlSlots(b)){inputs[slot]={kind:'graph',signature:graphSlotSignature(b,slot)};labels[slot]={label:slot.startsWith('case_')?b.cases![Number(slot.slice(5))]!:slot};}
  if(b.operation==='if'||b.operation==='ifElse')inputs.condition={kind:'scalar',name:'core.Bool'};
  if(b.operation==='switch')inputs.selector={kind:'string'};
  if(isGraphLoop(b.operation)){
    const item=signature.inputs.find(p=>p.name==='item'),index=signature.inputs.find(p=>p.name==='index');
    require(item&&item.type.kind!=='optional'&&index?.type.kind==='scalar'&&index.type.name==='core.Integer','Loop body requires item and Integer index inputs.');
    inputs.items={kind:'array',items:item.type};
    if(b.operation==='forEach')require(signature.outputs.length===0,'ForEach body must have no outputs; use Map for results.');
    else if(b.operation==='aggregate'){
      const accumulator=signature.inputs.find(p=>p.name==='accumulator');
      require(accumulator&&accumulator.type.kind!=='optional','Aggregate body requires a required accumulator input.');
      require(signature.outputs.length===1&&signature.outputs[0]!.name==='accumulator'&&canonicalJson(signature.outputs[0]!.type)===canonicalJson(accumulator.type),'Aggregate body must return accumulator with the same type.');
      inputs.seed=accumulator.type;outputs.result=accumulator.type;
      labels.seed={label:'Startwert'};outputLabels.result={label:'Ergebnis'};
    }
    else {
      require(signature.outputs.length===1&&signature.outputs[0]!.name==='value'&&signature.outputs[0]!.type.kind!=='optional','List body must return one required value.');
      const result=signature.outputs[0]!.type,bool:TypeRef={kind:'scalar',name:'core.Bool'};
      if(isGraphPredicate(b.operation))require(result.kind==='scalar'&&result.name==='core.Bool','Predicate body must return Bool value.');
      if(b.operation==='flatMap')require(result.kind==='array'&&result.items.kind!=='optional','FlatMap body must return a required List<T>.');
      outputs.value={kind:'array',items:isGraphPredicate(b.operation)?item.type:result};
      if(isGraphSelector(b.operation)){
        if(['sortBy','minBy','maxBy'].includes(b.operation))require(supportsValueOrder(result)||b.operation==='sortBy'&&result.kind==='object'&&Object.keys(result.fields).length>0&&Object.values(result.fields).every(supportsValueOrder),'Selector key must support ordering.');
        else require(supportsValueEquality(result),'Selector key must support equality.');
        outputs.value={kind:'array',items:item.type};
        if(b.operation==='minBy'||b.operation==='maxBy')outputs.value={kind:'optional',inner:item.type};
        if(b.operation==='groupBy')outputs.value={kind:'array',items:{kind:'object',fields:{key:result,items:{kind:'array',items:item.type}}}};
        if(b.operation==='sortBy'){
          if(result.kind==='object')inputs.orderBy={kind:'array',items:{kind:'object',fields:{field:{kind:'string'},descending:bool}}};
          else inputs.descending={kind:'optional',inner:bool};
        }
      }
      if(b.operation==='flatMap')outputs.value=result;
      if(b.operation==='any'||b.operation==='all')outputs.value=bool;
      if(b.operation==='find'){outputs.value={kind:'optional',inner:item.type};outputs.found=bool;}
      if(b.operation==='findIndex')outputs.value={kind:'scalar',name:'core.Integer'};
      if(b.operation==='partition'){delete outputs.value;outputs.matching={kind:'array',items:item.type};outputs.nonMatching={kind:'array',items:item.type};}
    }
  }
  if(b.operation==='parallelMap'){require([...signature.inputs,...signature.outputs].every(p=>isTransportable(p.type)),'ParallelMap requires transportable arguments and results to isolate execution contexts.');inputs.maxConcurrency={kind:'scalar',name:'core.Integer'};}
  if(b.operation==='timeout')inputs.timeoutMilliseconds={kind:'scalar',name:'core.Integer'};
  if(b.operation==='retry'){inputs.maxAttempts={kind:'scalar',name:'core.Integer'};inputs.retryCodes={kind:'array',items:{kind:'string'}};inputs.delayMilliseconds={kind:'optional',inner:{kind:'scalar',name:'core.Integer'}};}
  if(b.operation==='repeat')inputs.count={kind:'scalar',name:'core.Integer'};
  for(const parameter of signature.inputs.filter(p=>b.operation==='retry'?p.name!=='attempt':b.operation==='repeat'?p.name!=='index':!isGraphLoop(b.operation)||!['item','index',...(b.operation==='aggregate'?['accumulator']:[])].includes(p.name))){const key=graphInputPort(parameter);inputs[key]=parameter.type;labels[key]={label:parameter.name};}
  if(!isGraphLoop(b.operation))for(const parameter of signature.outputs){const key=graphOutputPort(parameter);outputs[key]=b.operation==='if'&&parameter.type.kind!=='optional'?{kind:'optional',inner:parameter.type}:parameter.type;outputLabels[key]={label:parameter.name};}
  return {nodeId:node.id,type:node.type,version:1,environments:[...signature.inputs,...signature.outputs].every(p=>isTransportable(p.type))?['server','browser']:['server'],inputs,outputs,metadata:{label:b.operation,category:'Control/Graphs',inputs:labels,outputs:outputLabels},...(b.operation==='while'?{config:{maxIterations:{type:'number' as const,default:100,label:'Maximale Durchläufe'}}}:{}),control:{input:true,output:true,start:false},graph:structuredClone(b)};
}

export function whileLimit(node:FlowNode):number {
  const limit=node.config.maxIterations===undefined?100:node.config.maxIterations;
  if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1||limit>500)throw new Error('While maxIterations must be an integer between 1 and 500.');
  return limit;
}
