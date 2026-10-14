import type { CodecCatalog, CodecDefinition, CodecReference, Diagnostic, TypeRef } from './model.js';
import { compileWireSchema, validateSchema } from './schema.js';
import { isAssignable, TypeRegistry } from './types.js';

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function isTransportable(type: TypeRef): boolean {
  if (type.kind === 'entity') return false;
  if (type.kind === 'array') return isTransportable(type.items);
  if (type.kind === 'optional') return isTransportable(type.inner);
  if (type.kind === 'object') return Object.values(type.fields).every(isTransportable);
  return true;
}
export function validateCodecCatalog(value: unknown, registry: TypeRegistry): Diagnostic[] {
  const errors = validateSchema('codecs', value);
  if (errors.length) return errors;
  const seen = new Set<string>();
  for (const codec of (value as CodecCatalog).codecs) {
    const path = `${codec.typeId}/${codec.version}`;
    if (seen.has(path)) errors.push({ code: 'duplicate_codec', path, message: 'Duplicate codec.' });
    seen.add(path);
    errors.push(...registry.check(codec.valueType, path));
    if (!isTransportable(codec.valueType) || codec.valueType.kind === 'optional') errors.push({ code: 'not_transportable', path, message: 'Codec cannot transport local entities or a top-level absent value.' });
    try { compileWireSchema(codec.wireSchema); } catch { errors.push({ code: 'wire_schema', path, message: 'Invalid or unsupported wire schema.' }); }
  }
  return errors;
}
export function findCodec(catalog: CodecCatalog, reference: CodecReference): CodecDefinition | undefined {
  return catalog.codecs.find(codec => codec.typeId === reference.typeId && codec.version === reference.version);
}
export function validateBoundary(source: TypeRef, target: TypeRef, reference: CodecReference | undefined,
  sourceCodecs: CodecCatalog, targetCodecs: CodecCatalog, registry: TypeRegistry): Diagnostic[] {
  const errors = [...validateCodecCatalog(sourceCodecs, registry), ...validateCodecCatalog(targetCodecs, registry)];
  if (errors.length) return errors;
  const fail = (code: string, message: string): Diagnostic[] => [{ code, path: '', message }];
  if (!isAssignable(source, target, registry)) return fail('type_mismatch', 'Boundary port types are incompatible.');
  if (!isTransportable(source)) return fail('not_transportable', 'Local entities require an explicit projection.');
  if (!reference) return fail('missing_codec', 'Boundary requires an explicit codec.');
  const sender = findCodec(sourceCodecs, reference), receiver = findCodec(targetCodecs, reference);
  if (!sender || !receiver) return fail('missing_codec', 'Codec must be registered at both endpoints.');
  if (canonicalJson(sender) !== canonicalJson(receiver)) return fail('codec_mismatch', 'Endpoint codec definitions differ.');
  if (canonicalJson(source) !== canonicalJson(sender.valueType) || !isAssignable(receiver.valueType, target, registry)) return fail('codec_type', 'Codec does not represent this port type.');
  return [];
}
