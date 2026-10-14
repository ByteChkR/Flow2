import {canonicalJson} from './transport.js';
import Ajv2020 from 'ajv/dist/2020.js';
import bundleSchema from '../contracts/bundle.schema.json';
import expressionSchema from '../contracts/expression.schema.json';
import type {ExpressionGraph} from './expressions.js';
import typeSchema from '../contracts/type.schema.json';
import typesSchema from '../contracts/types.schema.json';
import catalogSchema from '../contracts/catalog.schema.json';
import flowSchema from '../contracts/flow.schema.json';
import codecsSchema from '../contracts/codecs.schema.json';
import envelopeSchema from '../contracts/envelope.schema.json';
import type { GraphBundle, Catalog, CodecCatalog, WireEnvelope, Diagnostic, Flow, TypeDocument, TypeRef } from './model.js';

const ajv = new Ajv2020({ allErrors: true, strict: true, ownProperties: true });
for (const schema of [typeSchema, typesSchema, catalogSchema, flowSchema, codecsSchema, envelopeSchema, bundleSchema,expressionSchema]) ajv.addSchema(schema);
const schemas = {expression:expressionSchema, bundle:bundleSchema, type: typeSchema, types: typesSchema, catalog: catalogSchema, flow: flowSchema, codecs: codecsSchema, envelope: envelopeSchema };
export type SchemaName = keyof typeof schemas;
export function validateSchema(name: SchemaName, value: unknown): Diagnostic[] {
  if(name==='flow'&&value&&typeof value==='object'&&(value as {schemaVersion?:number}).schemaVersion!==2)return [{code:'flow_version',path:'/schemaVersion',message:'Inkompatibles Flow-Format. Erwartet wird Version 2; ältere Graphen werden nicht migriert.'}];
  const validate = ajv.getSchema(schemas[name].$id)!;
  return validate(value) ? [] : (validate.errors ?? []).map(error => ({
    code: 'schema', path: error.instancePath, keyword:error.keyword, params:error.params, message: `${error.message ?? 'Invalid document'} (${error.schemaPath})`,
  }));
}
export class ContractError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) { super(diagnostics.map(d => `${d.path}: ${d.message}`).join('\n')); }
}
interface Documents {expression:ExpressionGraph; bundle:GraphBundle; type: TypeRef; types: TypeDocument; catalog: Catalog; flow: Flow; codecs: CodecCatalog; envelope: WireEnvelope }
export function parseContract<K extends SchemaName>(name: K, json: string): Documents[K] {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new ContractError([{ code: 'json', path: '', message: 'Invalid JSON.' }]); }
  const errors = validateSchema(name, value);
  if (errors.length) throw new ContractError(errors);
  return value as Documents[K];
}

const wireValidators=new Map<string,(value:unknown)=>boolean>();
const maxWireValidators=256;
let reuseWireSchemas=true;
/** Synchronous preparation scope only: restores the setting before any async work resumes. */
export function withWireSchemaCache<T>(enabled:boolean,action:()=>T):T {
 const previous=reuseWireSchemas;reuseWireSchemas=enabled;try{return action();}finally{reuseWireSchemas=previous;}
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
  const key=canonicalJson(schema);
  const cached=reuseWireSchemas?wireValidators.get(key):undefined;if(cached)return cached;
  const validate = new Ajv2020({ strict: true, ownProperties: true }).compile(structuredClone(schema));
  const check=(value:unknown)=>validate(value)===true;
  if(reuseWireSchemas)wireValidators.set(key,check);
  if(wireValidators.size>maxWireValidators)wireValidators.delete(wireValidators.keys().next().value!);
  return check;
}
