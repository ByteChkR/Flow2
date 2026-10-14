import { parseScalar } from '@adam-flow/core/flow-core/scalars.js';
import type { ScalarName } from '@adam-flow/core/flow-core/scalars.js';
import type { FlowInterface, GraphReference, ConfigField, NodeDefinition, PortMetadata, TypeRef } from '@adam-flow/core/flow-core/index.js';
import type { FlowLogger } from './trace.js';
import type { NodeImplementation } from './index.js';

export interface Port<T> { readonly type: TypeRef; readonly metadata: PortMetadata; readonly valueType?: T }
type Ports = Record<string, Port<unknown>>;
export type PortValue<P> = P extends Port<infer T> ? T : never;
export type PortValues<P extends Ports> = { [K in keyof P as undefined extends PortValue<P[K]> ? never : K]: PortValue<P[K]> } &
  { [K in keyof P as undefined extends PortValue<P[K]> ? K : never]?: Exclude<PortValue<P[K]>, undefined> };
const descriptor = <T>(type: TypeRef, metadata: PortMetadata = {}): Port<T> => ({type,metadata});
export const port = {
  scalar: <N extends ScalarName>(name:N,metadata?:PortMetadata)=>descriptor<N extends 'core.Bool'?boolean:N extends 'core.Integer'?number:string>({kind:'scalar',name},metadata),
  nullable: <T>(inner:Port<T>,metadata:PortMetadata=inner.metadata)=>descriptor<T|null>({kind:'nullable',inner:inner.type},metadata),
  graph: (signature:FlowInterface,metadata?:PortMetadata) => descriptor<GraphReference>({kind:'graph',signature:structuredClone(signature)},metadata),
  string: (metadata?: PortMetadata) => descriptor<string>({kind:'string'},metadata),
  number: (metadata?: PortMetadata) => descriptor<number>({kind:'number'},metadata),
  boolean: (metadata?: PortMetadata) => descriptor<boolean>({kind:'boolean'},metadata),
  optional: <T>(inner:Port<T>,metadata:PortMetadata=inner.metadata) => descriptor<T|undefined>({kind:'optional',inner:inner.type},metadata),
  array: <T>(items:Port<T>,metadata?:PortMetadata) => descriptor<T[]>({kind:'array',items:items.type},metadata),
  object: <P extends Ports>(fields:P,metadata?:PortMetadata) => descriptor<PortValues<P>>({kind:'object',fields:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,value.type]))},metadata),
  /** Explicit escape hatch for registered domain types; normal DTOs use object(). */
  custom: <T>(type:TypeRef,metadata?:PortMetadata) => descriptor<T>(type,metadata),
};
type ScalarNative<N extends ScalarName> = N extends 'core.Bool'?boolean:N extends 'core.Integer'?number:string;
export const field = {
  scalar: <N extends ScalarName>(scalar:N,defaultValue:ScalarNative<N>,options:PortMetadata={}):PortMetadata & {type:'scalar';scalar:N;default:ScalarNative<N>} => ({...options,type:'scalar',scalar,default:parseScalar(scalar,defaultValue) as ScalarNative<N>}),
  string: (defaultValue:string,options:PortMetadata & {options?:string[]} = {}):ConfigField & {type:'string'} => ({...options,type:'string',default:defaultValue}),
  number: (defaultValue:number,options:PortMetadata = {}):ConfigField & {type:'number'} => ({...options,type:'number',default:defaultValue}),
  boolean: (defaultValue:boolean,options:PortMetadata = {}):ConfigField & {type:'boolean'} => ({...options,type:'boolean',default:defaultValue}),
};
type ConfigValues<C extends Record<string,ConfigField>> = {[K in keyof C]: C[K]['default']};
export interface AuthoredNode { definition:NodeDefinition; execute:NodeImplementation }
export function defineNode<I extends Ports,O extends Ports,C extends Record<string,ConfigField> = {}>(spec:{
  control?:NodeDefinition['control'];
  flowPort?:NodeDefinition['flowPort'];
  type:string;version:number;label?:string;description?:string;category?:string;
  inputs:I;outputs:O;config?:C;
  execute:(inputs:PortValues<I>,context:{nodeId:string;config:ConfigValues<C>;signal?:AbortSignal;onWait?:(durationMs:number)=>void;log:FlowLogger})=>PortValues<O>|Promise<PortValues<O>>;
}):AuthoredNode {
  const types=(ports:Ports)=>Object.fromEntries(Object.entries(ports).map(([key,value])=>[key,value.type]));
  const labels=(ports:Ports)=>Object.fromEntries(Object.entries(ports).map(([key,value])=>[key,value.metadata]));
  const definition:NodeDefinition={type:spec.type,version:spec.version,environments:['browser'],inputs:types(spec.inputs),outputs:types(spec.outputs),
    metadata:{...(spec.label===undefined?{}:{label:spec.label}),...(spec.description===undefined?{}:{description:spec.description}),...(spec.category===undefined?{}:{category:spec.category}),inputs:labels(spec.inputs),outputs:labels(spec.outputs)},
    ...(spec.flowPort===undefined?{}:{flowPort:spec.flowPort}),
    ...(spec.control===undefined?{}:{control:spec.control}),
    ...(spec.config===undefined?{}:{config:spec.config})};
  return {definition:structuredClone(definition),execute:(inputs,context)=>spec.execute(inputs as PortValues<I>,context as {nodeId:string;config:ConfigValues<C>;log:FlowLogger})};
}
