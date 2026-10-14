import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {variants,csv,summary,browserFlags,backendFlags} from './benchmark/matrix.mjs';
test('full matrices enumerate every effective flag combination once',()=>{
 for(const [mode,count] of [['browser',64],['backend',128],['coordinated',512],['mixed',512]]){
  const all=variants(mode,'full');assert.equal(all.length,count);assert.equal(new Set(all.map(v=>JSON.stringify(v.flags))).size,count);
  assert.ok(Object.values(all[0].flags).every(v=>!v));assert.ok(Object.values(all.at(-1).flags).every(Boolean));
  const singles=variants(mode,'single');assert.equal(singles.length,Math.log2(count)+1);for(const v of singles.slice(1))assert.equal(Object.values(v.flags).filter(Boolean).length,1);
 }
 assert.equal(variants('browser','standard')[0].mask,56);assert.equal(variants('backend','standard')[0].mask,127);
 assert.throws(()=>variants('browser','64'));assert.throws(()=>variants('backend','invalid'));
});
test('CSV retains quotes, commas, multiline errors and missing timings',()=>{
 assert.equal(csv(['error','time','enabled'],[{error:'a,"b"\nc',time:null,enabled:false}]),'error,time,enabled\r\n"a,""b""\nc",,false\r\n');
});
test('summaries separate cold/warm, profiling and variants; failed runs are not fast samples',()=>{
 const base={caseId:'chain',size:2,mode:'browser',mask:0,profiling:false,phase:'warm',status:'passed'};
 const rows=[{...base,wallMs:10},{...base,wallMs:30},{...base,status:'failed',wallMs:1},{...base,phase:'cold',wallMs:90},{...base,phase:'warmup',wallMs:1000},{...base,profiling:true,wallMs:40}];
 const result=summary(rows);assert.equal(result.length,3);assert.equal(result[0].failed,1);assert.equal(result[0].passed,2);assert.equal(result[0].medianMs,20);assert.equal(result[0].p95Ms,30);
 const failed=summary([{...base,status:'timeout'}])[0];assert.equal(failed.medianMs,null);
});
