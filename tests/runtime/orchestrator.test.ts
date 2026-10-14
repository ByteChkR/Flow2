import {it} from 'vitest';
import {orchestratorCases} from './orchestrator-cases.js';
for(const test of orchestratorCases) it(test.name,test.run);
