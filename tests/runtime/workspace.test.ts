import {it} from 'vitest';
import {workspaceCases} from './workspace-cases.js';
for(const test of workspaceCases) it(test.name,test.run);
