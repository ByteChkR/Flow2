import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=(command,args,cwd=root)=>execFileSync(command,args,{cwd,stdio:'inherit'});
run(process.execPath,['scripts/check-boundaries.mjs']);
run(process.execPath,['scripts/prepare-consumer.mjs']);
run('npm',['test']);
run('dotnet',['run','--project','tests/ValueContracts','-c','Release']);
if(!process.argv.includes('--no-benchmarks'))run(process.execPath,['tests/benchmark-suite.mjs','--profile','smoke','--samples','1','--warmups','0','--profiling','true','--out',`artifacts/verification/${Date.now()}`]);
if(process.argv.includes('--adam')){
 const adam=resolve(root,'../..');
 run('npm',['run','check:flow2'],`${adam}/frontend`);
 run('npm',['run','build'],`${adam}/frontend`);
 run('dotnet',['build','MAC.Backend/MAC.Backend.csproj','-c','Release'],`${adam}/backend`);
 run('dotnet',['run','--project','tests/Flow2.Integration.Tests','-c','Release'],`${adam}/backend`);
}
