import { it, expect } from 'vitest';
import { BrowserNodeRegistry, defineNode, port, field } from '@adam-flow/runtime-browser';
import { mergeCatalogs, TypeRegistry, validateCatalog, validateFlow } from '@adam-flow/flow-core';
import type { Flow } from '@adam-flow/flow-core';
const types={schemaVersion:1 as const,types:[]};
const demo=defineNode({type:'test.add',version:1,label:'Addition',inputs:{a:port.number(),b:port.number()},outputs:{sum:port.number()},
  config:{factor:field.number(2),enabled:field.boolean(true),format:field.string('short',{options:['short','long']})},
  execute:({a,b},{config})=>({sum:config.enabled?(a+b)*config.factor:0})});
it('authoring/infers primitive, optional and nested DTO types',()=>{
  const node=defineNode({type:'test.dto',version:1,inputs:{value:port.object({name:port.string(),age:port.optional(port.number())}),extra:port.optional(port.string())},outputs:{text:port.string()},execute:({value,extra})=>({text:value.name+(extra ?? '')})});
  const registry=new BrowserNodeRegistry(types);registry.register(node);
  expect(registry.execute({nodeId:'n',type:'test.dto',typeVersion:1,environment:'browser',inputs:{value:{name:'Ada'}}})).toEqual({text:'Ada'});
});
it('authoring/applies defaults, overrides and runtime port checks',()=>{
  const registry=new BrowserNodeRegistry(types);registry.register(demo);
  const call={nodeId:'n',type:'test.add',typeVersion:1,environment:'browser' as const,inputs:{a:2,b:3}};
  expect(registry.execute(call)).toEqual({sum:10});
  expect(registry.execute({...call,config:{factor:3}})).toEqual({sum:15});
  expect(()=>registry.execute({...call,config:{enabled:'true'}})).toThrow(/Invalid configuration/);
  expect(()=>registry.execute({...call,config:{format:'missing'}})).toThrow(/Invalid configuration/);
  expect(()=>registry.execute({...call,inputs:{a:'2',b:3}})).toThrow();
});
it('authoring/rejects invalid metadata and defaults during registration',()=>{
  const registry=new BrowserNodeRegistry(types);
  expect(()=>registry.register({...demo,definition:{...demo.definition,metadata:{inputs:{missing:{label:'No'}}}}})).toThrow(/unknown port/);
  expect(()=>registry.register(defineNode({type:'bad',version:1,inputs:{},outputs:{},config:{choice:field.string('x',{options:['y']})},execute:()=>({})}))).toThrow(/Invalid configuration/);
});
it('authoring/preserves old catalog and flow compatibility, validates new config',()=>{
  const legacy={...demo.definition};delete legacy.metadata;delete legacy.config;
  const merged=mergeCatalogs(new TypeRegistry(types),{schemaVersion:1,nodes:[{...legacy,environments:['server']}]},{schemaVersion:1,nodes:[demo.definition]});
  expect(merged.nodes[0]!.metadata?.label).toBe('Addition');
  expect(merged.nodes[0]!.config?.factor?.default).toBe(2);
  const flow:Flow={schemaVersion:1,id:'test',version:1,mode:'interactive',nodes:[{id:'n',type:'test.add',typeVersion:1,environment:'browser',config:{factor:'bad'}}],connections:[]};
  expect(validateFlow(flow,merged,types).some(error=>error.code==='config')).toBe(true);
});
it('authoring/freezes metadata at registration',()=>{
  const registry=new BrowserNodeRegistry(types);const node={...demo,definition:structuredClone(demo.definition)};
  registry.register(node);node.definition.metadata!.label='changed';
  expect(registry.catalog.nodes[0]!.metadata?.label).toBe('Addition');
  validateCatalog(registry.catalog,new TypeRegistry(types));
});

// Compiled by npm run check: these failures prove the authoring API carries types.
function typeChecks() {
  defineNode({type:'invalid',version:1,inputs:{a:port.number()},outputs:{sum:port.number()},
    // @ts-expect-error A numeric output cannot return a string.
    execute:({a})=>({sum:String(a)})});
  defineNode({type:'invalid',version:1,inputs:{a:port.number()},outputs:{sum:port.number()},execute:({a})=>{
    // @ts-expect-error Inputs are inferred as numbers, not any.
    a.toUpperCase();return {sum:a};
  }});
  defineNode({type:'invalid',version:1,inputs:{},outputs:{},config:{enabled:field.boolean(true)},execute:(_,ctx)=>{
    // @ts-expect-error Configuration is inferred as boolean.
    ctx.config.enabled.toUpperCase();return {};
  }});
}
void typeChecks;
it('authoring/merges translated labels but rejects different configuration behavior',()=>{
  const server=structuredClone(demo.definition);server.environments=['server'];server.config!.factor!.label='Server-Faktor';
  const catalog={schemaVersion:1 as const,nodes:[server]};
  expect(()=>mergeCatalogs(new TypeRegistry(types),catalog,{schemaVersion:1,nodes:[demo.definition]})).not.toThrow();
  server.config!.factor!.default=3;
  expect(()=>mergeCatalogs(new TypeRegistry(types),catalog,{schemaVersion:1,nodes:[demo.definition]})).toThrow(/Conflicting configuration/);
});
