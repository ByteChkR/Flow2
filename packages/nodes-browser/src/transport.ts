import { ContractError, TypeRegistry, validateBoundary } from '@adam-flow/flow-core';
import type { CodecCatalog, TypeDocument } from '@adam-flow/flow-core';
import type { BrowserCodecRegistry } from '@adam-flow/runtime-browser';
import { contactCodec, stringCodec } from './codecs.js';
import type { ContactDto } from './index.js';

export async function transferContact(id: string, browser: BrowserCodecRegistry, server: CodecCatalog,
  types: TypeDocument, fetcher: typeof fetch = fetch): Promise<ContactDto> {
  const registry = new TypeRegistry(types);
  const dto = browser.catalog.codecs.find(codec => codec.typeId === contactCodec.typeId && codec.version === contactCodec.version);
  if (!dto) throw new Error('Missing local ContactDTO codec.');
  const errors = [
    ...validateBoundary({ kind: 'string' }, { kind: 'string' }, stringCodec, browser.catalog, server, registry),
    ...validateBoundary(dto.valueType, dto.valueType, contactCodec, server, browser.catalog, registry),
  ];
  if (server.environment !== 'server') throw new Error('Expected server capabilities.');
  if (errors.length) throw new ContractError(errors);
  const input = JSON.parse(browser.encode(stringCodec, id));
  const response = await fetcher('/api/demo/transport/contact', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ browserCodecs: browser.catalog, input }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`DTO transport failed: HTTP ${response.status}`);
  return browser.decode(contactCodec, await response.text(), dto.valueType) as ContactDto;
}
