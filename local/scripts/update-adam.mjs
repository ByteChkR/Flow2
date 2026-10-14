import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),adam=resolve(root,'../..');
const run=(command,args,cwd=root)=>execFileSync(command,args,{cwd,stdio:'inherit'});
if(!process.argv.includes('--no-build'))run(process.execPath,['scripts/build.mjs']);
const {version}=JSON.parse(await readFile(`${root}/artifacts/latest.json`,'utf8'));
const packages=[];for(const key of ['core','runtime-browser','editor','flow-editor']){const {name}=JSON.parse(await readFile(`${root}/packages/${key}/package.json`,'utf8'));packages.push(`${root}/artifacts/npm/${name.replace('@','').replace('/','-')}-${version}.tgz`);}
run('npm',['install','--ignore-scripts',...packages],`${adam}/frontend`);
await writeFile(`${adam}/backend/Flow2.LocalPackages.props`,`<Project><PropertyGroup><Flow2LocalVersion>${version}</Flow2LocalVersion></PropertyGroup></Project>\n`);
for(const project of ['MAC.Backend/MAC.Backend.csproj','tests/Flow2.Integration.Tests','tests/Flow2.ValueContracts.Tests','tests/Flow2.Presentation.Tests'])run('dotnet',['restore',project,'--ignore-failed-sources'],`${adam}/backend`);
console.log(`Adam now uses local Flow/Editor packages ${version}. No registry publication performed.`);
