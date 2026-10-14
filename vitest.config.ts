import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/**/*.test.ts', 'tests/contracts/**/*.test.ts', 'tests/runtime/**/*.test.ts', 'tests/transport/**/*.test.ts'], environment: 'node' },
});
