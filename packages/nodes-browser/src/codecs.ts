import definitions from '@adam-flow/contracts/examples/codecs';
import { parseContract } from '@adam-flow/flow-core';
import type { TypeDocument } from '@adam-flow/flow-core';
import { BrowserCodecRegistry } from '@adam-flow/runtime-browser';

export const stringCodec = { typeId: 'core.String@1', version: 1 };
export const contactCodec = { typeId: 'crm.ContactDTO@1', version: 1 };
export function createBrowserCodecs(types: TypeDocument): BrowserCodecRegistry {
  const registry = new BrowserCodecRegistry(types);
  for (const definition of parseContract('codecs', JSON.stringify(definitions)).codecs) {
    // Native JS DTOs already have the wire shape, but serialization and validation still occur in the registry.
    registry.register({ definition, encode: value => value, decode: value => value });
  }
  return registry;
}
