import assert from 'node:assert/strict';
import {createGuardedHistory,registerNavigationGuard} from '@adam/editor/navigation.js';
export async function run(){
 let location={pathname:'/editor',state:{id:1}},handler:(event:any)=>void=()=>{};
 const source={get location(){return location;},listen(fn:any){handler=fn;fn({location,action:'POP'});return ()=>{handler=()=>{};};},navigate(to:any,options:any={}){location={pathname:to,state:options.state};handler({location,action:options.replace?'REPLACE':'PUSH'});}};
 const history=createGuardedHistory(source);const paths:string[]=[];const stop=history.listen(event=>paths.push(event.location.pathname));
 let finish:(answer:boolean)=>void=()=>{};const remove=registerNavigationGuard(()=>new Promise(resolve=>finish=resolve));
 source.navigate('/config');assert.deepEqual(paths,['/editor']);assert.equal(history.location.pathname,'/editor');
 finish(false);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(source.location.pathname,'/editor');assert.deepEqual(paths,['/editor']);
 source.navigate('/config');source.navigate('/ted');finish(true);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(history.location.pathname,'/ted');assert.deepEqual(paths,['/editor','/ted']);
 remove();source.navigate('/other');assert.equal(history.location.pathname,'/other');stop();
}
