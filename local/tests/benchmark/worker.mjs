import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {backendFlags} from './matrix.mjs';
const config=JSON.parse(await readFile(process.argv[2],'utf8'));
let backend,browser,server,backendError;const dir=config.directory;
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
try{
 let backendUrl;
 if(config.mode!=='browser'){
  const reservation=createServer();const port=await listen(reservation);await new Promise(r=>reservation.close(r));backendUrl=`http://127.0.0.1:${port}`;
  const env={...process.env,FLOW2_TEST_HOST_URL:backendUrl};for(const k of backendFlags)env['FLOW2_OPT_'+k]=String(config.flags[k]);
  backend=spawn('dotnet',[config.backendDll,'--serve-ui'],{cwd:config.backendRoot,env,stdio:['ignore','pipe','pipe']});backend.on('error',e=>{backendError=e;});
  backend.stdout.on('data',d=>appendFile(`${dir}/backend.log`,d).catch(()=>{}));backend.stderr.on('data',d=>appendFile(`${dir}/backend.log`,d).catch(()=>{}));
  let ready=false;
  for(let i=0;i<240;i++){
   if(backendError)throw backendError;if(backend.exitCode!==null)throw new Error('Backend exited before readiness');
   try{const response=await fetch(`${backendUrl}/flow2/test/optimizations`,{signal:AbortSignal.timeout(500)});if(response.ok){const actual=await response.json();if(backendFlags.some(k=>actual[k]!==config.flags[k]))throw new Error('Flag mismatch');ready=true;await writeFile(`${dir}/effective-backend-flags.json`,JSON.stringify(actual,null,2));break;}}catch(e){if(e.message==='Flag mismatch')throw e;}
   await new Promise(r=>setTimeout(r,250));
  }
  if(!ready)throw new Error('Backend readiness timeout');
 }
 const script=await readFile(config.bundle);
 server=createServer(async(req,res)=>{
  try{
   if(req.url==='/benchmark.js'){res.setHeader('Content-Type','text/javascript');res.end(script);return;}
   if(req.url?.startsWith('/api/')){
    if(!backendUrl){res.writeHead(400);res.end('Local benchmark attempted network access');return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const response=await fetch(backendUrl+'/flow2/'+req.url.slice(5),{method:req.method,headers:{'Content-Type':'application/json','X-Test-User':'11111111-1111-1111-1111-111111111111','X-Test-Tenant':'22222222-2222-2222-2222-222222222222',...(req.headers['x-flow-session']?{'X-Flow-Session':req.headers['x-flow-session']}:{})},...(chunks.length?{body:Buffer.concat(chunks)}:{}),signal:AbortSignal.timeout(config.timeout)});
    res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')??'application/json'});res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><script src="/benchmark.js"></script>');
  }catch(e){res.writeHead(502);res.end(String(e));}
 });
 const port=await listen(server);
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 await writeFile(`${dir}/browser-version.txt`,browser.version());
 const page=await browser.newPage();
 await page.exposeFunction('benchSample',row=>appendFile(`${dir}/samples.jsonl`,JSON.stringify(row)+'\n'));
 await page.exposeFunction('benchFixture',data=>writeFile(`${dir}/fixture.json`,JSON.stringify(data,null,2)));
 await page.exposeFunction('benchTrace',(run,events)=>events.length?writeFile(`${dir}/trace-${run}.json`,JSON.stringify(events)):undefined);
 await page.goto(`http://127.0.0.1:${port}`);await page.waitForFunction(()=>typeof window.runBenchmark==='function');
 await page.evaluate(config=>window.runBenchmark(config),config);
}catch(error){await appendFile(`${dir}/samples.jsonl`,JSON.stringify({status:'failed',phase:'setup',error:error.stack??String(error)})+'\n');process.exitCode=1;}
finally{
 await browser?.close();server?.closeAllConnections();if(server)await new Promise(r=>server.close(r));
 if(backend?.pid&&backend.exitCode===null&&backend.signalCode===null)await new Promise(r=>{const timer=setTimeout(()=>backend.kill('SIGKILL'),3000);backend.once('exit',()=>{clearTimeout(timer);r();});backend.kill('SIGTERM');});
}
