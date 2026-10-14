export const browserFlags=['localCatalogSnapshot','localPreparationCache','localRegistryMetadata','localValidationReuse','browserRuntimeIndexes','browserWireSchemaCache'];
export const backendFlags=['PLAN_CACHE','VALIDATION_REUSE','REGISTRY_METADATA','REGISTRATION_FILTER','RUNTIME_INDEXES','CONTRACT_METADATA_CACHE','FAST_CONTRACT_VALIDATION'];
export const modes=['browser','backend','coordinated','mixed'];
export const cases=['empty','chain','subgraph-repeat','subgraph-depth','map','aggregate','pingpong','default-values'];
export const columns=['suiteId','sourceFingerprint','browserVersion','backendVersion','caseId','size','mode','mask','profiling','phase','run','status','wallMs','selfMs','systemMs','selfSystemMs','preparationMs','nodeExecutions','segments','childCalls','staticNodes','staticGraphs','requests','requestBytes','responseBytes','error',...browserFlags,...backendFlags.map(k=>'backend_'+k)];
export function variants(mode,profile){
 const keys=mode==='browser'?browserFlags:mode==='backend'?backendFlags:[...backendFlags,...browserFlags.slice(4)];
 const max=2**keys.length-1,standard=mode==='browser'?56:max;
 const masks=profile==='full'?Array.from({length:max+1},(_,i)=>i):profile==='single'?[0,...keys.map((_,i)=>2**i)]:profile==='standard'?[standard]:profile==='smoke'?[0,standard]:profile==='realistic'?[0,standard,max]:profile.split(',').map(Number);
 if(masks.some(n=>!Number.isInteger(n)||n<0||n>max))throw new Error(`Invalid profile/mask: ${profile}`);
 return [...new Set(masks)].map(mask=>({mask,flags:Object.fromEntries(keys.map((key,i)=>[key,!!(mask&2**i)]))}));
}
export function csv(columns,rows){const cell=v=>{const s=v==null?'':String(v);return /[",\r\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;};return [columns,...rows.map(r=>columns.map(k=>r[k]))].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';}
export function summary(rows){
 const groups=new Map();for(const r of rows.filter(r=>r.phase!=='warmup')){const key=JSON.stringify([r.caseId,r.size,r.mode,r.mask,r.profiling,r.phase]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 return [...groups.values()].map(group=>{const ok=group.filter(r=>r.status==='passed'),times=ok.map(r=>r.wallMs).sort((a,b)=>a-b);const percentile=p=>times.length?times[Math.max(0,Math.ceil(times.length*p)-1)]:null;return {...group[0],samples:group.length,passed:ok.length,failed:group.length-ok.length,medianMs:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null,p95Ms:percentile(.95),minMs:times[0]??null,maxMs:times.at(-1)??null};});
}
