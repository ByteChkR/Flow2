import Ajv2020 from 'ajv/dist/2020.js';
import typeSchema from '@adam-flow/contracts/type';
import typesSchema from '@adam-flow/contracts/types';
import catalogSchema from '@adam-flow/contracts/catalog';
import flowSchema from '@adam-flow/contracts/flow';
import codecsSchema from '@adam-flow/contracts/codecs';
import envelopeSchema from '@adam-flow/contracts/envelope';
import type { Catalog, CodecCatalog, WireEnvelope, Diagnostic, Flow, TypeDocument, TypeRef } from './model.js';

const ajv = new Ajv2020({ allErrors: true, strict: true, ownProperties: true });
for (const schema of [typeSchema, typesSchema, catalogSchema, flowSchema, codecsSchema, envelopeSchema]) ajv.addSchema(schema);
const schemas = { type: typeSchema, types: typesSchema, catalog: catalogSchema, flow: flowSchema, codecs: codecsSchema, envelope: envelopeSchema };
export type SchemaName = keyof typeof schemas;
export function validateSchema(name: SchemaName, value: unknown): Diagnostic[] {
  const validate = ajv.getSchema(schemas[name].$id)!;
  return validate(value) ? [] : (validate.errors ?? []).map(error => ({
    code: 'schema', path: error.instancePath, message: `${error.message ?? 'Invalid document'} (${error.schemaPath})`,
  }));
}
export class ContractError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) { super(diagnostics.map(d => `${d.path}: ${d.message}`).join('\n')); }
}
interface Documents { type: TypeRef; types: TypeDocument; catalog: Catalog; flow: Flow; codecs: CodecCatalog; envelope: WireEnvelope }
export function parseContract<K extends SchemaName>(name: K, json: string): Documents[K] {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new ContractError([{ code: 'json', path: '', message: 'Invalid JSON.' }]); }
  const errors = validateSchema(name, value);
  if (errors.length) throw new ContractError(errors);
  return value as Documents[K];
}

// Wire schemas are standalone and trusted only after local registration. No remote references.
export function compileWireSchema(schema: Record<string, unknown>): (value: unknown) => boolean {
  const visit = (value: unknown): void => {
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (key === '$ref' || key === '$dynamicRef') throw new Error('Wire schema references are unsupported.');
      visit(item);
    }
  };
  visit(schema);
  const validate = new Ajv2020({ strict: true, ownProperties: true }).compile(schema);
  return value => validate(value) === true;
}
