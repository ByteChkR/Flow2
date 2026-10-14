import {executeDictionary} from './dictionary-nodes.js';
import {executeListAdvanced} from './list-advanced.js';
import {executeListSelection} from './list-selection.js';
import {valuesEqual} from '@adam-flow/core/flow-core/value-equality.js';
import {resolveDefinition} from '@adam-flow/core/flow-core/node-resolution.js';
import {canonicalJson} from '@adam-flow/core/flow-core/transport.js';
import {wrapJson,unwrapJson,jsonFromValue,jsonToValue} from '@adam-flow/core/flow-core/json-values.js';
import {coalesceTemplate,valueNodeDefinition} from '@adam-flow/core/flow-core/value-nodes.js';
import type {Flow,NodeDefinition,ValueNodeBinding} from '@adam-flow/core/flow-core/model.js';
import type {BrowserNodeRegistry} from './index.js';
export function executeGeneralValue(b:ValueNodeBinding,inputs:Record<string,unknown>):Record<string,unknown>{
  if(b.operation.startsWith('dict'))return executeDictionary(b,inputs);
  switch(b.operation){
    case 'jsonFrom':return {value:wrapJson(jsonFromValue(b.type,inputs.value))};
    case 'jsonTo':return {value:jsonToValue(b.type,unwrapJson(inputs.value))};
    case 'ternary':{const key=inputs.condition===true?'whenTrue':'whenFalse';return Object.hasOwn(inputs,key)?{value:inputs[key]}:{};}
    case 'null':return {value:null};
    case 'isNull':return {value:inputs.value===null};
    case 'isMissing':return {value:!Object.hasOwn(inputs,'value')};
    case 'require':if(!Object.hasOwn(inputs,'value')||inputs.value===null)throw new Error('Required value is missing or null.');return {value:inputs.value};
    case 'hasField':return {value:b.type.kind==='object'&&Object.hasOwn(b.type.fields,inputs.name as string)&&Object.hasOwn(inputs.value as object,inputs.name as string)};
    case 'removeField':{
      if(b.type.kind!=='object')throw new Error('Expected a record type.');const source=inputs.value as Record<string,unknown>;
      return {value:Object.fromEntries(Object.keys(b.type.fields).filter(name=>name!==b.member&&Object.hasOwn(source,name)).map(name=>[name,source[name]])),removed:Object.hasOwn(source,b.member!)};
    }
    case 'merge':{
      if(b.type.kind!=='object')throw new Error('Expected a record type.');const right=b.result??b.type;if(right.kind!=='object')throw new Error('Expected a record type.');
      const value:Record<string,unknown>=Object.create(null);
      for(const [type,source] of [[b.type,inputs.left],[right,inputs.right]] as const)for(const name of Object.keys(type.fields))if(Object.hasOwn(source as object,name))value[name]=(source as Record<string,unknown>)[name];
      return {value};
    }
    case 'getProperty':{
      if(b.type.kind!=='object')throw new Error('Native entity values require backend execution.');
      const record=inputs.value as Record<string,unknown>;return Object.hasOwn(record,b.member!)?{value:record[b.member!]}:{};
    }
    case 'record':case 'withFields':{
      if(b.type.kind!=='object')throw new Error('Expected a record type.');
      const value:Record<string,unknown>=Object.create(null);
      if(b.operation==='withFields'){const source=inputs.value as Record<string,unknown>;for(const field of Object.keys(b.type.fields))if(Object.hasOwn(source,field))value[field]=source[field];}
      for(const field of b.fields??Object.keys(b.type.fields)){if(Object.hasOwn(inputs,'field_'+field))value[field]=inputs['field_'+field];else delete value[field];}
      return {value};
    }
    case 'tryGetItem':case 'first':case 'last':case 'tryFirst':case 'tryLast':case 'single':case 'trySingle':case 'contains':case 'indexOf':case 'lastIndexOf':case 'isEmpty':case 'skip':case 'take':case 'slice':case 'reverse':case 'chunk':case 'flatten':return executeListSelection(b,inputs);
    case 'sort':case 'distinct':case 'union':case 'intersect':case 'except':case 'zip':case 'sum':case 'average':case 'min':case 'max':return executeListAdvanced(b,inputs);
    case 'removeItem':case 'removeAll':{
      let removedCount=0;
      const value=(inputs.items as unknown[]).filter(item=>{
        if((b.operation==='removeAll'||removedCount===0)&&valuesEqual(b.type,item,inputs.item)){removedCount++;return false;}
        return true;
      });
      return b.operation==='removeItem'?{value,removed:removedCount>0}:{value,removedCount};
    }
    case 'addItem':case 'addRange':case 'insertItem':case 'insertRange':case 'setItem':case 'removeAt':case 'removeRange':case 'clear':{
      const items=inputs.items as unknown[];
      if(b.operation==='clear')return {value:[]};
      const index=inputs.index as number,length=inputs.length as number;
      if(['insertItem','insertRange','setItem','removeAt','removeRange'].includes(b.operation)){
        const endAllowed=['insertItem','insertRange','removeRange'].includes(b.operation);
        if(!Number.isInteger(index)||index<0||index>items.length||(!endAllowed&&index===items.length))throw new Error('Input index: Index out of range.');
      }
      if(b.operation==='removeRange'&&(!Number.isInteger(length)||length<0||length>items.length-index))throw new Error('Input length: Range must fit within the list and length must be non-negative.');
      if(b.operation==='addRange')return {value:items.concat(inputs.additionalItems as unknown[])};
      if(b.operation==='insertRange')return {value:items.slice(0,index).concat(inputs.additionalItems as unknown[],items.slice(index))};
      const value=items.slice();
      if(b.operation.startsWith('dict'))return executeDictionary(b,inputs);
  switch(b.operation){
        case 'addItem':value.push(inputs.item);break;
        case 'insertItem':value.splice(index,0,inputs.item);break;
        case 'setItem':value[index]=inputs.item;break;
        case 'removeAt':{const [removedItem]=value.splice(index,1);return {value,removedItem};}
        case 'removeRange':value.splice(index,length);break;
      }
      return {value};
    }
    case 'list':return {value:Array.from({length:b.count!},(_,i)=>inputs['item_'+i])};
    case 'count':return {value:(inputs.items as unknown[]).length};
    case 'getItem':{const items=inputs.items as unknown[],index=inputs.index as number;if(!Number.isInteger(index)||index<0||index>=items.length)throw new Error('Index out of range.');return {value:items[index]};}
    default:throw new Error('Flow IO requires an execution context.');
  }
}
export const valueImplementation=(definition:NodeDefinition)=>({definition:{...definition,environments:['browser' as const]},execute:(inputs:Record<string,unknown>)=>{if(!definition.value)throw new Error('Value node requires specialization.');return definition.value.operation==='coalesce'?{value:inputs.value??inputs.fallback}:executeGeneralValue(definition.value,inputs);}});
export const coalesceImplementation=(definition:NodeDefinition=coalesceTemplate())=>({definition:{...definition,environments:['browser' as const]},execute:(inputs:Record<string,unknown>)=>({value:inputs.value??inputs.fallback})});
export function registerValueNodes(flow:Flow,nodes:BrowserNodeRegistry):void {
  nodes.prepare?.(flow);
  for(const node of flow.nodes.filter(node=>node.value&&node.environment==='browser')){
    const definition=valueNodeDefinition(node);
    if(!definition.environments.includes('browser'))throw new Error('Dieser Werttyp kann nur im Backend verwendet werden.');
    const existing=nodes.catalog.nodes.find(item=>item.type===node.type&&item.version===node.typeVersion&&item.nodeId===node.id);
    if(existing&&canonicalJson(existing.value)!==canonicalJson(definition.value))throw new Error('Widersprüchliche Wert-Spezialisierung.');
    if(!existing)nodes.register(valueImplementation(definition));
  }
}
