import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const allowed={core:[],editor:[], 'runtime-browser':['core'], 'flow-editor':['core','runtime-browser','editor']};
const names={'@adam-flow/core':'core','@adam/editor':'editor','@adam-flow/runtime-browser':'runtime-browser','@adam-flow/editor':'flow-editor'};
async function files(dir){const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory()){if(!['bin','obj','dist'].includes(entry.name))result.push(...await files(path));}else result.push(path);}return result;}
let count=0;
for(const key of Object.keys(allowed))for(const file of await files(resolve(root,`packages/${key}/src`))){
 if(!/\.(ts|js|svelte)$/.test(file))continue;
 const text=await readFile(file,'utf8');count++;
 for(const match of text.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)){
  const specifier=match[1];
  if(specifier.includes('src/lib')||specifier.startsWith('$lib'))throw new Error(`Host import in ${file}: ${specifier}`);
  if(specifier.startsWith('.')&&!resolve(dirname(file),specifier).startsWith(resolve(root,`packages/${key}/src`)+ '/'))throw new Error(`Source boundary crossed in ${file}: ${specifier}`);
  for(const [name,dep] of Object.entries(names))if((specifier===name||specifier.startsWith(name+'/'))&&dep!==key&&!allowed[key].includes(dep))throw new Error(`Forbidden dependency ${key} -> ${dep} in ${file}`);
 }
}
for(const file of await files(resolve(root,'server'))){if(!/\.(cs|csproj)$/.test(file))continue;const text=await readFile(file,'utf8');if(/MAC\.Backend|frontend\/src|backend\/MAC/.test(text))throw new Error(`Adam dependency in ${relative(root,file)}`);}
const program=JSON.parse(await readFile(resolve(root,'packages/core/src/contracts/regex-program.json'),'utf8'));
if(program.lines.join('\n')+'\n'!==await readFile(resolve(root,'packages/core/src/contracts/regex-program.js'),'utf8'))throw new Error('Canonical regex program drift');
console.log(`Package boundaries and shared assets: ${count} modules checked.`);
