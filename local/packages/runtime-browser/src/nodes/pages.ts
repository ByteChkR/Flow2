import {isStep,stepDefinition,stepImplementation} from './steps.js';
import type {Flow,FlowNode,NodeDefinition,TypeRef,Catalog} from '@adam-flow/core/flow-core/model.js';
import type {BrowserNodeRegistry} from '../runtime-browser/index.js';
import {isTransportable} from '@adam-flow/core/flow-core/transport.js';
import {requirePage,validatePageBindings} from '../ui/page-contract.js';
import type {FlowInteractionHost} from '../ui/interactions.js';
export interface PageHost {preparePage?(page:unknown):unknown;pageByName(name:string):unknown|Promise<unknown>}
export const pageType:TypeRef={kind:'pageConfig'};
export const isPageShow=(type:string)=>type==='Frontend.UI.ShowPage'||type==='Frontend.UI.ShowDialog';
export function pageDefinition(node:FlowNode):NodeDefinition {
  if(!isPageShow(node.type)||node.environment!=='browser'||node.typeVersion!==1||!node.ui||node.ui.dataType.kind!=='object'||!isTransportable(node.ui.dataType))throw new Error('Ansicht benötigt einen transportierbaren Record-Vertrag.');
  const data=node.ui.dataType;
  const inputs:Record<string,TypeRef>={page:pageType,data:Object.keys(data.fields).length?data:{kind:'optional',inner:data}};
  if(node.type==='Frontend.UI.ShowDialog')inputs.dialogOptions={kind:'optional',inner:{kind:'object',fields:{fullscreen:{kind:'optional',inner:{kind:'scalar',name:'core.Bool'}},size:{kind:'optional',inner:{kind:'string'}},allowCancel:{kind:'optional',inner:{kind:'scalar',name:'core.Bool'}},cancelLabel:{kind:'optional',inner:{kind:'string'}}}}};
  return {nodeId:node.id,type:node.type,version:1,environments:['browser'],inputs,outputs:{action:{kind:'string'},cancelled:{kind:'scalar',name:'core.Bool'},data:{kind:'optional',inner:data}},control:{input:true,output:true,start:false},ui:structuredClone(node.ui),metadata:{label:node.type.endsWith('ShowPage')?'Seite anzeigen':'Dialog anzeigen',category:'Frontend/UI'}};
}
export function pageCatalog(flow:Flow,catalog:Catalog):Catalog {return {...catalog,nodes:[...catalog.nodes.filter(d=>!d.nodeId||!isPageShow(d.type)&&!isStep(d.type)),...flow.nodes.filter(n=>isPageShow(n.type)).map(pageDefinition),...flow.nodes.filter(n=>isStep(n.type)&&n.ui).map(stepDefinition)]};}
function implementation(definition:NodeDefinition,host?:FlowInteractionHost,pages?:PageHost){return {definition,execute:async(inputs:Record<string,unknown>,context:{nodeId:string;signal?:AbortSignal;onWait?:(ms:number)=>void})=>{
  if(!host)throw new Error('Flow-Ansicht ist nicht verfügbar.');const page=requirePage(pages?.preparePage?pages.preparePage(inputs.page):inputs.page);validatePageBindings(page,definition.ui!.dataType);
  const result=await host.request(context.nodeId,{kind:definition.type.endsWith('ShowPage')?'page':'dialog',page,dataType:definition.ui!.dataType,data:(inputs.data??{}) as Record<string,unknown>,...(inputs.dialogOptions?{dialogOptions:inputs.dialogOptions as import('../ui/presentation.js').DialogOptions}:{})},context.signal,context.onWait);return {...result};
}};}
export function registerPageNodes(flow:Flow,nodes:BrowserNodeRegistry,host?:FlowInteractionHost,pages?:PageHost){for(const node of flow.nodes.filter(n=>isPageShow(n.type)))nodes.register(implementation(pageDefinition(node),host,pages));for(const node of flow.nodes.filter(n=>isStep(n.type)&&n.ui))nodes.register(stepImplementation(stepDefinition(node),host));}
export function pageNodes(host?:FlowInteractionHost,pages?:PageHost){
  const show=['Frontend.UI.ShowPage','Frontend.UI.ShowDialog'].map(type=>{const {nodeId,...definition}=pageDefinition({id:'prototype',type,typeVersion:1,environment:'browser',config:{},ui:{dataType:{kind:'object',fields:{}}}});return implementation(definition,host,pages);});
  return [...show,...['PageByName','PageConfig'].map(operation=>({definition:{type:'Frontend.UI.'+operation,version:1,environments:['browser' as const],inputs:{},outputs:{value:pageType},config:operation==='PageByName'?{name:{type:'string' as const,default:'',label:'Seite'}}:{page:{type:'string' as const,default:JSON.stringify({name:'FlowPage',content:{panels:[]}}),label:'Page-Config'}},metadata:{label:operation==='PageByName'?'Seite nach Name':'Page-Config',category:'Frontend/UI'}},execute:async(_:Record<string,unknown>,context:{config:Readonly<Record<string,unknown>>})=>{
    if(operation==='PageByName'&&!pages)throw new Error('Page-Katalog ist nicht verfügbar.');return {value:requirePage(operation==='PageByName'?await pages!.pageByName(String(context.config.name)):JSON.parse(String(context.config.page)))};
  }}))];
}

import {registerGraphCatalogExtension} from '@adam-flow/core/flow-core/extensions.js';
registerGraphCatalogExtension('presentation',pageCatalog);
