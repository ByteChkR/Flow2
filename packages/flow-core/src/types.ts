import type { Diagnostic, EntityDefinition, TypeDocument, TypeRef } from './model.js';
import { ContractError, validateSchema } from './schema.js';

export class TypeRegistry {
  private readonly entities = new Map<string, EntityDefinition>();
  constructor(document: TypeDocument) {
    const errors = validateSchema('types', document);
    if (errors.length) throw new ContractError(errors);
    for (const entity of document.types) {
      if (this.entities.has(entity.id)) throw new ContractError([{ code: 'duplicate_type', path: entity.id, message: 'Duplicate type ID.' }]);
      this.entities.set(entity.id, structuredClone(entity));
    }
    for (const entity of this.entities.values()) {
      for (const type of Object.values(entity.fields)) errors.push(...this.check(type));
    }
    if (errors.length) throw new ContractError(errors);
  }
  has(id: string): boolean { return this.entities.has(id); }
  check(type: TypeRef, path = ''): Diagnostic[] {
    if (type.kind === 'entity' || type.kind === 'entityRef') return this.has(type.name) ? [] : [{ code: 'unknown_type', path, message: `Unknown type ${type.name}.` }];
    if (type.kind === 'array') return this.check(type.items, `${path}/items`);
    if (type.kind === 'optional') return this.check(type.inner, `${path}/inner`);
    if (type.kind === 'object') return Object.entries(type.fields).flatMap(([key, value]) => this.check(value, `${path}/fields/${key}`));
    return [];
  }
}

// Nominal entities; structural objects with width subtyping; optional means absence, not null.
export function isAssignable(source: TypeRef, target: TypeRef, registry: TypeRegistry): boolean {
  if (registry.check(source).length || registry.check(target).length) return false;
  if (target.kind === 'optional') return isAssignable(source.kind === 'optional' ? source.inner : source, target.inner, registry);
  if (source.kind === 'optional' || source.kind !== target.kind) return false;
  if (source.kind === 'entity' || source.kind === 'entityRef') return (target.kind === 'entity' || target.kind === 'entityRef') && source.name === target.name;
  if (source.kind === 'array' && target.kind === 'array') return isAssignable(source.items, target.items, registry);
  if (source.kind === 'object' && target.kind === 'object') return Object.entries(target.fields).every(([name, type]) =>
    Object.hasOwn(source.fields, name) ? isAssignable(source.fields[name]!, type, registry) : type.kind === 'optional');
  return true;
}

// For JSON/wire values only. Runtime entity identity must be checked by the owning runtime.
export function validateValue(type: TypeRef, value: unknown, registry: TypeRegistry, path = ''): Diagnostic[] {
  const unknown = registry.check(type, path);
  if (unknown.length) return unknown;
  if (type.kind === 'optional') return value === undefined ? [] : validateValue(type.inner, value, registry, path);
  const fail = (message: string): Diagnostic[] => [{ code: 'value_type', path, message }];
  if (type.kind === 'entity') return fail('Runtime entities are not JSON values. Use an explicit projection.');
  if (type.kind === 'entityRef') {
    if (!isObject(value) || Object.keys(value).length !== 2 || value['type'] !== type.name || typeof value['id'] !== 'string' || value['id'].length === 0) return fail('Expected entity reference { type, id }.');
    return [];
  }
  if (type.kind === 'null') return value === null ? [] : fail('Expected null.');
  if (type.kind === 'string' || type.kind === 'boolean') return typeof value === type.kind ? [] : fail(`Expected ${type.kind}.`);
  if (type.kind === 'number') return typeof value === 'number' && Number.isFinite(value) ? [] : fail('Expected finite number.');
  if (type.kind === 'array') return Array.isArray(value) ? Array.from(value).flatMap((item, index) => validateValue(type.items, item, registry, `${path}/${index}`)) : fail('Expected array.');
  if (type.kind === 'object') return isObject(value) ? Object.entries(type.fields).flatMap(([key, field]) => validateValue(field, Object.hasOwn(value, key) ? value[key] : undefined, registry, `${path}/${key}`)) : fail('Expected object.');
  return fail('Unsupported value.');
}
function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
