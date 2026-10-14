import {consumerResolution} from '../scripts/consumer-resolution.mjs';
import {build} from 'esbuild';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {modes,cases,variants,columns,csv,summary,browserFlags,backendFlags} from './benchmark/matrix.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||args[i+1]===undefined)throw new Error('Use --option value');options[args[i].slice(2)]=args[i+1];}
const allowed=['profile','modes','cases','sizes','samples','warmups','profiling','timeout','out'];for(const key of Object.keys(options))if(!allowed.includes(key))throw new Error(`Unknown option ${key}`);
const select=(value,all)=>{const result=(value??all.join(',')).split(',');if(!result.length||result.some(v=>!all.includes(v))||new Set(result).size!==result.length)throw new Error(`Invalid selection: ${value}`);return result;};
const positive=(v,min,max)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Invalid number ${v}`);return n;};
const profile=options.profile??'smoke',selectedModes=select(options.modes,modes),selectedCases=select(options.cases??(profile==='realistic'?'chain,map,aggregate,default-values':undefined),cases),sizes=(options.sizes??(profile==='realistic'?'10,100':'2')).split(',').map(v=>positive(v,1,1000));
const samples=positive(options.samples??3,1,1000),warmups=positive(options.warmups??1,0,100),timeout=positive(options.timeout??120000,100,3600000),profilers=select(options.profiling,['false','true']).map(v=>v==='true');
const jobs=[];for(const mode of selectedModes)for(const variant of variants(mode,profile))for(const caseId of selectedCases)for(const size of sizes)for(const profiling of profilers)jobs.push({mode,...variant,caseId,size,profiling,samples,warmups,timeout});
const output=resolve(options.out??`docs/benchmarks/suite/${new Date().toISOString().replaceAll(':','-')}`);await mkdir(output,{recursive:true});
const manifest={suiteId:new Date().toISOString(),version:1,complete:false,startedAt:new Date().toISOString(),profile,jobs:jobs.length,options,cpu:cpus()[0]?.model,node:process.version,packageVersion:JSON.parse(await readFile('artifacts/latest.json','utf8')).version,backendBuild:'Release',transport:'same-origin HTTP proxy; 25ms polling (no SignalR)',cacheDefinition:'cold = first root after fresh browser/backend and catalog load; warm follows explicit warmups'};
await writeFile(`${output}/manifest.json`,JSON.stringify(manifest,null,2),{flag:'wx'});
let active;const kill=()=>{if(active?.pid)try{process.kill(-active.pid,'SIGKILL');}catch{active.kill('SIGKILL');}};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{kill();process.exit(signal==='SIGINT'?130:143);});
function command(executable,args,cwd=root,limit=timeout){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{cwd,detached:true,stdio:['ignore','pipe','pipe']});active=child;let output='';child.stdout.on('data',d=>{output+=d;});child.stderr.on('data',d=>{output+=d;});let timedOut=false;const timer=setTimeout(()=>{timedOut=true;kill();},limit);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',(code,signal)=>{clearTimeout(timer);active=undefined;resolve({code,signal,timedOut,output});});});}
const rows=[];const summaryColumns=['suiteId','sourceFingerprint','browserVersion','backendVersion','caseId','size','mode','mask','profiling','phase','samples','passed','failed','medianMs','p95Ms','minMs','maxMs',...columns.slice(columns.indexOf('localCatalogSnapshot'))];
async function save(){await writeFile(`${output}/samples.csv`,csv(columns,rows));await writeFile(`${output}/summary.csv`,csv(summaryColumns,summary(rows)));}
try{
 const bundle=`${output}/benchmark.js`;
 await build({entryPoints:['tests/benchmark/browser.ts'],outfile:bundle,bundle:true,platform:'browser',format:'iife',tsconfigRaw:{},plugins:[consumerResolution],metafile:true,nodePaths:[resolve('apps/consumer/node_modules')]}).then(async result=>{const hashes={};for(const path of Object.keys(result.metafile.inputs).filter(p=>!p.startsWith('node_modules/')))hashes[path]=createHash('sha256').update(await readFile(path)).digest('hex');await writeFile(`${output}/frontend-sources.json`,JSON.stringify(hashes,null,2));});
 const backendRoot=root;
 const backendHashes={};
 async function hashSources(directory){for(const entry of await readdir(directory,{withFileTypes:true})){if(['bin','obj'].includes(entry.name))continue;const path=resolve(directory,entry.name);if(entry.isDirectory())await hashSources(path);else if(/\.(cs|csproj|json)$/.test(entry.name))backendHashes[relative(backendRoot,path)]=createHash('sha256').update(await readFile(path)).digest('hex');}}
 for(const path of ['server','apps/BenchmarkHost'])await hashSources(resolve(backendRoot,path));
 await writeFile(`${output}/backend-sources.json`,JSON.stringify(backendHashes,null,2));
 manifest.sourceFingerprint=createHash('sha256').update(await readFile(bundle)).update(JSON.stringify(backendHashes)).digest('hex');
 manifest.backendVersion=selectedModes.some(m=>m!=='browser')?execFileSync('dotnet',['--version'],{encoding:'utf8'}).trim():null;

 if(selectedModes.some(m=>m!=='browser')){
  console.log('Building backend benchmark host (Release)…');const result=await command('dotnet',['build','apps/BenchmarkHost','-c','Release','--nologo'],backendRoot,600000);await writeFile(`${output}/build.log`,result.output);if(result.code!==0)throw new Error('Backend build failed; see build.log');
 }
 for(let i=0;i<jobs.length;i++){
  const job=jobs[i],directory=`${output}/runs/${String(i).padStart(5,'0')}`;await mkdir(directory,{recursive:true});
  const config={...job,directory,bundle,backendRoot,backendDll:resolve(backendRoot,'apps/BenchmarkHost/bin/Release/net10.0/BenchmarkHost.dll')};
  await writeFile(`${directory}/config.json`,JSON.stringify(config,null,2));
  console.log(`[${i+1}/${jobs.length}] ${job.mode} ${job.caseId} n=${job.size} mask=${job.mask} profiler=${job.profiling}`);
  const result=await command(process.execPath,['tests/benchmark/worker.mjs',`${directory}/config.json`],root,timeout*(samples+warmups+1)+90000);
  await writeFile(`${directory}/worker.log`,result.output);
  let measured=[];try{measured=(await readFile(`${directory}/samples.jsonl`,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{}
  if(result.timedOut||!measured.length||result.code!==0&&!measured.some(r=>r.status==='failed'))measured.push({phase:'setup',status:result.timedOut?'timeout':'failed',error:result.timedOut?'Worker deadline exceeded':`Worker exited ${result.code??result.signal}`});
  const flags=Object.fromEntries([...browserFlags.map(k=>[k,job.flags[k]??null]),...backendFlags.map(k=>['backend_'+k,job.flags[k]??null])]);
  let browserVersion;try{browserVersion=await readFile(`${directory}/browser-version.txt`,'utf8');}catch{}
  rows.push(...measured.map(r=>({suiteId:manifest.suiteId,sourceFingerprint:manifest.sourceFingerprint,browserVersion,backendVersion:job.mode==='browser'?null:manifest.backendVersion,caseId:job.caseId,size:job.size,mode:job.mode,mask:job.mask,profiling:job.profiling,...flags,...r})));await save();
 }
 manifest.complete=true;manifest.failed=rows.filter(r=>r.status!=='passed').length;
 if(manifest.failed)process.exitCode=1;
}catch(error){manifest.error=error.stack??String(error);process.exitCode=1;console.error(error);}
finally{kill();await save();manifest.finishedAt=new Date().toISOString();await writeFile(`${output}/manifest.json`,JSON.stringify(manifest,null,2));console.log(`Results: ${output}/summary.csv`);}
