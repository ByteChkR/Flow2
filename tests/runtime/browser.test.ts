import { describe, expect, it } from 'vitest';
import { loadServerCatalog } from '@adam-flow/runtime-browser';
import { browserRuntimeCases } from './browser-cases.js';

describe('browser registry and catalog', () => {
  for (const test of browserRuntimeCases) it(test.name, test.run);
  it('fails visibly on unreachable catalog endpoints', async () => {
    const fetcher: typeof fetch = async () => new Response('Unavailable', { status: 503 });
    await expect(loadServerCatalog(fetcher)).rejects.toThrow('HTTP 503');
  });
  it('rejects invalid downloaded metadata', async () => {
    const fetcher: typeof fetch = async () => Response.json({ schemaVersion: 99 });
    await expect(loadServerCatalog(fetcher)).rejects.toThrow();
  });
});
