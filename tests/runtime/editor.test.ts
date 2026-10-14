import { describe, it, expect } from 'vitest';
import { connectPorts, removeNode } from '@adam-flow/runtime-browser';
import { parseContract } from '@adam-flow/flow-core';
import type { Flow, Catalog } from '@adam-flow/flow-core';
import rawFlow from '../../contracts/examples/v1/contact.flow.json';
import rawCatalog from '../../contracts/examples/v1/catalog.json';
import rawTypes from '../../contracts/examples/v1/types.json';
import rawCodecs from '../../contracts/examples/v1/codecs.json';
const flow=parseContract('flow',JSON.stringify(rawFlow));
const catalog=parseContract('catalog',JSON.stringify(rawCatalog));
const types=parseContract('types',JSON.stringify(rawTypes));
const server=parseContract('codecs',JSON.stringify(rawCodecs));
const codecs={server,browser:{...server,environment:'browser' as const}};
const connect=(draft:Flow,index:number)=>connectPorts(draft,flow.connections[index]!.source,flow.connections[index]!.target,catalog,types,codecs);
describe('graph editor',()=>{
  it('reconnects a boundary with the common codec without mutating the draft',()=>{
    const draft={...flow,connections:flow.connections.slice(1)};
    const result=connect(draft,0);expect(result.connections.at(-1)?.codec).toEqual(flow.connections[0]!.codec);expect(draft.connections).toHaveLength(3);
  });
  it('allows incomplete drafts and reconnects local entity ports without serialization',()=>{
    const result=connect({...flow,connections:[]},1);expect(result.connections).toHaveLength(1);expect(result.connections[0]!.codec).toBeUndefined();
  });
  it('rejects occupied inputs and unknown ports',()=>{
    expect(()=>connect(flow,0)).toThrow(/only one connection/);
    expect(()=>connectPorts({...flow,connections:[]},{nodeId:'input',port:'missing'},flow.connections[0]!.target,catalog,types,codecs)).toThrow(/unknown port/);
  });
  it('rejects incompatible port types',()=>{
    expect(()=>connectPorts({...flow,connections:[]},{nodeId:'get',port:'contact'},{nodeId:'display',port:'value'},catalog,types,codecs)).toThrow(/incompatible/);
  });
  it('rejects cycles even when other required inputs are disconnected',()=>{
    const d:Catalog={schemaVersion:1,nodes:[{type:'test',version:1,environments:['server'],inputs:{x:{kind:'number'}},outputs:{x:{kind:'number'}}}]};
    const f:Flow={schemaVersion:1,id:'cycle',version:1,mode:'backend',nodes:['a','b'].map(id=>({id,type:'test',typeVersion:1,environment:'server',config:{}})),connections:[{source:{nodeId:'a',port:'x'},target:{nodeId:'b',port:'x'}}]};
    expect(()=>connectPorts(f,{nodeId:'b',port:'x'},{nodeId:'a',port:'x'},d,types,codecs)).toThrow(/acyclic/);
  });
  it('rejects missing and ambiguous boundary codecs',()=>{
    const draft={...flow,connections:flow.connections.slice(1)};
    const edge=flow.connections[0]!;
    expect(()=>connectPorts(draft,edge.source,edge.target,catalog,types,{...codecs,browser:{...codecs.browser,codecs:[]}})).toThrow(/Kein gemeinsamer Codec/);
    const duplicate={...server.codecs.find(codec=>codec.typeId==='core.String@1')!,typeId:'alternate.String'};
    expect(()=>connectPorts(draft,edge.source,edge.target,catalog,types,{server:{...server,codecs:[...server.codecs,duplicate]},browser:{...codecs.browser,codecs:[...server.codecs,duplicate]}})).toThrow(/Mehrere passende Codecs/);
  });
  it('removes incident edges and the entry reference without mutating the original',()=>{
    const result=removeNode(flow,'input');expect(result.entryNodeId).toBeUndefined();expect(result.nodes).toHaveLength(4);expect(result.connections).toHaveLength(3);expect(flow.nodes).toHaveLength(5);
  });
});
