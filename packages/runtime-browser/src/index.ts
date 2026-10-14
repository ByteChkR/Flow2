import { configDefaults, validateConfig } from '@adam-flow/flow-core';
import type { AuthoredNode } from './authoring.js';
import { ContractError, TypeRegistry, parseContract, validateCatalog, validateCodecCatalog, validateValue } from '@adam-flow/flow-core';
import type { Catalog, CodecCatalog, Environment, JsonValue, NodeDefinition, TypeDocument, TypeRef } from '@adam-flow/flow-core';

export interface NodeContext { nodeId: string; config: Readonly<Record<string, JsonValue>> }
export type NodeImplementation = (inputs: Readonly<Record<string, unknown>>, context: NodeContext) => Record<string, unknown>;
export interface NodeInvocation {
  nodeId: string; type: string; typeVersion: number; environment: Environment;
  inputs: Record<string, unknown>; config?: Record<string, JsonValue>;
}
export class NodeExecutionError extends Error {
  constructor(public readonly nodeId: string, cause: unknown) { super(`Node ${nodeId}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
}

export class BrowserNodeRegistry {
  private readonly nodes = new Map<string, { definition: NodeDefinition; execute: NodeImplementation }>();
  private readonly types: TypeRegistry;
  constructor(document: TypeDocument) { this.types = new TypeRegistry(document); }

  register(node: AuthoredNode): void;
  register(definition: NodeDefinition, execute: NodeImplementation): void;
  register(value: NodeDefinition | AuthoredNode, implementation?: NodeImplementation): void {
    const definition = 'definition' in value ? value.definition : value;
    const execute = 'definition' in value ? value.execute : implementation!;
    validateCatalog({ schemaVersion: 1, nodes: [definition] }, this.types);
    if (!definition.environments.includes('browser')) throw new Error(`Node ${definition.type} is not available in browser.`);
    const key = this.key(definition.type, definition.version, 'browser');
    if (this.nodes.has(key)) throw new Error(`Duplicate implementation ${key}.`);
    this.nodes.set(key, { definition: { ...structuredClone(definition), environments: ['browser'] }, execute });
  }

  get catalog(): Catalog { return { schemaVersion: 1, nodes: [...this.nodes.values()].map(node => structuredClone(node.definition)) }; }

  execute(invocation: NodeInvocation): Record<string, unknown> {
    try {
      const key = this.key(invocation.type, invocation.typeVersion, invocation.environment);
      const node = this.nodes.get(key);
      if (!node) throw new Error(`Unknown implementation ${key}.`);
      this.validatePorts(node.definition.inputs, invocation.inputs);
      const config = {...configDefaults(node.definition.config),...invocation.config};
      const errors = validateConfig(node.definition.config,config);
      if(errors.length) throw new ContractError(errors);
      const result = node.execute(invocation.inputs, { nodeId: invocation.nodeId, config });
      this.validatePorts(node.definition.outputs, result);
      return result;
    } catch (cause) { throw new NodeExecutionError(invocation.nodeId, cause); }
  }

  private key(type: string, version: number, environment: Environment): string { return `${type}@${version}/${environment}`; }
  private validatePorts(ports: Record<string, TypeRef>, values: Record<string, unknown>): void {
    if (!values || typeof values !== 'object' || Array.isArray(values) || typeof values['then'] === 'function') throw new Error('Node values must be a synchronous port object.');
    for (const key of Object.keys(values)) if (!Object.hasOwn(ports, key)) throw new Error(`Unknown port ${key}.`);
    const errors = Object.entries(ports).flatMap(([name, type]) => validateValue(type, Object.hasOwn(values, name) ? values[name] : undefined, this.types, `/${name}`));
    if (errors.length) throw new ContractError(errors);
  }
}

export async function loadServerCatalog(fetcher: typeof fetch = fetch): Promise<{ catalog: Catalog; types: TypeDocument; codecs: CodecCatalog }> {
  const read = async (path: string): Promise<string> => {
    const response = await fetcher(path, { signal: AbortSignal.timeout(5000) });
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
