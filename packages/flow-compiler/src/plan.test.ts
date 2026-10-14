import { expect, it } from 'vitest';
import { parseContract } from '@adam-flow/flow-core';
import { compileFlow, generateSegment } from './index.js';
import flowJson from '../../../contracts/examples/v1/contact.flow.json';
import catalogJson from '../../../contracts/examples/v1/catalog.json';
import typesJson from '../../../contracts/examples/v1/types.json';
import codecsJson from '../../../contracts/examples/v1/codecs.json';
const flow = () => parseContract('flow', JSON.stringify(flowJson));
const catalog = parseContract('catalog',JSON.stringify(catalogJson));
const types = parseContract('types',JSON.stringify(typesJson));
const server = parseContract('codecs',JSON.stringify(codecsJson));
const capabilities = {server, browser:{...server,environment:'browser' as const}};
it('schedules an unordered DAG and preserves native entity edges inside the server segment',()=>{
 const input=flow(); input.nodes.reverse();
 const plan=compileFlow(input,catalog,types,capabilities);
 expect(plan.nodes.map(node=>node.id)).toEqual(['input','get','inspect','project','display']);
 expect(plan.segments.map(segment=>segment.nodeIds)).toEqual([['input'],['get','inspect','project'],['display']]);
 expect(plan.connections.filter(edge=>edge.boundary).map(edge=>edge.index)).toEqual([0,3]);
 expect(plan.segments[1]!.dependencies).toEqual(['segment-0']);
 expect(plan.connections[1]!.sourceType.kind).toBe('entity');
});
it('rejects missing boundary codecs before producing code',()=>{
 const input=flow(); delete input.connections[0]!.codec;
 expect(()=>compileFlow(input,catalog,types,capabilities)).toThrow();
});
it('rejects cycles and unavailable implementations',()=>{
 const input=flow(); input.connections.push({source:{nodeId:'inspect',port:'contact'},target:{nodeId:'inspect',port:'contact'}});
 expect(()=>compileFlow(input,catalog,types,capabilities)).toThrow();
 const other=flow(); other.nodes[0]!.type='unregistered';
 expect(()=>compileFlow(other,catalog,types,capabilities)).toThrow();
});
it('never inserts flow configuration into executable source',()=>{
 const input=flow(); input.nodes[0]!.config['malicious']="'); globalThis.compromised=true; //";
 const plan=compileFlow(input,catalog,types,capabilities);
 expect(generateSegment(plan.segments[0]!)).toBe("'use strict';\nhost.invokeNode(0);\nhost.completeSegment();");
});
it('schedules branches, joins and disconnected roots without dropping nodes',()=>{
 const input=flow();
 input.nodes.push({id:'other',type:'input.contactId',typeVersion:1,environment:'browser',config:{}});
 input.nodes.push({id:'display2',type:'ui.displayContact',typeVersion:1,environment:'browser',config:{}});
 input.connections.push({...input.connections[3]!,target:{nodeId:'display2',port:'value'}});
 const plan=compileFlow(input,catalog,types,capabilities);
 expect(plan.nodes.map(node=>node.id)).toEqual(['input','other','get','inspect','project','display','display2']);
 expect(plan.segments[1]!.outgoing).toEqual([3,4]);
 expect(plan.segments[2]!.incoming).toEqual([3,4]);
});
it('accepts reactive catalog proxies and detaches their declarative data',()=>{
 const reactive = {...catalog,nodes:catalog.nodes.map(node=>({...node,outputs:new Proxy(node.outputs,{})}))};
 const plan=compileFlow(flow(),reactive,types,capabilities);
 expect(plan.nodes[0]!.outputs).toEqual({id:{kind:'string'}});
});

import golden from '../../../contracts/examples/v1/contact.plan.json';
it('matches the shared execution-plan golden used by C#',()=>{
 expect(compileFlow(flow(),catalog,types,capabilities)).toEqual(golden);
});
