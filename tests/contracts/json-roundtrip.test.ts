import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('shared fixture infrastructure (not flow validation)', () => {
  it('reads and roundtrips the fixture also consumed by xUnit', () => {
    const value: unknown = JSON.parse(readFileSync(new URL('../fixtures/tooling/json-roundtrip.json', import.meta.url), 'utf8'));
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
    expect(value).toMatchObject({ purpose: 'infrastructure-only', text: 'Grüße 👋', number: 42.5, optionalValue: null });
  });
});
