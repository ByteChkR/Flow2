import { ContractError, TypeRegistry, parseContract, validateBoundary } from '@adam-flow/flow-core';
import type { CodecCatalog, CodecReference } from '@adam-flow/flow-core';
import { compileBoundaries } from '@adam-flow/flow-compiler';
import { BrowserCodecRegistry } from '@adam-flow/runtime-browser';
import { createBrowserCodecs, contactCodec } from '@adam-flow/nodes-browser';
import typesJson from '../../contracts/examples/v1/types.json';
import catalogJson from '../../contracts/examples/v1/catalog.json';
import flowJson from '../../contracts/examples/v1/contact.flow.json';
import codecsJson from '../../contracts/examples/v1/codecs.json';
import boundaries from '../fixtures/v1/boundaries.json';
import payloads from '../fixtures/v1/payloads.json';

const types = parseContract('types', JSON.stringify(typesJson));
const registry = new TypeRegistry(types);
const server = parseContract('codecs', JSON.stringify(codecsJson));
const receiver = createBrowserCodecs(types);
const dto = server.codecs.find(codec => codec.typeId === contactCodec.typeId)!.valueType;
const codes = (errors: { code: string }[]) => [...new Set(errors.map(error => error.code))].sort();
function equal(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
export const transportCases: { name: string; run: () => void }[] = boundaries.map(test => ({ name: `boundary/${test.name}`, run: () => {
  equal(codes(validateBoundary(parseContract('type', JSON.stringify(test.source)), parseContract('type', JSON.stringify(test.target)),
    test.codec === null ? undefined : test.codec as CodecReference, test.sender as CodecCatalog, test.receiver as CodecCatalog, registry)), [...test.codes].sort());
} }));
for (const test of payloads) transportCases.push({ name: `payload/${test.name}`, run: () => {
  let errors: string[] = [];
  try { receiver.decode(contactCodec, test.json, dto); }
  catch (error) { if (!(error instanceof ContractError)) throw error; errors = codes(error.diagnostics); }
  equal(errors, [...test.codes].sort());
} });
transportCases.push({ name: 'transport/JSON creates a fresh DTO with preserved fields', run: () => {
  const source = { id: 'contact-1', name: 'Ada', age: 37 };
  const result = receiver.decode(contactCodec, receiver.encode(contactCodec, source), dto);
  equal(result, source); if (result === source) throw new Error('Object reference crossed JSON boundary.');
} });
transportCases.push({ name: 'transport/compiler finds both boundaries but leaves local entity edges alone', run: () => {
  const flow = parseContract('flow', JSON.stringify(flowJson));
  const catalog = parseContract('catalog', JSON.stringify(catalogJson));
  const result = compileBoundaries(flow, catalog, types, { server, browser: receiver.catalog });
  equal(result.diagnostics, []); equal(result.boundaries.map(boundary => boundary.connectionIndex), [0, 3]);
  delete flow.connections[3]!.codec;
  equal(codes(compileBoundaries(flow, catalog, types, { server, browser: receiver.catalog }).diagnostics), ['missing_codec']);
} });
transportCases.push({ name: 'transport/broken encoder is rejected', run: () => {
  const broken = new BrowserCodecRegistry(types); broken.register({ definition: server.codecs[1]!, encode: () => ({ id: '1' }), decode: value => value });
  try { broken.encode(contactCodec, { id: '1', name: 'Ada' }); } catch (error) { if (error instanceof ContractError) return; throw error; }
  throw new Error('Invalid encoded payload accepted.');
} });
transportCases.push({ name: 'transport/broken decoder is rejected after wire validation', run: () => {
  const broken = new BrowserCodecRegistry(types); broken.register({ definition: server.codecs[1]!, encode: value => value, decode: () => ({ id: '1' }) });
  try { broken.decode(contactCodec, payloads[0]!.json, dto); } catch (error) { if (error instanceof ContractError) return; throw error; }
  throw new Error('Invalid decoded value accepted.');
} });
transportCases.push({ name: 'transport/entity reference stays a reference and roundtrips', run: () => {
  const definition = boundaries.find(test => test.name === 'entity-ref')!.sender.codecs[0]!;
  const refRegistry = new BrowserCodecRegistry(types);
  const parsed = parseContract('codecs', JSON.stringify({ schemaVersion: 1, environment: 'browser', codecs: [definition] })).codecs[0]!;
  refRegistry.register({ definition: parsed, encode: value => value, decode: value => value });
  const reference = { type: 'crm.Contact@1', id: 'contact-1' };
  equal(refRegistry.decode(parsed, refRegistry.encode(parsed, reference), parsed.valueType), reference);
} });

transportCases.push({ name: 'transport/compiler rejects an unprojected entity crossing to browser', run: () => {
  const flow = parseContract('flow', JSON.stringify(flowJson));
  const catalog = parseContract('catalog', JSON.stringify(catalogJson));
  flow.connections[3]!.source = { nodeId: 'get', port: 'contact' };
  catalog.nodes.find(node => node.type === 'ui.displayContact')!.inputs['value'] = { kind: 'entity', name: 'crm.Contact@1' };
  const result = compileBoundaries(flow, catalog, types, { server, browser: receiver.catalog });
  equal(codes(result.diagnostics), ['not_transportable']); equal(result.boundaries, []);
} });
transportCases.push({ name: 'transport/encode-only implementation cannot advertise a codec', run: () => {
  const invalid = new BrowserCodecRegistry(types);
  try { invalid.register({ definition: server.codecs[1]!, encode: value => value, decode: undefined! }); }
  catch { equal(invalid.catalog.codecs, []); return; }
  throw new Error('Missing decoder was accepted.');
} });
