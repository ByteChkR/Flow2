import {consumerResolution} from '../scripts/consumer-resolution.mjs';
import test from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

test('The editor keeps an unknown catalog node renderable for diagnostics',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'adam-flow-unknown-node-'));
 try{
  const file=join(dir,'cases.mjs');
  await build({entryPoints:['tests/editor/unknown-definition-cases.ts'],outfile:file,platform:'node',format:'esm',bundle:true,tsconfigRaw:{},plugins:[consumerResolution]});
  (await import(pathToFileURL(file))).run();
 }finally{await rm(dir,{recursive:true,force:true});}
});
