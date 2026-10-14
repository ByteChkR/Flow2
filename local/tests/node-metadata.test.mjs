import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

test('Standard catalogs and specialized node families describe every node and input', {timeout:120000}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'flow2-metadata-'));
 try {
  const outfile=join(dir,'metadata.mjs');
  await build({stdin:{contents:`
    export {createStandardRegistry} from './packages/runtime-browser/src/registry.ts';
    export {stepNodes,buttonNode} from './packages/runtime-browser/src/nodes/steps.ts';
    export {pageNodes} from './packages/runtime-browser/src/nodes/pages.ts';
    export {controlPalette} from './packages/flow-editor/src/editor/control-palette.ts';
    export {describeNode} from './packages/core/src/flow-core/node-descriptions.ts';
    export {queryNodeDefinition} from './packages/core/src/flow-core/query-nodes.ts';
    export {templateNodeDefinition} from './packages/core/src/flow-core/template-nodes.ts';
    export {queryNames,templateNames} from './packages/core/src/flow-core/node-names.ts';
    export {generalValueDefinition} from './packages/core/src/flow-core/general-value-nodes.ts';
    export {browserDefinitions} from '../packages/nodes-browser/src/index.ts';
  `,resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,format:'esm',platform:'node',tsconfig:'tsconfig.json'});
  const api=await import(pathToFileURL(outfile));
  const registry=api.createStandardRegistry();
  for(const node of [...api.stepNodes(),...api.pageNodes(),api.buttonNode])registry.nodes.register(node);
  const browser=registry.nodes.catalog.nodes;
  const controls=api.controlPalette([]);
  const specialized=Object.entries(api.queryNames).map(([operation,type])=>api.queryNodeDefinition({id:'query',type,typeVersion:1,environment:'server',config:{},query:{operation,element:{kind:'string'},...(['select','groupBy'].includes(operation)?{result:{kind:'string'}}:{}),...(['where','select','orderBy','thenBy','groupBy','all'].includes(operation)?{parameters:{customer:{kind:'string'}}}:{})}}));
  for(const type of Object.values(api.templateNames))specialized.push(api.templateNodeDefinition({id:'template',type,typeVersion:1,environment:'server',config:{}}));
  specialized.push(api.generalValueDefinition({id:'record',type:'Standard.Values.Record.Create',typeVersion:1,environment:'browser',config:{},value:{operation:'record',type:{kind:'object',fields:{customerId:{kind:'string'},active:{kind:'scalar',name:'core.Bool'}}}}}));
  const server=JSON.parse(execFileSync('dotnet',['run','--project','apps/NodeCatalog/NodeCatalog.csproj','--configuration','Release','--no-launch-profile','--nologo'],{encoding:'utf8'})).nodes;
  for(const node of [...browser,...server,...controls,...specialized,...api.browserDefinitions]){
   assert.ok(node.metadata?.description?.trim(),`${node.type}: node description`);
   for(const key of Object.keys(node.inputs))assert.ok(node.metadata?.inputs?.[key]?.description?.trim(),`${node.type}: ${key} description`);
   assert.deepEqual(api.describeNode(api.describeNode(node)),api.describeNode(node),'Metadata enrichment must be idempotent');
  }
  for(const node of browser){const other=server.find(n=>n.type===node.type);if(!other)continue;for(const key of Object.keys(node.inputs))assert.equal(node.metadata.inputs[key].description,other.metadata.inputs[key].description,`${node.type}.${key}: runtime parity`);}
  const custom={...browser.find(n=>n.inputs.value&&Object.keys(n.inputs).length===1),metadata:{label:'Eigener Name',description:'Eigene Beschreibung',category:'Eigene Gruppe',inputs:{value:{label:'Eigener Eingang',description:'Eigene Portbeschreibung',order:12}}}};
  const before=structuredClone(custom);assert.deepEqual(api.describeNode(custom).metadata,custom.metadata);assert.deepEqual(custom,before,'Source is not mutated');
  assert.equal(api.describeNode({type:'Host.Custom',inputs:{}}).metadata,undefined,'Host nodes are not documented by a generic fallback');
  console.log(`Checked ${server.length} backend, ${browser.length} browser, ${controls.length} control and ${specialized.length} specialized definitions.`);
 } finally {await rm(dir,{recursive:true,force:true});}
});
