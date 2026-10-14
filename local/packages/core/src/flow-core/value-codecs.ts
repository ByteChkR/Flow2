import {dictionaryShape} from './dictionaries.js';
import {codecIdentity} from './graph-nodes.js';
import {isTransportable} from './transport.js';
import type {CodecDefinition,TypeRef} from './model.js';

function schema(type:TypeRef):Record<string,unknown> {
  switch(type.kind){
    case 'pageConfig':return {type:'object'};
    case 'scalar':return {type:type.name==='core.Bool'?'boolean':type.name==='core.Integer'?'integer':'string'};
    case 'number':case 'string':case 'boolean':case 'null':return {type:type.kind};
    case 'nullable':return {anyOf:[{type:'null'},schema(type.inner)]};
    case 'dictionary':return schema(dictionaryShape(type.items));
    case 'array':return {type:'array',items:schema(type.items)};
    case 'object':return {type:'object',properties:Object.fromEntries(Object.entries(type.fields).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,field])=>[name,schema(field.kind==='optional'?field.inner:field)])),required:Object.keys(type.fields).filter(name=>type.fields[name]!.kind!=='optional').sort(),additionalProperties:false};
    case 'entityRef':return {type:'object',properties:{type:{type:'string',const:type.name},id:{type:'string',minLength:1}},required:['type','id'],additionalProperties:false};
    case 'graph':return {type:'object',properties:{graphId:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_.-]*$'},revision:{type:'integer',minimum:1,maximum:2147483647}},required:['graphId','revision'],additionalProperties:false};
    default:throw new Error('Absent values are allowed only as optional record fields in a value codec.');
  }
}
export function valueCodecDefinition(type:TypeRef):CodecDefinition {
  if(!isTransportable(type))throw new Error('Native entities require an explicit projection.');
  return {typeId:codecIdentity(type,'core.Value.'),version:1,valueType:structuredClone(type),wireSchema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{value:schema(type.kind==='optional'?type.inner:type)},required:type.kind==='optional'?[]:['value'],additionalProperties:false}};
}
/** Match native record projection: wire payloads contain only declared fields. */
export function valueWireShape(type:TypeRef,value:unknown):unknown {
  if(type.kind==='nullable')return value===null?null:valueWireShape(type.inner,value);
  if(type.kind==='optional')return valueWireShape(type.inner,value);
  if(type.kind==='dictionary')return valueWireShape(dictionaryShape(type.items),value);
  if(type.kind==='array')return (value as unknown[]).map(item=>valueWireShape(type.items,item));
  if(type.kind==='object')return Object.fromEntries(Object.entries(type.fields).filter(([name])=>Object.hasOwn(value as object,name)).map(([name,field])=>[name,valueWireShape(field,(value as Record<string,unknown>)[name])]));
  return value;
}
