import {efDefinition} from './ef-nodes.js';
import {queryNames} from './node-names.js';
import {resolveDefinition} from './node-resolution.js';
import {templateCatalog,templateNodeDefinition,templateOperation,inferTemplateNodes} from './template-nodes.js';
import {graphNodeDefinition} from './graph-nodes.js';
import {valueCatalog,valueCodecs,valueNodeDefinition,inferValueNode} from './value-nodes.js';
import type {Catalog,CodecDefinition,Flow,FlowNode,NodeDefinition,QueryNodeBinding,TypeDocument,TypeRef} from './model.js';
import {canonicalJson,isTransportable} from './transport.js';
import {expressionTypes} from './expressions.js';
import {valueCodecDefinition} from './value-codecs.js';
import {parseContract} from './schema.js';

const labels:Record<QueryNodeBinding['operation'],string>={any:'Any',first:'First',firstOrDefault:'FirstOrDefault',toList:'ToList',where:'Where',all:'All',orderBy:'OrderBy',thenBy:'ThenBy',select:'Select',groupBy:'GroupBy',skip:'Skip',take:'Take',count:'Count'};
export function queryOperation(node:Pick<NodeDefinition,'type'|'query'>):QueryNodeBinding['operation']|undefined {
  return node.query?.operation??(Object.entries(queryNames).find(([,name])=>name===node.type)?.[0] as QueryNodeBinding['operation']|undefined);
}
export const queryNodeType=(id:string,operation:string)=>queryNames[operation as keyof typeof queryNames];
export const queryPredicate=(operation:string)=>['where','all'].includes(operation);
export function queryNodeDefinition(node:FlowNode):NodeDefinition {
  const binding=node.query;
  if(!binding||!Object.hasOwn(labels,binding.operation)||node.type!==queryNodeType(node.id,binding.operation)||node.typeVersion!==1||node.environment!=='server'||node.graph||
    (['select','groupBy'].includes(binding.operation)?!binding.result:binding.result!==undefined))throw new Error('Ungültige Query-Spezialisierung.');
  const {operation,element}=binding;
  const input:TypeRef={kind:operation==='thenBy'?'orderedQueryable':'queryable',items:element};
  let output:TypeRef;
  switch(operation){
    case 'any':case 'all':output={kind:'scalar',name:'core.Bool'};break;
    case 'count':output={kind:'scalar',name:'core.Integer'};break;
    case 'first':output=element;break;
    case 'firstOrDefault':output=['string','entity','object','array','grouping','enumerable'].includes(element.kind)?{kind:'nullable',inner:element}:element;break;
    case 'toList':output={kind:'array',items:element};break;
    case 'skip':case 'take':case 'where':output={kind:'queryable',items:element};break;
    case 'orderBy':case 'thenBy':output={kind:'orderedQueryable',items:element};break;
    case 'groupBy':output={kind:'queryable',items:{kind:'grouping',key:binding.result!,items:element}};break;
    case 'select':output={kind:'queryable',items:binding.result!};break;
  }
  const deferred=['skip','take','where','select','orderBy','thenBy','groupBy'].includes(operation);
  const definition:NodeDefinition={nodeId:node.id,type:node.type,version:1,environments:['server'],inputs:{query:input},outputs:{[deferred?'query':'value']:output},metadata:{label:labels[operation],category:'Query'},query:structuredClone(binding)};
  if(['skip','take'].includes(operation))definition.inputs.count={kind:'scalar',name:'core.Integer'};
  for(const [name,type] of Object.entries(operation==='any'&&!binding.predicate?{}:binding.parameters??{})){
    const scalar=type.kind==='nullable'?type.inner:type;
    if(!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)||!['scalar','string'].includes(scalar.kind)||!(queryPredicate(operation)||operation==='any'||['select','orderBy','thenBy','groupBy'].includes(operation)))throw new Error('Ungültiger Query-Parameter.');
    definition.inputs['arg_'+name]=type;
  }
  if(!deferred)definition.control={input:true,output:true,start:false};
  if(queryPredicate(operation)||operation==='any'||['select','orderBy','thenBy','groupBy'].includes(operation)){
    const expression=operation==='select'?{schemaVersion:1,parameter:element,nodes:[{id:'item',operation:'parameter',inputs:{}}],result:'item'}:
      {schemaVersion:1,parameter:element,nodes:[{id:'item',operation:'parameter',inputs:{}},{id:'result',operation:'constant',inputs:{},type:{kind:'scalar',name:(queryPredicate(operation)||operation==='any')?'core.Bool':'core.Integer'},value:(queryPredicate(operation)||operation==='any')?true:0}],result:'result'};
    definition.config={expression:{type:'string',default:JSON.stringify(expression),label:queryPredicate(operation)?'Bedingung':operation==='select'?'Projektion':operation==='groupBy'?'Gruppenschlüssel':'Sortierschlüssel'}};
    if(['orderBy','thenBy'].includes(operation))definition.config.descending={type:'boolean',default:false,label:'Absteigend'};
  }
  return definition;
}
export function queryCatalog(flow:Flow,base:Catalog):Catalog {
  return templateCatalog(flow,valueCatalog(flow,{schemaVersion:1,nodes:[...base.nodes.filter(node=>!node.query),...flow.nodes.filter(node=>node.query).map(queryNodeDefinition)]}));
}
export function queryCodecs(flows:Flow[],existing:CodecDefinition[]=[]):CodecDefinition[]{
  const result:CodecDefinition[]=valueCodecs(flows,existing);
  for(const flow of flows)for(const node of flow.nodes.filter(node=>node.query))for(const type of Object.values(queryNodeDefinition(node).outputs)){
    if(!['array','object','nullable','optional','entityRef'].includes(type.kind)||!isTransportable(type))continue;
    const definition=valueCodecDefinition(type);
    if(![...existing,...result].some(codec=>codec.typeId===definition.typeId&&codec.version===definition.version))result.push(definition);
  }
  for(const flow of flows)for(const node of flow.nodes.filter(node=>templateOperation(node.type))){
    const definition=templateNodeDefinition(node);
    const parameters=definition.inputs.parameters??definition.inputs.model!;
    for(const type of [parameters,...(parameters.kind==='optional'?[parameters.inner]:[]),...Object.values(definition.outputs)]){
      if(!['object','array','optional','nullable','entityRef'].includes(type.kind))continue;
      const codec=valueCodecDefinition(type);
      if(![...existing,...result].some(item=>item.typeId===codec.typeId&&item.version===codec.version))result.push(codec);
    }
  }
  return result;
}
export function queryPalette(nodes:NodeDefinition[]):NodeDefinition[] {
  const seen=new Set<string>();
  return nodes.flatMap(node=>{const operation=queryOperation(node);if(!operation)return [node];if(seen.has(operation))return [];seen.add(operation);return [{...node,metadata:{...node.metadata,label:`${labels[operation]}<T>`}}];});
}
/** Re-evaluate all query families until downstream types have stabilized. */
export function inferQueryNodes(flow:Flow,catalog:Catalog,types?:TypeDocument):void {
  const definition=(node:FlowNode)=>node.ef?efDefinition(node,catalog,types??{schemaVersion:1,types:[]}):node.graph?graphNodeDefinition(node):templateOperation(node.type)?templateNodeDefinition(node):node.value?valueNodeDefinition(node):node.query?queryNodeDefinition(node):resolveDefinition(catalog,node);
  for(let pass=0;pass<=flow.nodes.length;pass++){
    let changed=inferTemplateNodes(flow,definition);
    for(const node of flow.nodes){
      if(node.value){
        // Keep the last usable contract when an upstream edit no longer fits this operation.
        // The ordinary connection validator reports the mismatch; inference must not break the editor.
        const candidate={...node,value:structuredClone(node.value)};
        try{
          const updated=inferValueNode(candidate,flow,definition,types);
          valueNodeDefinition(candidate);
          node.value=candidate.value;changed=updated||changed;
        }catch{/* Preserve the existing member and contract for manual correction. */}
        continue;
      }
      const operation=queryOperation(node);if(!operation)continue;
      const edge=flow.connections.find(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port==='query');
      const source=flow.nodes.find(item=>item.id===edge?.source.nodeId);
      const sourceDef=source?definition(source):undefined;
      const input=edge?sourceDef?.outputs[edge.source.port]:node.query?{kind:operation==='thenBy'?'orderedQueryable':'queryable',items:node.query.element}:undefined;
      if(input?.kind!=='queryable'&&input?.kind!=='orderedQueryable')continue;
      if(operation==='thenBy'&&input.kind!=='orderedQueryable')throw new Error('ThenBy benötigt eine geordnete Query.');
      const before=canonicalJson(node);
      const family=catalog.nodes.find(item=>!item.nodeId&&queryOperation(item)===operation);
      if(typeof node.config.expression==='string'){
        try{const expression=JSON.parse(node.config.expression);if(canonicalJson(expression.parameter)!==canonicalJson(input.items))node.config.expression=JSON.stringify({...expression,parameter:input.items});}catch{/* The normal validation reports malformed expressions. */}
      }
      {
        const binding:QueryNodeBinding={operation,element:structuredClone(input.items),...(operation==='any'?{predicate:node.query?.predicate??false}:{})};
        try {
          const expression=parseContract('expression',String(node.config.expression??family?.config?.expression?.default));
          const parameters=Object.fromEntries(expression.nodes.filter(n=>n.operation==='external').map(n=>[n.member!,n.type!]));
          if(Object.keys(parameters).length)binding.parameters=parameters;
        } catch { if(node.query?.parameters)binding.parameters=node.query.parameters; }
        if(operation==='select'||operation==='groupBy'){
          binding.result=node.query?.result??(operation==='groupBy'?{kind:'scalar',name:'core.Integer'}:input.items);
          if(types)try{
            const expression=parseContract('expression',String(node.config.expression??family?.config?.expression?.default));
            binding.result=expressionTypes(expression,types).get(expression.result)!;
          }catch{/* Keep the last known result while the draft is incomplete. */}
        }
        node.query=binding;node.type=queryNodeType(node.id,operation);node.typeVersion=1;
      }
      changed=changed||before!==canonicalJson(node);
    }
    if(!changed)return;
  }
}
