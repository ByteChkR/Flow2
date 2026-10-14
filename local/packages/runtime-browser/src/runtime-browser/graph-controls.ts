import {executeParallelMap} from './parallel-map.js';
import {inheritedFailure} from './failure.js';
import {NodeFailure,nodeFailureCode} from './node-failure.js';
import {executeListJoin} from './list-joins.js';
import {executeListSelector} from './list-selectors.js';
import {isGraphJoin,isGraphSelector} from '@adam-flow/core/flow-core/graph-controls.js';
import {graphInputPort,graphOutputPort,graphSlotSignature,whileLimit} from '@adam-flow/core/flow-core/index.js';
import type {FlowNode,GraphReference,JsonValue} from '@adam-flow/core/flow-core/index.js';
import type {GraphInvoker} from './graph-nodes.js';

export async function executeGraphControl(node:FlowNode,inputs:Readonly<Record<string,unknown>>,invoke:GraphInvoker,signal?:AbortSignal):Promise<Record<string,unknown>> {
  if(node.graph!.operation==='parallelMap')return executeParallelMap(node,inputs,invoke,signal);
  const b=node.graph!;
  const common=Object.fromEntries(b.signature.inputs.filter(p=>Object.hasOwn(inputs,graphInputPort(p))).map(p=>[p.name,inputs[graphInputPort(p)] as JsonValue]));
  const call=async(slot:string,key=slot,args=common)=>{
    signal?.throwIfAborted();
    return invoke(node.id,inputs[slot] as GraphReference,graphSlotSignature(b,slot),args,signal,key);
  };
  if(isGraphJoin(b.operation))return executeListJoin(b,inputs,(slot,item,index)=>call(slot,`${slot}:${index}`,{...common,item,index}),signal);
  if(isGraphSelector(b.operation))return executeListSelector(b,inputs,(item,index)=>call('body',`body:${index}`,{...common,item,index}),signal);
  let result:Record<string,JsonValue>={};
  switch(b.operation){
    case 'timeout':{
      const milliseconds=inputs.timeoutMilliseconds as number;
      if(!Number.isInteger(milliseconds)||milliseconds<1||milliseconds>600000)throw new Error('timeoutMilliseconds: Expected 1–600000.');
      signal?.throwIfAborted();const deadline=new AbortController(),started=performance.now();
      const combined=AbortSignal.any([deadline.signal,...(signal?[signal]:[])]);
      const timer=setTimeout(()=>deadline.abort(new DOMException('Subgraph timed out.','AbortError')),milliseconds);
      try{
        result=await invoke(node.id,inputs.body as GraphReference,graphSlotSignature(b,'body'),common,combined,'body');
        signal?.throwIfAborted();
        if(deadline.signal.aborted||performance.now()-started>=milliseconds)throw new NodeFailure('timeout',`Subgraph exceeded ${milliseconds} ms.`);
      }catch(error){signal?.throwIfAborted();if(deadline.signal.aborted||performance.now()-started>=milliseconds)throw new NodeFailure('timeout',`Subgraph exceeded ${milliseconds} ms.`);throw error;}
      finally{clearTimeout(timer);}
      break;
    }
    case 'retry':{
      const attempts=inputs.maxAttempts as number,delay=(inputs.delayMilliseconds??0) as number,codes=inputs.retryCodes as string[];
      if(!Number.isInteger(attempts)||attempts<1||attempts>10)throw new Error('maxAttempts: Retry requires 1–10 attempts.');
      if(!Number.isInteger(delay)||delay<0||delay>60000)throw new Error('delayMilliseconds: Expected 0–60000.');
      for(let attempt=1;attempt<=attempts;attempt++){
        try{result=await call('body',`body:${attempt-1}`,{...common,attempt});break;}
        catch(error){
          signal?.throwIfAborted();
          const code=inheritedFailure(error)?.code??nodeFailureCode(error)??'failed';
          if(attempt===attempts||['cancelled','session_lost'].includes(code)||error instanceof Error&&error.name==='AbortError'||!codes.includes(code))throw error;
          if(delay)await new Promise<void>((resolve,reject)=>{
            const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal?.reason);};
            const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},delay);
            signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
          });
        }
      }
      break;
    }
    case 'repeat':{
      const count=inputs.count as number;
      if(!Number.isInteger(count)||count<0||count>1000)throw new Error('count: Repeat requires 0–1000 iterations.');
      signal?.throwIfAborted();
      for(let index=0;index<count;index++){await call('body',`body:${index}`,{...common,index});signal?.throwIfAborted();}
      return {};
    }
    case 'while':{
      result=common;
      const limit=whileLimit(node);
      for(let turn=0;;turn++){
        const condition=await call('condition',`condition:${turn}`,result);
        if(condition.value===false)break;
        if(condition.value!==true)throw new Error('While condition must return Bool value.');
        if(turn>=limit)throw new Error(`While exceeded its limit of ${limit} iterations.`);
        result=await call('body',`body:${turn}`,result);
      }
      break;
    }
    case 'if':if(inputs.condition)result=await call('then');break;
    case 'ifElse':result=await call(inputs.condition?'then':'else');break;
    case 'switch':{const index=b.cases!.indexOf(inputs.selector as string);result=await call(index<0?'default':`case_${index}`);break;}
    case 'aggregate':{
      let accumulator=inputs.seed as JsonValue;
      signal?.throwIfAborted();
      for(const [index,item] of (inputs.items as JsonValue[]).entries()){
        const output=await call('body',`body:${index}`,{...common,item,index,accumulator});
        signal?.throwIfAborted();accumulator=output.accumulator!;
      }
      return {result:accumulator};
    }
    case 'forEach':case 'map':case 'filter':case 'flatMap':case 'any':case 'all':case 'find':case 'findIndex':case 'takeWhile':case 'skipWhile':case 'partition':{
      const values:JsonValue[]=[],nonMatching:JsonValue[]=[];
      let skipping=true;
      signal?.throwIfAborted();
      for(const [index,item] of (inputs.items as JsonValue[]).entries()){
        if(b.operation==='skipWhile'&&!skipping){values.push(item);continue;}
        const output=await call('body',`body:${index}`,{...common,item,index});
        signal?.throwIfAborted();
        if(b.operation==='forEach')continue;
        if(!Object.hasOwn(output,'value'))throw new Error('List body must return value.');
        if(b.operation==='map'){values.push(output.value!);continue;}
        if(b.operation==='flatMap'){
          if(!Array.isArray(output.value))throw new Error('FlatMap body must return a list.');
          for(const value of output.value)values.push(value);
          continue;
        }
        if(typeof output.value!=='boolean')throw new Error('Predicate body must return Bool value.');
        const matches=output.value;
        if(b.operation==='any'&&matches)return {value:true};
        if(b.operation==='all'&&!matches)return {value:false};
        if(b.operation==='find'&&matches)return {found:true,value:item};
        if(b.operation==='findIndex'&&matches)return {value:index};
        if(b.operation==='takeWhile'&&!matches)break;
        if(b.operation==='skipWhile'){skipping=matches;if(!skipping)values.push(item);}
        if(b.operation==='filter'&&matches||b.operation==='takeWhile')values.push(item);
        if(b.operation==='partition')(matches?values:nonMatching).push(item);
      }
      signal?.throwIfAborted();
      if(b.operation==='any'||b.operation==='all')return {value:b.operation==='all'};
      if(b.operation==='find')return {found:false};
      if(b.operation==='findIndex')return {value:-1};
      if(b.operation==='partition')return {matching:values,nonMatching};
      return b.operation==='forEach'?{}:{value:values};
    }
    case 'try':{
      let failure:unknown;let failed=false;
      try{result=await call('body');}
      catch(error){
        signal?.throwIfAborted();
        if(error instanceof Error&&error.name==='AbortError')throw error;
        try{result=await call('catch','catch',{...common,error:error instanceof Error?error.message:String(error)});}
        catch(catchError){failure=catchError;failed=true;}
      }
      signal?.throwIfAborted();
      if(failure instanceof Error&&failure.name==='AbortError')throw failure;
      try{await call('finally');}
      catch(finalError){if(failed)throw new AggregateError([failure,finalError],'Catch and Finally failed.');throw finalError;}
      if(failed)throw failure;
      break;
    }
    default:throw new Error('Unsupported graph control.');
  }
  return Object.fromEntries(b.signature.outputs.filter(p=>Object.hasOwn(result,p.name)).map(p=>[graphOutputPort(p),result[p.name]]));
}
