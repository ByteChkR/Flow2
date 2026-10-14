import { describe, it } from 'vitest';
import { conformanceCases } from './conformance.js';

describe('Phase 1 shared conformance fixtures', () => {
  for (const test of conformanceCases) it(test.name, test.run);
});
