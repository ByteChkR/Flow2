import { isAssignable, parseContract, TypeRegistry, validateFlow, validateSchema, validateValue } from '@adam-flow/flow-core';
import type { SchemaName } from '@adam-flow/flow-core';
import types from '../../contracts/examples/v1/types.json';
import catalog from '../../contracts/examples/v1/catalog.json';
import interactive from '../../contracts/examples/v1/contact.flow.json';
import backend from '../../contracts/examples/v1/backend.flow.json';
import assignments from '../fixtures/v1/assignability.json';
import flows from '../fixtures/v1/flows.json';
import values from '../fixtures/v1/values.json';
import schemas from '../fixtures/v1/schemas.json';
import parsing from '../fixtures/v1/parsing.json';

const registry = new TypeRegistry(parseContract('types', JSON.stringify(types)));
export const conformanceCases: { name: string; run: () => void }[] = [];
function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
for (const test of assignments) conformanceCases.push({ name: `assignability/${test.name}`, run: () =>
  equal(isAssignable(parseContract('type', JSON.stringify(test.source)), parseContract('type', JSON.stringify(test.target)), registry), test.expected) });
for (const test of flows) conformanceCases.push({ name: `flow/${test.name}`, run: () =>
  equal([...new Set(validateFlow(test.flow, 'catalog' in test ? test.catalog : catalog, 'types' in test ? test.types : types).map(d => d.code))].sort(), [...test.codes].sort()) });
for (const test of values) conformanceCases.push({ name: `value/${test.name}`, run: () =>
  equal(validateValue(parseContract('type', JSON.stringify(test.type)), 'value' in test ? test.value : undefined, registry).length === 0, test.expected) });
for (const test of schemas) conformanceCases.push({ name: `schema/${test.name}`, run: () =>
  equal(validateSchema(test.schema as SchemaName, test.value).length === 0, test.valid) });
for (const [name, value] of [['flow', interactive], ['flow', backend], ['types', types], ['catalog', catalog]] as const) {
  conformanceCases.push({ name: `roundtrip/${name}/${'id' in value ? value.id : 'document'}`, run: () => {
    const document = parseContract(name, JSON.stringify(value));
    equal(JSON.parse(JSON.stringify(document)), value);
  } });
}

for (const test of parsing) conformanceCases.push({ name: `parsing/${test.name}`, run: () => {
  let valid = false;
  try { parseContract('flow', test.json); valid = true; } catch { /* Expected invalid contract. */ }
  equal(valid, test.valid);
} });
