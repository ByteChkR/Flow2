import { ContractError, TypeRegistry, mergeCatalogs, parseContract } from '@adam-flow/flow-core';
import type { Catalog, CodecCatalog, Diagnostic, Flow, TypeDocument, TypeRef } from '@adam-flow/flow-core';
import { compileFlow, generateSegment } from '@adam-flow/flow-compiler';
import type { ExecutionPlan } from '@adam-flow/flow-compiler';
import { BrowserNodeRegistry, loadServerCatalog } from './index.js';
import { BrowserCodecRegistry } from './codecs.js';
import { runOrchestratedFlow } from './orchestrator.js';
import type { OrchestratorOptions } from './orchestrator.js';
import { connectPorts } from './editor.js';
import type { PortAddress } from '@adam-flow/flow-core';

export interface WorkspaceDiagnostic extends Diagnostic { node?: string; port?: string; type?: string; environment?: string }
export interface Inspection { flow?: Flow; plan?: ExecutionPlan; diagnostics: WorkspaceDiagnostic[]; preview: string }
export class FlowWorkspace {
  private loaded: {catalog:Catalog;types:TypeDocument;serverCodecs:CodecCatalog;nodes:BrowserNodeRegistry;codecs:BrowserCodecRegistry} | undefined;
  constructor(private readonly factory:(types:TypeDocument)=>{nodes:BrowserNodeRegistry;codecs:BrowserCodecRegistry},private readonly fetcher:typeof fetch=fetch) {}
  async load():Promise<{catalog:Catalog;serverCount:number;browserCount:number}> {
    this.loaded=undefined;
    const server=await loadServerCatalog(this.fetcher),browser=this.factory(server.types);
    const catalog=mergeCatalogs(new TypeRegistry(server.types),server.catalog,browser.nodes.catalog);
    this.loaded={catalog,types:server.types,serverCodecs:server.codecs,...browser};
    return {catalog,serverCount:server.catalog.nodes.length,browserCount:browser.nodes.catalog.nodes.length};
  }
  inspect(json:string):Inspection {
    let value:unknown;
    try {value=JSON.parse(json);} catch {return {diagnostics:[{code:'json',path:'',message:'Ungültiges JSON. Bitte Syntax prüfen.'}],preview:''};}
    if(!this.loaded) return {diagnostics:[{code:'catalog',path:'',message:'Server-Katalog ist noch nicht geladen.'}],preview:''};
    try {
      const flow=parseContract('flow',json);
      const plan=compileFlow(flow,this.loaded.catalog,this.loaded.types,{server:this.loaded.serverCodecs,browser:this.loaded.codecs.catalog});
      return {flow,plan,diagnostics:[],preview:plan.segments.map(segment=>`${segment.id} · ${segment.environment} · ${segment.nodeIds.join(' → ')}\n${generateSegment(segment)}`).join('\n\n')};
    } catch(error) {
      const diagnostics=error instanceof ContractError?error.diagnostics:[{code:'validation',path:'',message:error instanceof Error?error.message:String(error)}];
      return {diagnostics:diagnostics.map(diagnostic=>this.context(diagnostic,value)),preview:''};
    }
  }
  connect(flow:Flow,source:PortAddress,target:PortAddress):Flow {
    if(!this.loaded) throw new Error('Katalog ist noch nicht geladen.');
    return connectPorts(flow,source,target,this.loaded.catalog,this.loaded.types,{server:this.loaded.serverCodecs,browser:this.loaded.codecs.catalog});
  }
  run(json:string,options:Pick<OrchestratorOptions,'signal'|'onProgress'|'onTrace'>={}) {
    const inspection=this.inspect(json);
    if(!inspection.flow || inspection.diagnostics.length) throw new ContractError(inspection.diagnostics);
    return runOrchestratedFlow({...this.loaded!,flow:inspection.flow,fetcher:this.fetcher,...options});
  }
  private portType(node:Flow['nodes'][number]|undefined,port:string,direction:'inputs'|'outputs'):string {
    const type=this.loaded?.catalog.nodes.find(item=>item.type===node?.type && item.version===node.typeVersion)?.[direction][port];
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
