import { describe, expect, it } from 'vitest';
import { transportCases } from './cases.js';
import { createBrowserCodecs, transferContact } from '@adam-flow/nodes-browser';
import { parseContract } from '@adam-flow/flow-core';
import typesJson from '../../contracts/examples/v1/types.json';
import codecsJson from '../../contracts/examples/v1/codecs.json';

describe('Phase 3 boundaries and wire values', () => {
  for (const test of transportCases) it(test.name, test.run);
  it('does not send a request when the peer lacks the DTO codec', async () => {
    let called = false;
    const types = parseContract('types', JSON.stringify(typesJson));
    const server = parseContract('codecs', JSON.stringify(codecsJson)); server.codecs.pop();
    const fetcher: typeof fetch = async () => { called = true; return new Response(); };
    await expect(transferContact('contact-1', createBrowserCodecs(types), server, types, fetcher)).rejects.toThrow();
    expect(called).toBe(false);
  });
});
