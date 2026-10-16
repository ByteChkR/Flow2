import {withWireSchemaCache} from '@adam-flow/core/flow-core/schema.js';
import {BrowserPlanCache} from './plan-cache.js';
import {resolveDefinition} from '@adam-flow/core/flow-core/node-resolution.js';
import {flowDesignations} from '@adam-flow/core/flow-core/designations.js';
import {inferQueryNodes,queryCodecs} from '@adam-flow/core/flow-core/query-nodes.js';
import {registerCatalogValueCodecs} from './value-codecs.js';
import { mergeCodecDefinitions,materializeHybrid,GraphBundleSnapshot,graphCatalog,graphCodecs,ContractError, TypeRegistry, mergeCatalogs, parseContract } from '@adam-flow/core/flow-core/index.js';
import type { FlowParameter,JsonValue,GraphBundle, Catalog, CodecCatalog, Diagnostic, Flow, TypeDocument, TypeRef } from '@adam-flow/core/flow-core/index.js';
import { compileFlow, generateSegment } from '@adam-flow/core/flow-compiler/index.js';
import type { ExecutionPlan } from '@adam-flow/core/flow-compiler/index.js';
import { BrowserNodeRegistry, loadServerCatalog } from './index.js';
import { BrowserCodecRegistry } from './codecs.js';
import {runLocalFlow,createLocalFlowCheck} from './local.js';
import { runOrchestratedFlow } from './orchestrator.js';
import type { OrchestratorOptions } from './orchestrator.js';
import { connectPorts } from './editor.js';
import type { PortAddress } from '@adam-flow/core/flow-core/index.js';

export interface WorkspaceDiagnostic extends Diagnostic { node?: string; port?: string; type?: string; environment?: string }
export interface Inspection { flow?: Flow; plan?: ExecutionPlan; diagnostics: WorkspaceDiagnostic[]; preview: string }
export class FlowWorkspace {
  private preparedFlows=new Map<string,Flow>();
  private planCache=new BrowserPlanCache();
  private loaded: {catalog:Catalog;types:TypeDocument;serverCodecs:CodecCatalog;nodes:BrowserNodeRegistry;codecs:BrowserCodecRegistry} | undefined;
  constructor(private readonly factory:(types:TypeDocument)=>{nodes:BrowserNodeRegistry;codecs:BrowserCodecRegistry},private readonly fetcher:typeof fetch=fetch,private readonly subscribeChanges?:OrchestratorOptions['subscribeChanges'],private readonly transportFactory?:(signal?:AbortSignal)=>Promise<OrchestratorOptions['transport']>) {}
  async load(signal?:AbortSignal):Promise<{catalog:Catalog;types:TypeDocument;serverCount:number;browserCount:number}> {
    this.planCache.clear();
    this.preparedFlows.clear();
    this.loaded=undefined;
    const server=await loadServerCatalog(this.fetcher,signal),browser=this.factory(server.types);
    const catalog=mergeCatalogs(new TypeRegistry(server.types),server.catalog,browser.nodes.catalog);
    registerCatalogValueCodecs(browser.codecs,catalog);
    this.loaded={catalog,types:server.types,serverCodecs:server.codecs,...browser};
    return {catalog,types:server.types,serverCount:server.catalog.nodes.length,browserCount:browser.nodes.catalog.nodes.length};
  }
  /** Initialize supplied, trusted types and browser implementations without HTTP. */
  loadLocal(types:TypeDocument={schemaVersion:1,types:[]}) {
    this.planCache.clear();
    this.preparedFlows.clear();
    const browser=this.factory(types),catalog=browser.nodes.catalog;
    registerCatalogValueCodecs(browser.codecs,catalog);
    this.loaded={catalog,types,serverCodecs:{schemaVersion:1,environment:'server',codecs:[]},...browser};
    return {catalog,types,serverCount:0,browserCount:catalog.nodes.length};
  }
  /** Add trusted application-authored browser definitions before session creation. */
  addBrowserNodes(items:import('./authoring.js').AuthoredNode[]):void {
    this.planCache.clear();
    this.preparedFlows.clear();
    if(!this.loaded)throw new Error('Katalog ist noch nicht geladen.');
    for(const item of items){
      if(this.loaded.catalog.nodes.some(node=>node.type===item.definition.type&&node.version===item.definition.version))continue;
      this.loaded.nodes.register(item);
      this.loaded.catalog.nodes.push(item.definition);
    }
    registerCatalogValueCodecs(this.loaded.codecs,this.loaded.catalog);
  }
  requireInputs(parameters:FlowParameter[],values:Record<string,JsonValue>):void {
    if(!this.loaded)throw new Error('Server-Katalog ist noch nicht geladen.');
    this.loaded.nodes.requireFlowValues(parameters,values);
  }
  inspect(json:string,bundle?:GraphBundle,environment:'server'|'browser'='server',preparePlan:typeof compileFlow=compileFlow):Inspection {
    let value:unknown;
    try {value=JSON.parse(json);} catch {return {diagnostics:[{code:'json',path:'',message:'Ungültiges JSON. Bitte Syntax prüfen.'}],preview:''};}
    if(!this.loaded) return {diagnostics:[{code:'catalog',path:'',message:'Server-Katalog ist noch nicht geladen.'}],preview:''};
    try {
      const flow=parseContract('flow',json);
      const snapshot=bundle?new GraphBundleSnapshot(bundle):undefined;
      const catalog=graphCatalog(flow,this.loaded.catalog,this.loaded.types);
      const designationErrors=flowDesignations.validateUse(flow,catalog,{...(bundle?{graphs:bundle.graphs}:{})});
      if(designationErrors.length)throw new ContractError(designationErrors);
      registerCatalogValueCodecs(this.loaded.codecs,catalog);
      if(snapshot)for(const [index,node] of flow.nodes.entries())if(node.graph?.graphId){
        try{snapshot.resolve(snapshot.reference(node.graph.graphId),node.graph.signature,this.loaded.catalog);}
        catch(error){throw new ContractError([{code:'graph_signature',path:`/nodes/${index}/graph`,message:error instanceof Error?error.message:String(error)}]);}
      }
      const graphs=snapshot?.document.graphs??[flow];
      const extra=mergeCodecDefinitions(snapshot?graphCodecs(snapshot.document):[],queryCodecs(graphs,this.loaded.serverCodecs.codecs));
      const plan=preparePlan(materializeHybrid(flow,environment),catalog,this.loaded.types,{server:{...this.loaded.serverCodecs,codecs:[...this.loaded.serverCodecs.codecs,...extra.filter(codec=>!this.loaded!.serverCodecs.codecs.some(existing=>existing.typeId===codec.typeId&&existing.version===codec.version))]},browser:{...this.loaded.codecs.catalog,codecs:[...this.loaded.codecs.catalog.codecs,...extra.filter(codec=>!this.loaded!.codecs.catalog.codecs.some(existing=>existing.typeId===codec.typeId&&existing.version===codec.version))]}});
      return {flow,plan,diagnostics:[],preview:plan.segments.map(segment=>`${segment.id} · ${segment.environment} · ${segment.nodeIds.join(' → ')}\n${generateSegment(segment)}`).join('\n\n')};
    } catch(error) {
      const diagnostics=error instanceof ContractError?error.diagnostics:[{code:'validation',path:'',message:error instanceof Error?error.message:String(error)}];
      return {diagnostics:diagnostics.map(diagnostic=>this.context(diagnostic,value)),preview:''};
    }
  }
  validationCapabilities() {
    if(!this.loaded)throw new Error('Server-Katalog ist noch nicht geladen.');
    return {browserCatalog:this.loaded.nodes.catalog,browserCodecs:this.loaded.codecs.catalog};
  }
  async validateBundle(bundle:GraphBundle,inputs:Record<string,JsonValue>={},signal?:AbortSignal,progressId?:string):Promise<Diagnostic[]> {
    if(!this.loaded)throw new Error('Server-Katalog ist noch nicht geladen.');
    const response=await this.fetcher('/api/validate',{method:'POST',headers:{'Content-Type':'application/json',...(progressId?{'X-Flow-Validation':progressId}:{})},...(signal?{signal}:{}),body:JSON.stringify({bundle,inputs,browserCatalog:this.loaded.nodes.catalog,browserCodecs:this.loaded.codecs.catalog})});
    const result=await response.json();
    if(!response.ok){if(response.status===400&&Array.isArray(result.errors))return result.errors;throw new Error(`Backend-Prüfung fehlgeschlagen: HTTP ${response.status}`);}
    if(!Array.isArray(result.diagnostics))throw new Error('Ungültige Antwort der Backend-Prüfung.');
    return result.diagnostics;
  }
  specialize(flow:Flow):Flow {
    if(!this.loaded)throw new Error('Katalog ist noch nicht geladen.');
    const next=structuredClone(flow);inferQueryNodes(next,this.loaded.catalog,this.loaded.types);return next;
  }
  connect(flow:Flow,source:PortAddress,target:PortAddress,kind?:'data'|'control',bundle?:GraphBundle):Flow {
    if(!this.loaded) throw new Error('Katalog ist noch nicht geladen.');
    const extra=bundle?graphCodecs({...bundle,graphs:bundle.graphs.map(graph=>graph.id===flow.id?flow:graph)}):[];
    return connectPorts(flow,source,target,graphCatalog(flow,this.loaded.catalog,this.loaded.types),this.loaded.types,{server:{...this.loaded.serverCodecs,codecs:[...this.loaded.serverCodecs.codecs,...extra.filter(codec=>!this.loaded!.serverCodecs.codecs.some(existing=>existing.typeId===codec.typeId&&existing.version===codec.version))]},browser:{...this.loaded.codecs.catalog,codecs:[...this.loaded.codecs.catalog.codecs,...extra.filter(codec=>!this.loaded!.codecs.catalog.codecs.some(existing=>existing.typeId===codec.typeId&&existing.version===codec.version))]}},kind);
  }
  canRunLocal(flow:Flow,bundle?:GraphBundle):boolean {
    if(!this.loaded)return false;
    try{
      const snapshot=bundle?new GraphBundleSnapshot(bundle):undefined;
      const check=createLocalFlowCheck({...this.loaded,flow,registryFactory:this.factory,...(bundle?{bundle}:{})},snapshot);
      check(flow);
      // The editor supplies the dependency bundle, including graph-valued inputs.
      for(const graph of bundle?.graphs??[])check(graph);
      return true;
    }catch{return false;}
  }
  run(json:string,options:Pick<OrchestratorOptions,'transport'|'fetcher'|'signal'|'onProgress'|'onTrace'|'inputs'|'bundle'|'profiling'|'processTaskId'|'allowUnknownInputs'|'subgraphOptimizations'> & {executionMode?:'coordinated'|'local';cachePreparation?:boolean}={}) {
    const started=options.profiling?performance.now():0;
    const preparation=options.cachePreparation?{preparePlan:this.planCache.prepare}:{};
    if(options.executionMode==='local'){
      if(!this.loaded)throw new Error('Katalog ist noch nicht geladen.');
      return runLocalFlow({...this.loaded,flow:parseContract('flow',json),registryFactory:this.factory,...options,...preparation});
    }
    // Cache successful static workspace inspection only. Orchestrator preflight,
    // designation/input checks and per-execution runtimes still run every time.
    const key=options.cachePreparation?JSON.stringify([json,options.bundle??null]):undefined;
    const cached=key===undefined?undefined:this.preparedFlows.get(key);
    const inspection:Inspection=cached?{flow:structuredClone(cached),diagnostics:[],preview:''}:withWireSchemaCache(options.subgraphOptimizations?.browserWireSchemaCache!==false,()=>this.inspect(json,options.bundle,'server',preparation.preparePlan));
    if(!inspection.flow || inspection.diagnostics.length) throw new ContractError(inspection.diagnostics);
    if(key!==undefined&&!cached){
      if(this.preparedFlows.size>=16)this.preparedFlows.delete(this.preparedFlows.keys().next().value!);
      this.preparedFlows.set(key,structuredClone(inspection.flow));
    }
    const execute=(transport:OrchestratorOptions['transport'])=>runOrchestratedFlow({...this.loaded!,flow:inspection.flow!,fetcher:this.fetcher,registryFactory:this.factory,...(this.subscribeChanges?{subscribeChanges:this.subscribeChanges}:{}),...options,transport,...preparation,...(options.profiling?{preparationMs:performance.now()-started}:{})});
    return !options.transport&&this.transportFactory?this.transportFactory(options.signal).then(execute):execute(options.transport);
  }
  private portType(node:Flow['nodes'][number]|undefined,port:string,direction:'inputs'|'outputs'):string {
    const type=(node&&this.loaded?resolveDefinition(this.loaded.catalog,node):undefined)?.[direction][port];
    const format=(value:TypeRef):string=>value.kind==='entity'||value.kind==='entityRef'?`${value.kind}<${value.name}>`:
      value.kind==='optional'?`optional<${format(value.inner)}>`:value.kind==='array'?`array<${format(value.items)}>`:
      value.kind==='object'?`object{${Object.entries(value.fields).map(([key,item])=>`${key}: ${format(item)}`).join(', ')}}`:value.kind;
    return type?format(type):'?';
  }
  private context(diagnostic:Diagnostic,value:unknown):WorkspaceDiagnostic {
    const flow=value as Partial<Flow>;
    if(!flow || !Array.isArray(flow.nodes)) return diagnostic;
    const nodes=flow.nodes.filter(node=>node && typeof node==='object');
    const connection=/\/(?:connections)\/(\d+)/.exec(diagnostic.path);
    if(connection && Array.isArray(flow.connections)) {
      const edge=flow.connections[Number(connection[1])];
      if(edge?.source && edge?.target) {
        const source=nodes.find(node=>node.id===edge.source.nodeId),target=nodes.find(node=>node.id===edge.target.nodeId);
        return {...diagnostic,node:`${edge.source.nodeId} → ${edge.target.nodeId}`,port:`${edge.source.port} → ${edge.target.port}`,
          type:`${this.portType(source,edge.source.port,'outputs')} → ${this.portType(target,edge.target.port,'inputs')}`,environment:`${source?.environment ?? '?'} → ${target?.environment ?? '?'}`};
      }
    }
    const match=/\/(?:nodes)\/([^/]+)(?:\/(?:inputs|outputs)\/([^/]+))?/.exec(diagnostic.path);
    if(match) {
      const node=nodes.find(node=>node.id===match[1]) ?? nodes[Number(match[1])];
      if(node) return {...diagnostic,node:node.id,type:match[2]?this.portType(node,match[2],'inputs'):node.type,environment:node.environment,...(match[2]?{port:match[2]}:{})};
    }
    return diagnostic;
  }
}
