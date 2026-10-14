import {consumerResolution} from './consumer-resolution.mjs';
import {build} from 'esbuild';
import {compile} from 'svelte/compiler';
import {readFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
export const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildDemo(){
 const out=resolve(root,'artifacts/demo');await mkdir(out,{recursive:true});
 await build({entryPoints:[resolve(root,'apps/consumer/main.js')],outfile:`${out}/demo.js`,bundle:true,format:'iife',platform:'browser',tsconfigRaw:{},plugins:[consumerResolution,{name:'svelte',setup(build){build.onLoad({filter:/\.svelte$/},async({path})=>({contents:compile(await readFile(path,'utf8'),{filename:path,generate:'dom'}).js.code,loader:'js',resolveDir:dirname(path)}));}}]});
 return out;
}
export async function serveDemo(port=4178){
 const out=await buildDemo();
 const server=createServer(async(req,res)=>{
  if(req.url==='/demo.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(`${out}/demo.js`));}
  else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="de"><meta charset="utf-8"><title>Lokaler Editor</title><style>body{margin:0;font-family:system-ui}</style><body><script src="/demo.js"></script></body></html>');}
 });
 await new Promise(r=>server.listen(port,'127.0.0.1',r));return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=await serveDemo();console.log(`Paket-Demo: http://127.0.0.1:${server.address().port}`);}
