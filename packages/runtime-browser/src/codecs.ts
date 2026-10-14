import { ContractError, TypeRegistry, canonicalJson, compileWireSchema, isAssignable, parseContract, validateCodecCatalog, validateValue } from '@adam-flow/flow-core';
import type { CodecCatalog, CodecDefinition, CodecReference, Environment, TypeDocument, TypeRef } from '@adam-flow/flow-core';

export interface RegisteredCodec { definition: CodecDefinition; encode: (value: unknown) => unknown; decode: (payload: unknown) => unknown }
export class BrowserCodecRegistry {
  private readonly codecs = new Map<string, { codec: RegisteredCodec; validate: (value: unknown) => boolean }>();
  private readonly types: TypeRegistry;
  constructor(types: TypeDocument, private readonly environment: Environment = 'browser') { this.types = new TypeRegistry(types); }
  get catalog(): CodecCatalog { return { schemaVersion: 1, environment: this.environment, codecs: [...this.codecs.values()].map(entry => structuredClone(entry.codec.definition)) }; }
  register(codec: RegisteredCodec): void {
    if (typeof codec.encode !== 'function' || typeof codec.decode !== 'function') throw new Error('Both encode and decode implementations are required.');
    const definition = structuredClone(codec.definition);
    const errors = validateCodecCatalog({ schemaVersion: 1, environment: this.environment, codecs: [definition] }, this.types);
    if (errors.length) throw new ContractError(errors);
    const key = this.key(definition);
    if (this.codecs.has(key)) throw new Error('Duplicate codec.');
    this.codecs.set(key, { codec: { ...codec, definition }, validate: compileWireSchema(definition.wireSchema) });
  }
  encode(reference: CodecReference, value: unknown): string {
    const { codec, validate } = this.resolve(reference);
    this.validateValue(codec.definition.valueType, value);
    const payload = codec.encode(value);
    if (!validate(payload)) this.fail('wire_payload', 'Encoder returned an invalid wire payload.');
    // Force the boundary through actual JSON; never hand an object reference to the peer.
    const json = JSON.stringify({ schemaVersion: 1, typeId: reference.typeId, codecVersion: reference.version, payload });
    const envelope = parseContract('envelope', json);
    if (!validate(envelope.payload)) this.fail('wire_payload', 'Payload changed during serialization.');
    return json;
  }
  decode(expected: CodecReference, json: string, target: TypeRef): unknown {
    const { codec, validate } = this.resolve(expected);
    const envelope = parseContract('envelope', json);
    if (envelope.typeId !== expected.typeId || envelope.codecVersion !== expected.version) this.fail('codec_mismatch', 'Unexpected envelope codec.');
    if (!isAssignable(codec.definition.valueType, target, this.types)) this.fail('codec_type', 'Decoded type is incompatible with target port.');
    if (!validate(envelope.payload)) this.fail('wire_payload', 'Invalid wire payload.');
    const result = codec.decode(envelope.payload);
    this.validateValue(codec.definition.valueType, result); this.validateValue(target, result);
    return result;
  }
  private validateValue(type: TypeRef, value: unknown): void { const errors = validateValue(type, value, this.types); if (errors.length) throw new ContractError(errors); }
  private key(reference: CodecReference): string { return canonicalJson([reference.typeId, reference.version]); }
  private resolve(reference: CodecReference) { const result = this.codecs.get(this.key(reference)); if (!result) this.fail('missing_codec', 'Codec is not registered in this runtime.'); return result!; }
  private fail(code: string, message: string): never { throw new ContractError([{ code, path: '', message }]); }
}
