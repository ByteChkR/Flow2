import assert from 'node:assert/strict';
import {connectionPaths,portPosition,visibleInputPorts} from '../../packages/flow-editor/src/editor/model.js';

const flow={id:'flow',version:1,nodes:[
  {id:'source',type:'Legacy.Missing.Source',typeVersion:1,environment:'browser',config:{}},
  {id:'target',type:'Legacy.Missing.Target',typeVersion:1,environment:'browser',config:{}}
],connections:[{source:{nodeId:'source',port:'value'},target:{nodeId:'target',port:'value'}}]};

export function run(){
  assert.deepEqual(visibleInputPorts(flow.nodes[0],undefined,flow.connections),[]);
  assert.deepEqual(portPosition(flow,{}, {},{nodeId:'source',port:'value',direction:'outputs'}),{x:310,y:203});
  assert.deepEqual(portPosition(flow,{}, {},{nodeId:'target',port:'value',direction:'inputs'}),{x:390,y:203});
  const paths=connectionPaths(flow,{},{});
  assert.equal(paths.length,1);
  assert.match(paths[0].path,/^M 310 203 C /);
}
