import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const cwd=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const script of ['build.mjs','prepare-consumer.mjs','update-adam.mjs'])execFileSync(process.execPath,[`scripts/${script}`,...(script==='update-adam.mjs'?['--no-build']:[])],{cwd,stdio:'inherit'});
