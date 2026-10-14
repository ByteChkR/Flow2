import {definitionKey} from './node-resolution.js';
import { validateNodeMetadata, configContract } from './config.js';
import type { Catalog, NodeDefinition } from './model.js';
import { ContractError, validateSchema } from './schema.js';
import type { TypeRegistry } from './types.js';

export function validateCatalog(catalog: Catalog, registry: TypeRegistry): void {
  const errors = validateSchema('catalog', catalog);
  if (errors.length) throw new ContractError(errors);
  const keys = new Set<string>();
  for (const node of catalog.nodes) {
    const key = definitionKey(node);
    if (keys.has(key)) throw new Error(`Duplicate node definition ${key}.`);
    keys.add(key);
    errors.push(...validateNodeMetadata(node));
    for (const [name, type] of [...Object.entries(node.inputs), ...Object.entries(node.outputs)]) errors.push(...registry.check(type, `${key}/${name}`));
  }
  if (errors.length) throw new ContractError(errors);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

// Same type/version may be implemented by both environments, but its ports must agree.
export function mergeCatalogs(registry: TypeRegistry, ...catalogs: Catalog[]): Catalog {
  const nodes = new Map<string, NodeDefinition>();
  for (const catalog of catalogs) {
    validateCatalog(catalog, registry);
    for (const definition of catalog.nodes) {
      const key = definitionKey(definition);
      const existing = nodes.get(key);
      if (!existing) { nodes.set(key, structuredClone(definition)); continue; }
      if (existing.environments.some(environment => definition.environments.includes(environment))) throw new Error(`Duplicate implementation ${key}.`);
      if (canonical(existing.inputs) !== canonical(definition.inputs) || canonical(existing.outputs) !== canonical(definition.outputs)) throw new Error(`Conflicting ports for ${key}.`);
      if(canonical(existing.graph??null)!==canonical(definition.graph??null))throw new Error(`Conflicting graph binding for ${key}.`);
      if(existing.flowPort!==definition.flowPort)throw new Error(`Conflicting flow ports for ${key}.`);
      if (canonical(existing.control??null)!==canonical(definition.control??null)) throw new Error(`Conflicting control ports for ${key}.`);
      if (existing.config && definition.config && canonical(configContract(existing.config)) !== canonical(configContract(definition.config))) throw new Error(`Conflicting configuration for ${key}.`);
      if (!existing.config && definition.config) existing.config = structuredClone(definition.config);
      if (!existing.metadata && definition.metadata) existing.metadata = structuredClone(definition.metadata);
      existing.environments.push(...definition.environments);
    }
  }
  return { schemaVersion: 1, nodes: [...nodes.values()] };
}
