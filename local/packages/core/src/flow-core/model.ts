import type {ScalarName} from './scalars.js';
export type TypeRef =
  | { kind: 'scalar'; name: ScalarName }
  | { kind: 'nullable'; inner: TypeRef }
  | { kind: 'string' | 'number' | 'boolean' | 'null' | 'pageConfig' }
  | { kind: 'graph'; signature: FlowInterface }
  | { kind: 'grouping'; key: TypeRef; items: TypeRef }
  | { kind: 'dictionary' | 'array' | 'queryable' | 'orderedQueryable' | 'enumerable'; items: TypeRef }
  | { kind: 'object'; fields: Record<string, TypeRef> }
  | { kind: 'optional'; inner: TypeRef }
  | { kind: 'entity' | 'entityRef'; name: string };
export interface EntityDefinition { id: string; kind: 'entity'; fields: Record<string, TypeRef> }
export interface TypeDocument { schemaVersion: 1; types: EntityDefinition[] }
export type Environment = 'server' | 'browser';
export interface PortMetadata { editor?:{kind:"html";editors:("monaco"|"tinymce")[]}; label?: string; description?: string; order?: number; requiredWhen?: {config:string;value:string} }
export interface NodeMetadata { efTargets?:EfNodeBinding[]; efInputs?:Record<string,Record<string,TypeRef>>; label?: string; description?: string; category?: string; inputs?: Record<string, PortMetadata>; outputs?: Record<string, PortMetadata> }
export type ConfigField = PortMetadata & ({type: 'string'; default: string; options?: string[]} | {type: 'number'; default: number} | {type: 'boolean'; default: boolean} | {type:'scalar'; scalar:ScalarName; default:string|number|boolean});
export interface FlowControlPorts {input:boolean;output:boolean}
export interface ControlFlow extends FlowControlPorts {start:boolean}
export interface GraphNodeBinding {operation:'parallelMap'|'timeout'|'retry'|'repeat'|'while'|'reference'|'invoke'|'if'|'ifElse'|'switch'|'forEach'|'map'|'filter'|'aggregate'|'flatMap'|'any'|'all'|'find'|'findIndex'|'takeWhile'|'skipWhile'|'partition'|'sortBy'|'distinctBy'|'groupBy'|'minBy'|'maxBy'|'joinByKey'|'leftJoinByKey'|'groupJoinByKey'|'try';signature:FlowInterface;graphId?:string;cases?:string[]}
export interface ValueNodeBinding {operation:'dictCreate'|'dictGet'|'dictTryGet'|'dictSet'|'dictRemove'|'dictContainsKey'|'dictKeys'|'dictValues'|'ternary'|'coalesce'|'input'|'output'|'null'|'isNull'|'isMissing'|'require'|'hasField'|'removeField'|'merge'|'getProperty'|'record'|'withFields'|'list'|'count'|'getItem'|'addItem'|'addRange'|'insertItem'|'insertRange'|'setItem'|'removeAt'|'removeRange'|'clear'|'removeItem'|'removeAll'|'tryGetItem'|'first'|'last'|'tryFirst'|'tryLast'|'single'|'trySingle'|'contains'|'indexOf'|'lastIndexOf'|'isEmpty'|'skip'|'take'|'slice'|'reverse'|'chunk'|'flatten'|'sort'|'distinct'|'union'|'intersect'|'except'|'zip'|'sum'|'average'|'min'|'max'|'jsonFrom'|'jsonTo';type:TypeRef;member?:string;result?:TypeRef;fields?:string[];count?:number}
export interface QueryNodeBinding {predicate?:boolean;operation:'any'|'first'|'firstOrDefault'|'toList'|'where'|'all'|'orderBy'|'thenBy'|'select'|'groupBy'|'skip'|'take'|'count';element:TypeRef;result?:TypeRef;parameters?:Record<string,TypeRef>}
export interface EfNodeBinding {context:string;entity?:string;collection?:string}
export interface UiNodeBinding {dataType:TypeRef}
export interface NodeDefinition {
  ui?:UiNodeBinding;
  ef?:EfNodeBinding;
  nodeId?:string;
  value?:ValueNodeBinding;
  query?:QueryNodeBinding;
  graph?:GraphNodeBinding;
  control?: ControlFlow;
  flowPort?: 'input'|'output';
  type: string; version: number; environments: Environment[];
  inputs: Record<string, TypeRef>; outputs: Record<string, TypeRef>;
  metadata?: NodeMetadata; config?: Record<string, ConfigField>;
}
export interface Catalog { schemaVersion: 1; nodes: NodeDefinition[] }
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface FlowNode {
  ui?:UiNodeBinding;
  ef?:EfNodeBinding;
  inlineInputs?:Record<string,{enabled:boolean;value?:JsonValue}>;
  value?:ValueNodeBinding;
  query?:QueryNodeBinding;
  graph?:GraphNodeBinding;
  id: string; type: string; typeVersion: number; environment: Environment; config: Record<string, JsonValue>;
}
export interface PortAddress { nodeId: string; port: string }
export interface Flow {
  designation?: string;
  schemaVersion: 2; id: string; version: number; mode: 'backend' | 'interactive' | 'hybrid';
  control?: FlowControlPorts;
  nodes: FlowNode[]; connections: { kind?: 'data'|'control'; source: PortAddress; target: PortAddress; codec?: CodecReference }[]; entryNodeId?: string;
}
export interface Diagnostic { code: string; path: string; message: string; severity?:'error'|'warning'|'info'; keyword?:string; params?:Record<string,unknown>; expectedType?:string; actualType?:string }

export interface CodecReference { typeId: string; version: number }
export interface CodecDefinition extends CodecReference { valueType: TypeRef; wireSchema: Record<string, unknown> }
export interface CodecCatalog { schemaVersion: 1; environment: Environment; codecs: CodecDefinition[] }
export interface WireEnvelope { schemaVersion: 1; typeId: string; codecVersion: number; payload: JsonValue }

export interface FlowParameter {name:string;nodeId:string;type:TypeRef}
export interface FlowInterface {inputs:FlowParameter[];outputs:FlowParameter[];control:FlowControlPorts}

export interface GraphReference {graphId:string;revision:number}
export interface GraphBundle {schemaVersion:1;rootGraphId:string;graphs:Flow[]}
