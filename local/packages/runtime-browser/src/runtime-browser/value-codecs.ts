import {valueCodecDefinition,valueWireShape,canonicalJson,isTransportable} from '@adam-flow/core/flow-core/index.js';
import type {CodecReference,TypeRef,Catalog} from '@adam-flow/core/flow-core/index.js';
import type {BrowserCodecRegistry} from './codecs.js';

export function registerValueCodec(codecs:BrowserCodecRegistry,type:TypeRef):CodecReference {
  type=structuredClone(type);
  const definition=valueCodecDefinition(type);
  codecs.register({definition,encode:value=>type.kind==='optional'&&value===undefined?{}:{value:valueWireShape(type,value)},decode:payload=>(payload as {value?:unknown}).value});
  return {typeId:definition.typeId,version:definition.version};
}

/** Register only missing composite contracts; retain explicitly registered codecs. */
export function registerCatalogValueCodecs(codecs:BrowserCodecRegistry,catalog:Catalog):void {
  const known=new Set(codecs.catalog.codecs.map(codec=>canonicalJson(codec.valueType)));
  for(const node of catalog.nodes)for(const type of [...Object.values(node.inputs),...Object.values(node.outputs)]){
    if(!['dictionary','pageConfig','array','object','nullable','optional','entityRef','number','boolean','null'].includes(type.kind)||!isTransportable(type))continue;
    const key=canonicalJson(type);if(known.has(key))continue;
    registerValueCodec(codecs,type);known.add(key);
  }
}
