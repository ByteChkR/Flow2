import {describeNode} from './node-descriptions.js';
import {templateNames} from './node-names.js';
import type {Catalog,Flow,FlowNode,NodeDefinition,TypeRef} from './model.js';
import {canonicalJson,isTransportable} from './transport.js';
import {parseContract} from './schema.js';

export function templateOperation(type:string):string|undefined{return Object.entries(templateNames).find(([,name])=>name===type)?.[0];}
function templateNodeDefinitionCore(node:FlowNode):NodeDefinition {
  const operation=templateOperation(node.type);
  if(!operation||node.environment!=='server'||node.typeVersion!==1)throw new Error('Ungültige Template-Node.');
  const parameters:TypeRef=node.config.parameterType?parseContract('type',String(node.config.parameterType)):{kind:'object',fields:{}};
  if(parameters.kind!=='object'||!isTransportable(parameters))throw new Error('Template-Parameter benötigen einen transportierbaren Record.');
  const text:TypeRef={kind:'string'},guid:TypeRef={kind:'scalar',name:'core.Guid'};
  const inputs:Record<string,TypeRef>={parameters:{kind:'optional',inner:parameters},id:operation==='default'?guid:{kind:'optional',inner:guid}};
  if(operation!=='default')inputs.where={kind:'optional',inner:text};
  if(operation==='execute'){inputs.entity=text;inputs.name=text;}
  else if(operation==='byId')inputs.templateId=guid;
  else inputs.groupName=text;
  if(operation==='fromModel'){for(const key of Object.keys(inputs))delete inputs[key];inputs.templateId=guid;inputs.model=parameters;}
  return {nodeId:node.id,type:node.type,version:1,environments:['server'],inputs,outputs:{data:text,type:text,vorlageId:guid,vorlagenGruppeId:{kind:'nullable',inner:guid},betreff:{kind:'nullable',inner:text}},metadata:{label:operation==='execute'?'ExecuteTemplate':operation==='byId'?'ExecuteTemplateById':operation==='fromModel'?'Template aus Datenmodell':'ExecuteDefaultTemplate',category:'Backend/Templates'},config:{parameterType:{type:'string',default:JSON.stringify(parameters),label:operation==='fromModel'?'Datenmodellvertrag':'Parametervertrag'}},control:{input:true,output:true,start:false}};
}
export function templateCatalog(flow:Flow,base:Catalog):Catalog {
  const specialized=flow.nodes.filter(node=>templateOperation(node.type));
  return {...base,nodes:[...base.nodes.filter(def=>!specialized.some(node=>node.type===def.type&&node.id===def.nodeId)),...specialized.map(templateNodeDefinition)]};
}
export function inferTemplateNodes(flow:Flow,definition:(node:FlowNode)=>NodeDefinition|undefined):boolean {
  let changed=false;
  for(const node of flow.nodes){
    const operation=templateOperation(node.type);if(!operation)continue;
    const edge=flow.connections.find(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port===(operation==='fromModel'?'model':'parameters'));
    const source=flow.nodes.find(item=>item.id===edge?.source.nodeId);
    const type=edge&&source?definition(source)?.outputs[edge.source.port]:undefined;
    if(!type){
      if(node.type!==templateNames[operation as keyof typeof templateNames]){node.type=templateNames[operation as keyof typeof templateNames];changed=true;}
      continue;
    }
    const record=type.kind==='optional'?type.inner:type;
    if(record.kind!=='object'||!isTransportable(record))throw new Error('Template-Parameter benötigen einen transportierbaren Record.');
    const before=canonicalJson(node);
    node.type=templateNames[operation as keyof typeof templateNames];
    node.config.parameterType=JSON.stringify(record);
    changed=changed||before!==canonicalJson(node);
  }
  return changed;
}

export function templateNodeDefinition(node:FlowNode):NodeDefinition {return describeNode(templateNodeDefinitionCore(node));}
