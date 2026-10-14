import {registerCatalogValueCodecs} from './value-codecs.js';
import {executeGraphControl} from './graph-controls.js';
import {isGraphControl} from '@adam-flow/core/flow-core/graph-controls.js';
import {graphNodeDefinition,graphCodecs,graphInputPort,graphOutputPort} from '@adam-flow/core/flow-core/index.js';
import type {Flow,FlowInterface,GraphReference,JsonValue,GraphBundleSnapshot} from '@adam-flow/core/flow-core/index.js';
import type {BrowserNodeRegistry} from './index.js';
import type {BrowserCodecRegistry} from './codecs.js';
export type GraphInvoker=(nodeId:string,reference:GraphReference,signature:FlowInterface,inputs:Record<string,JsonValue>,signal?:AbortSignal,callKey?:string)=>Promise<Record<string,JsonValue>>;
export function registerGraphNodes(flow:Flow,snapshot:GraphBundleSnapshot,nodes:BrowserNodeRegistry,codecs:BrowserCodecRegistry,invoke:GraphInvoker):void {
  const baseCatalog=nodes.catalog;
  for(const definition of graphCodecs(snapshot.document).filter(codec=>codec.valueType.kind==='graph'))codecs.register({definition,encode:value=>value,decode:payload=>payload});
  registerCatalogValueCodecs(codecs,{schemaVersion:1,nodes:flow.nodes.filter(node=>node.graph).map(graphNodeDefinition)});
  for(const node of flow.nodes){
    if(!node.graph)continue;
    const binding=node.graph,definition=graphNodeDefinition(node);
    nodes.register({definition:{...definition,environments:['browser']},execute:async(inputs,context)=>{
      context.signal?.throwIfAborted();
      if(binding.operation==='reference'){
        const reference=snapshot.reference(binding.graphId!);
        snapshot.resolve(reference,binding.signature,baseCatalog);
        return {graph:reference};
      }
      if(isGraphControl(binding.operation))return executeGraphControl(node,inputs,invoke,context.signal);
      if(binding.operation!=='invoke')throw new Error('Graph IO is executed by the flow runtime.');
      const target=binding.graphId?snapshot.reference(binding.graphId):inputs.graph as GraphReference;
      snapshot.resolve(target,binding.signature,baseCatalog);
      const args=Object.fromEntries(binding.signature.inputs.filter(parameter=>Object.hasOwn(inputs,graphInputPort(parameter))).map(parameter=>[parameter.name,inputs[graphInputPort(parameter)] as JsonValue]));
      const result=await invoke(node.id,target,binding.signature,args,context.signal);
      nodes.requireFlowValues(binding.signature.outputs,result,'/outputs');
      return Object.fromEntries(binding.signature.outputs.filter(parameter=>Object.hasOwn(result,parameter.name)).map(parameter=>[graphOutputPort(parameter),result[parameter.name]]));
    }});
  }
}
