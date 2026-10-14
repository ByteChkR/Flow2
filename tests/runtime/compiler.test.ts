import { it } from 'vitest';
import { compilerCases } from './compiler-cases.js';
for(const test of compilerCases) it(test.name,test.run);
