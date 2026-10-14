import {describeNode} from './node-descriptions.js';
import {isAssignable,TypeRegistry} from './types.js';
import type {Catalog,CodecDefinition,Flow,FlowNode,NodeDefinition,TypeRef,TypeDocument} from './model.js';
import {canonicalJson,isTransportable} from './transport.js';
import {generalValueDefinition} from './general-value-nodes.js';
import {valueCodecDefinition} from './value-codecs.js';

export const coalesceType='Standard.Values.Coalesce';
export const valueNodeType=(id:string)=>coalesceType;
function valueNodeDefinitionCore(node:FlowNode):NodeDefinition {
  const binding=node.value;
  if(binding&&binding.operation!=='coalesce')return generalValueDefinition(node);
  if(!binding||binding.operation!=='coalesce'||node.type!==valueNodeType(node.id)||node.typeVersion!==1||node.graph||node.query||binding.member!==undefined||binding.result!==undefined||binding.fields!==undefined||binding.count!==undefined||['null','nullable','optional'].includes(binding.type.kind))throw new Error('Ungültige Coalesce-Spezialisierung: T muss einen vorhandenen, nicht-nullfähigen Wert beschreiben.');
  const type=structuredClone(binding.type);
  return {nodeId:node.id,type:node.type,version:1,environments:isTransportable(type)?['server','browser']:['server'],inputs:{value:{kind:'optional',inner:{kind:'nullable',inner:type}},fallback:type},outputs:{value:type},metadata:{label:'Coalesce',category:'Werte/Null',description:'Verwendet den Ersatzwert bei fehlendem Wert oder null. Beide Eingänge werden ausgewertet.',inputs:{value:{label:'Wert'},fallback:{label:'Ersatzwert'}},outputs:{value:{label:'Wert'}}},value:structuredClone(binding)};
}
export function coalesceTemplate():NodeDefinition {
  const {value,nodeId,...definition}=valueNodeDefinition({id:'template',type:valueNodeType('template'),typeVersion:1,environment:'browser',config:{},value:{operation:'coalesce',type:{kind:'string'}}});
  return {...definition,type:coalesceType,metadata:{...definition.metadata,label:'Coalesce<T>'}};
}
export function valueCatalog(flow:Flow,base:Catalog):Catalog {
  return {schemaVersion:1,nodes:[...base.nodes.filter(node=>!node.value),...flow.nodes.filter(node=>node.value).map(valueNodeDefinition)]};
}
export function valueCodecs(flows:Flow[],existing:CodecDefinition[]=[]):CodecDefinition[]{
  const result:CodecDefinition[]=[];
  for(const flow of flows)for(const node of flow.nodes.filter(node=>node.value)){
    const definition=valueNodeDefinition(node);
    // A present value may cross into an optional input without the optional wrapper.
    for(const type of [...Object.values(definition.inputs),...Object.values(definition.outputs)].flatMap(type=>type.kind==='optional'?[type,type.inner]:[type])){
      if(!['dictionary','pageConfig','array','object','nullable','optional','entityRef','number','boolean','null'].includes(type.kind)||!isTransportable(type))continue;
      const codec=valueCodecDefinition(type);
      if(![...existing,...result].some(item=>item.typeId===codec.typeId&&item.version===codec.version))result.push(codec);
    }
  }
  return result;
}
export function inferValueNode(node:FlowNode,flow:Flow,definition:(node:FlowNode)=>NodeDefinition|undefined,types?:TypeDocument):boolean {
  if(!node.value)return false;
  if(node.value.operation!=='coalesce'){
    const binding=node.value,before=canonicalJson(binding);
    const sourceType=(port:string)=>{
      const edge=flow.connections.find(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port===port);
      const source=flow.nodes.find(item=>item.id===edge?.source.nodeId);
      return edge&&source?definition(source)?.outputs[edge.source.port]:undefined;
    };
    if(binding.operation==='ternary'){
      const branches=[sourceType('whenTrue'),sourceType('whenFalse')].filter((type):type is TypeRef=>!!type);
      const registry=new TypeRegistry(types??{schemaVersion:1,types:[]});
      const compatible=[binding.type,...branches].find(candidate=>branches.every(source=>isAssignable(source,candidate,registry)));
      if(branches.length&&compatible)binding.type=structuredClone(compatible);
      else if(branches[0])binding.type=structuredClone(branches[0]);
    }
    const listInput=['count','getItem','addItem','addRange','insertItem','insertRange','setItem','removeAt','removeRange','clear','removeItem','removeAll','tryGetItem','first','last','tryFirst','tryLast','single','trySingle','contains','indexOf','lastIndexOf','isEmpty','skip','take','slice','reverse','chunk','flatten','sort','distinct','union','intersect','except','zip','sum','average','min','max'].includes(binding.operation);
    const incoming=sourceType(listInput?'items':binding.operation==='merge'?'left':'value');
    if(incoming){
      let type=incoming;
      if(binding.operation==='require')while(type.kind==='optional'||type.kind==='nullable')type=type.inner;
      if(listInput){
        if(type.kind==='array'){
          if(binding.operation==='flatten'){if(type.items.kind==='array')binding.type=structuredClone(type.items.items);}
          else binding.type=structuredClone(type.items);
        }
      }
      else if(['output','isMissing','isNull','require','getProperty','withFields','jsonFrom','hasField','removeField','merge'].includes(binding.operation))binding.type=structuredClone(type);
    }
    if(!incoming&&['addItem','insertItem','setItem','removeItem','removeAll','contains','indexOf','lastIndexOf'].includes(binding.operation)){
      const item=sourceType('item');if(item&&item.kind!=='optional')binding.type=structuredClone(item);
    }
    if(!incoming&&['addRange','insertRange'].includes(binding.operation)){
      const additional=sourceType('additionalItems');if(additional?.kind==='array')binding.type=structuredClone(additional.items);
    }
    if(binding.operation.startsWith('dict')){
      const dictionary=sourceType('dictionary');
      if(dictionary?.kind==='dictionary')binding.type=structuredClone(dictionary.items);
      else if(binding.operation==='dictSet'){const item=sourceType('item');if(item&&item.kind!=='optional')binding.type=structuredClone(item);}
      else if(binding.operation==='dictCreate'){const entries=sourceType('entries');if(entries?.kind==='array'&&entries.items.kind==='object'&&entries.items.fields.value)binding.type=structuredClone(entries.items.fields.value);}
    }
    if(binding.operation==='merge'){const right=sourceType('right');if(right?.kind==='object')binding.result=structuredClone(right);}
    if(binding.operation==='removeField'&&binding.type.kind==='object'&&!Object.hasOwn(binding.type.fields,binding.member??'')){const first=Object.keys(binding.type.fields)[0];if(first!==undefined)binding.member=first;else delete binding.member;}
    if(binding.operation==='zip'){const right=sourceType('other');if(right?.kind==='array')binding.result=structuredClone(right.items);}
    if(binding.operation==='list')for(let i=0;i<(binding.count??0);i++){const type=sourceType(`item_${i}`);if(type){binding.type=structuredClone(type);break;}}
    if(binding.operation==='record'&&binding.type.kind==='object'){
      // A present source may populate an optional/null-capable field without removing its declared modifiers.
      const preserveModifiers=(declared:TypeRef,inferred:TypeRef):TypeRef=>{
        if((declared.kind==='optional'||declared.kind==='nullable')&&inferred.kind!==declared.kind)return {kind:declared.kind,inner:preserveModifiers(declared.inner,inferred)};
        return structuredClone(inferred);
      };
      for(const field of Object.keys(binding.type.fields)){const type=sourceType(`field_${field}`);if(type)binding.type.fields[field]=preserveModifiers(binding.type.fields[field]!,type);}
    }
    if(binding.operation==='getProperty'){
      if(binding.type.kind==='entity'){
        const field=types?.types.find(type=>type.id===(binding.type as {name:string}).name)?.fields[binding.member??''];
        if(field)binding.result=structuredClone(field);
      }else delete binding.result;
    }
    return before!==canonicalJson(binding);
  }
  const before=canonicalJson(node.value.type);
  // The nullable value is authoritative; a fallback alone can establish T as well.
  for(const port of ['value','fallback']){
    const edge=flow.connections.find(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port===port);
    const source=flow.nodes.find(item=>item.id===edge?.source.nodeId);
    let type:TypeRef|undefined=edge&&source?definition(source)?.outputs[edge.source.port]:undefined;
    if(!type)continue;
    while(type.kind==='nullable'||type.kind==='optional')type=type.inner;
    if(type.kind==='null')continue;
    node.value.type=structuredClone(type);break;
  }
  return before!==canonicalJson(node.value.type);
}

export function valueNodeDefinition(node:FlowNode):NodeDefinition {return describeNode(valueNodeDefinitionCore(node));}
