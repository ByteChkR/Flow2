import type {TypeDocument} from '@adam-flow/core/flow-core/model.js';
import {generalValueTemplates} from '@adam-flow/core/flow-core/general-value-nodes.js';
import {BrowserNodeRegistry,BrowserCodecRegistry,registerScalarCodecs,registerCatalogValueCodecs} from './runtime-browser/index.js';
import {coalesceImplementation,valueImplementation} from './runtime-browser/value-nodes.js';
import {scalarNodes} from './nodes/scalars.js';
import {extendedScalarNodes} from './nodes/extended-scalars.js';
import {textNodes} from './nodes/text.js';
import {regexNodes} from './nodes/regex.js';
import {jsonNodes} from './nodes/json.js';
import {formattingNodes} from './nodes/formatting.js';
import {binaryNodes} from './nodes/binary.js';
import {assertNode} from './nodes/assert.js';
import {start,wait,print,error,constantDate,constantString} from './nodes/basic.js';
import {detailToolbarActionNodes} from './nodes/detail-toolbar-actions.js';
/** Register portable nodes in either a standalone or application-owned registry. */
export function registerCommonNodes(nodes:BrowserNodeRegistry):void {
 for(const node of [...scalarNodes,...extendedScalarNodes,...textNodes,...regexNodes,...jsonNodes,...formattingNodes,...binaryNodes,start,wait,print,error,constantDate,constantString,assertNode,coalesceImplementation(),...detailToolbarActionNodes])nodes.register(node);
 for(const definition of generalValueTemplates())nodes.register(valueImplementation(definition));
}

export function registerCommonCodecs(codecs:BrowserCodecRegistry):void {
 registerScalarCodecs(codecs);
 codecs.register({definition:{typeId:'core.String',version:1,valueType:{kind:'string'},wireSchema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'string'}},encode:value=>value,decode:payload=>payload});
}

export function createStandardRegistry(types:TypeDocument={schemaVersion:1,types:[]}){
 const nodes=new BrowserNodeRegistry(types),codecs=new BrowserCodecRegistry(types);
 registerCommonNodes(nodes);
 registerCommonCodecs(codecs);
 registerCatalogValueCodecs(codecs,nodes.catalog);
 return {nodes,codecs};
}

/** Owner-scoped metadata cache. Every call still creates separate mutable registries.
 * Revalidate when the supplied type document changes, including in-place edits. */
export function createStandardRegistryFactory(){
 const prepared=new WeakMap<TypeDocument,{signature:string;registry:ReturnType<typeof createStandardRegistry>}>();
 return (types:TypeDocument)=>{
  const signature=JSON.stringify(types),cached=prepared.get(types);
  if(!cached||cached.signature!==signature){
   const registry=createStandardRegistry(types);
   // Keep the template private: callers may specialize their returned registry.
   prepared.set(types,{signature,registry});
   return fork(registry);
  }
  return fork(cached.registry);
 };
 function fork(template:ReturnType<typeof createStandardRegistry>){
  const nodes=template.nodes.forkMetadata(),codecs=template.codecs.forkMetadata();
  registerCommonNodes(nodes);registerCommonCodecs(codecs);
  registerCatalogValueCodecs(codecs,nodes.catalog);
  return {nodes,codecs};
 }
}
