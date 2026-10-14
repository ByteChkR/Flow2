import { nullLogger } from './trace.js';
import type { FlowLogger } from './trace.js';
import { configDefaults, validateConfig,requireFlowValues } from '@adam-flow/core/flow-core/index.js';
import type { AuthoredNode } from './authoring.js';
import { ContractError, TypeRegistry, canonicalJson, parseContract, validateCatalog, validateCodecCatalog, validateValue } from '@adam-flow/core/flow-core/index.js';
import type { Catalog, CodecCatalog, Environment, FlowParameter, JsonValue, NodeDefinition, TypeDocument, TypeRef } from '@adam-flow/core/flow-core/index.js';

export interface NodeContext { nodeId: string; config: Readonly<Record<string, JsonValue>>; signal?: AbortSignal; onWait?:(durationMs:number)=>void; log:FlowLogger }
export type NodeImplementation = (inputs: Readonly<Record<string, unknown>>, context: NodeContext) => Record<string, unknown> | Promise<Record<string, unknown>>;
export interface NodeInvocation {
  nodeId: string; type: string; typeVersion: number; environment: Environment;
  inputs: Record<string, unknown>; config?: Record<string, JsonValue>;
}
export class NodeExecutionError extends Error {
  constructor(public readonly nodeId: string, cause: unknown) { super(`Node ${nodeId}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
}

export class BrowserNodeRegistry {
  prepare?:(flow:import('@adam-flow/core/flow-core/model.js').Flow)=>void;
  private readonly nodes = new Map<string, { definition: NodeDefinition; execute: NodeImplementation }>();
  private readonly types: TypeRegistry;
  private metadata?:Map<string,NodeDefinition>;
  get registrationCount():number {return this.nodes.size;}
  /** Reuse validated definitions only; implementations and prepare callbacks are never copied. */
  forkMetadata():BrowserNodeRegistry {
    this.metadata??=new Map([...this.nodes.values()].map(({definition})=>[canonicalJson(definition),definition]));
    const fork=new BrowserNodeRegistry(this.types);fork.metadata=this.metadata;return fork;
  }
  constructor(document: TypeDocument|TypeRegistry) { this.types = document instanceof TypeRegistry?document:new TypeRegistry(document); }

  register(node: AuthoredNode): void;
  register(definition: NodeDefinition, execute: NodeImplementation): void;
  register(value: NodeDefinition | AuthoredNode, implementation?: NodeImplementation): void {
    const definition = 'definition' in value ? value.definition : value;
    const execute = 'definition' in value ? value.execute : implementation!;
    const metadataKey=this.metadata?canonicalJson(definition):undefined;
    let prepared=metadataKey===undefined?undefined:this.metadata!.get(metadataKey);
    if(!prepared)validateCatalog({ schemaVersion: 1, nodes: [definition] }, this.types);
    if (!definition.environments.includes('browser')) throw new Error(`Node ${definition.type} is not available in browser.`);
    const key = this.key(definition.type, definition.version, 'browser',definition.nodeId);
    if (this.nodes.has(key)) throw new Error(`Duplicate implementation ${key}.`);
    prepared??={ ...structuredClone(definition), environments: ['browser'] };
    if(metadataKey!==undefined)this.metadata!.set(metadataKey,prepared);
    this.nodes.set(key, { definition:prepared, execute });
  }

  get catalog(): Catalog { return { schemaVersion: 1, nodes: [...this.nodes.values()].map(node => structuredClone(node.definition)) }; }

  execute(invocation: NodeInvocation, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.executeAsync(invocation, signal);
  }

  async executeAsync(invocation: NodeInvocation, signal?: AbortSignal, log:FlowLogger=nullLogger, measure?:(durationMs:number,waitMs:number)=>void): Promise<Record<string, unknown>> {
    try {
      const key = this.key(invocation.type, invocation.typeVersion, invocation.environment);
      const node = this.nodes.get(this.key(invocation.type,invocation.typeVersion,invocation.environment,invocation.nodeId))??this.nodes.get(key);
      if (!node) throw new Error(`Unknown implementation ${key}.`);
      this.validatePorts(node.definition.inputs, invocation.inputs);
      const config = {...configDefaults(node.definition.config),...invocation.config};
      const errors = validateConfig(node.definition.config,config);
      if(errors.length) throw new ContractError(errors);
      signal?.throwIfAborted();
      let waitMs=0;
      const started=measure?performance.now():0;
      let result:Record<string,unknown>;
      try {result = await node.execute(invocation.inputs, { nodeId: invocation.nodeId, config, log, ...(measure?{onWait:(duration:number)=>{waitMs+=duration;}}:{}), ...(signal ? {signal} : {}) });}
      finally {if(measure)measure(performance.now()-started,waitMs);}
      signal?.throwIfAborted();
      this.validatePorts(node.definition.outputs, result);
      return result;
    } catch (cause) { throw new NodeExecutionError(invocation.nodeId, cause); }
  }

  requireFlowValues(parameters:FlowParameter[],values:Record<string,JsonValue>,path='/inputs'):void { requireFlowValues(parameters,values,path,this.types); }

  private key(type: string, version: number, environment: Environment,nodeId?:string): string { return `${type}@${version}/${environment}/${nodeId??''}`; }
  private validatePorts(ports: Record<string, TypeRef>, values: Record<string, unknown>): void {
    if (!values || typeof values !== 'object' || Array.isArray(values) || typeof values['then'] === 'function') throw new Error('Node values must be a synchronous port object.');
    for (const key of Object.keys(values)) if (!Object.hasOwn(ports, key)) throw new Error(`Unknown port ${key}.`);
    const errors = Object.entries(ports).flatMap(([name, type]) => validateValue(type, Object.hasOwn(values, name) ? values[name] : undefined, this.types, `/${name}`));
    if (errors.length) throw new ContractError(errors);
  }
}

export async function loadServerCatalog(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<{ catalog: Catalog; types: TypeDocument; codecs: CodecCatalog }> {
  const read = async (path: string): Promise<string> => {
    const response = await fetcher(path, signal ? { signal } : {});
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  };
  const [catalogJson, typesJson, codecsJson] = await Promise.all([read('/api/catalog'), read('/api/types'), read('/api/codecs')]);
  const types = parseContract('types', typesJson);
  const catalog = parseContract('catalog', catalogJson);
  validateCatalog(catalog, new TypeRegistry(types));
  const codecs = parseContract('codecs', codecsJson);
  const codecErrors = validateCodecCatalog(codecs, new TypeRegistry(types));
  if (codecErrors.length) throw new ContractError(codecErrors);
  if (codecs.environment !== 'server') throw new Error('Expected server codec capabilities.');
  return { catalog, types, codecs };
}
export * from './codecs.js';

export * from "./segments.js";

export * from "./orchestrator.js";

export * from './trace.js';

export * from "./workspace.js";
export * from './editor.js';

export * from './authoring.js';

export * from './scalar-codecs.js';

export * from './value-codecs.js';
