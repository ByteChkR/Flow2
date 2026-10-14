import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,cp,rm,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const version=process.env.FLOW_PACKAGE_VERSION??`0.1.0-local.${Date.now()}`;
const run=(command,args)=>execFileSync(command,args,{stdio:'inherit'});
run(process.execPath,['scripts/check-boundaries.mjs']);
const keys=['core','runtime-browser','editor','flow-editor'];
await mkdir('artifacts/npm',{recursive:true});await mkdir('artifacts/nuget',{recursive:true});
for(const key of keys){const path=`packages/${key}/package.json`,pkg=JSON.parse(await readFile(path,'utf8'));pkg.version=version;for(const name of Object.keys(pkg.dependencies??{}))if(name.startsWith('@adam'))pkg.dependencies[name]=version;await writeFile(path,JSON.stringify(pkg,null,2)+'\n');}
await rm('.build',{recursive:true,force:true});run(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json']);
async function assets(source,dest){for(const item of await readdir(source,{withFileTypes:true})){if(item.isDirectory())await assets(`${source}/${item.name}`,`${dest}/${item.name}`);else if(/\.(svelte|json|css)$/.test(item.name)){await mkdir(dest,{recursive:true});await cp(`${source}/${item.name}`,`${dest}/${item.name}`);if(item.name.endsWith('.svelte'))await writeFile(`${dest}/${item.name}.d.ts`,"declare const component: import('svelte').ComponentType; export default component;\n");}}}
for(const key of keys){await rm(`packages/${key}/dist`,{recursive:true,force:true});await cp(`.build/${key}/src`,`packages/${key}/dist`,{recursive:true});await assets(`packages/${key}/src`,`packages/${key}/dist`);if(key==='core')await cp('packages/core/src/contracts/regex-program.js','packages/core/dist/contracts/regex-program.js');await exportsFor(key);run('npm',['pack',`./packages/${key}`,'--pack-destination','artifacts/npm','--silent']);}
for(const name of ['Adam.Flow2','Adam.Flow2.AspNetCore','Adam.Flow2.EntityFrameworkCore'])run('dotnet',['pack',`server/${name}/${name}.csproj`,'-c','Release',`-p:Version=${version}`,'-o',resolve('artifacts/nuget'),'--nologo']);
await writeFile('artifacts/protocol.json',JSON.stringify({flowSchemaVersion:2,bundleSchemaVersion:1,localPackageVersion:version},null,2));
await writeFile('artifacts/latest.json',JSON.stringify({version},null,2));
console.log(`Built local packages ${version}`);

async function exportsFor(key){
 const path=`packages/${key}/package.json`,pkg=JSON.parse(await readFile(path,'utf8'));
 pkg.exports={'.':{types:'./dist/index.d.ts',import:'./dist/index.js',default:'./dist/index.js'}};
 async function walk(dir,relative=''){for(const item of await readdir(dir,{withFileTypes:true})){const name=relative+item.name;if(item.isDirectory())await walk(`${dir}/${item.name}`,name+'/');else if(name.endsWith('.js')){const target={types:'./dist/'+name.replace(/\.js$/,'.d.ts'),import:'./dist/'+name,default:'./dist/'+name};pkg.exports['./'+name]=target;pkg.exports['./'+name.slice(0,-3)]=target;}else if(name.endsWith('.svelte'))pkg.exports['./'+name]={types:'./dist/'+name+'.d.ts',svelte:'./dist/'+name,default:'./dist/'+name};else if(name.endsWith('.json'))pkg.exports['./'+name]='./dist/'+name;}}
 await walk(`packages/${key}/dist`);await writeFile(path,JSON.stringify(pkg,null,2)+'\n');
}
