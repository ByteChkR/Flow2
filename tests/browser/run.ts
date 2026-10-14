import { workspaceCases } from '../runtime/workspace-cases.js';
import { orchestratorCases } from '../runtime/orchestrator-cases.js';
import { compilerCases } from '../runtime/compiler-cases.js';
import { transportCases } from '../transport/cases.js';
import { conformanceCases } from '../contracts/conformance.js';
import { browserRuntimeCases } from '../runtime/browser-cases.js';

const results = await Promise.all([...conformanceCases, ...browserRuntimeCases, ...transportCases, ...compilerCases, ...orchestratorCases, ...workspaceCases].map(async test => {
  try { await test.run(); return `PASS ${test.name}`; }
  catch (error) { return `FAIL ${test.name}: ${String(error)}`; }
}));
const failed = results.filter(result => result.startsWith('FAIL')).length;
document.querySelector('h1')!.textContent = `${results.length - failed}/${results.length} passed; ${failed} failed`;
document.querySelector('#results')!.textContent = results.join('\n');
