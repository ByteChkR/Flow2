import {validateTableChanges,type TablePanel} from './table-model.js';
import {fieldType,panels,actions,validatePageData,requireData,requirePage,validatePageBindings,type PageConfig} from './page-contract.js';
import {writable} from 'svelte/store';
import type {TypeRef} from '@adam-flow/core/flow-core/model.js';
import {validatePresentation} from './presentation.js';

export type Interaction = {kind:'page'|'dialog';page:PageConfig;dataType:TypeRef;data:Record<string,unknown>;dialogOptions?:import('./presentation.js').DialogOptions};
export type InteractionRequest = Interaction & {token:number;nodeId:string};
export interface InteractionResult {action:string;cancelled:boolean;data?:Record<string,unknown>}
export interface FlowInteractionHost {
  scheduleNavigation?(path:string):void;
  request(nodeId:string,interaction:Interaction,signal?:AbortSignal,onWait?:(durationMs:number)=>void):Promise<InteractionResult>;
}
interface Pending {request:InteractionRequest;resolve:(result:InteractionResult)=>void;reject:(reason:unknown)=>void;cleanup:()=>void}

/** One queue per workspace, shared by all runtime instances and subgraph calls. */
export class FlowInteractions implements FlowInteractionHost {
  private readonly state=writable<InteractionRequest|null>(null);
  readonly subscribe=this.state.subscribe;
  private queue:Pending[]=[];
  private nextToken=0;
  private disposed=false;
  private navigation:string|undefined;
  scheduleNavigation(path:string):void {
    if(this.disposed)throw new Error('Die Flow-Ansicht wurde geschlossen.');
    if(!path.startsWith('/')||path.startsWith('//')||/[\\\u0000-\u0020]/.test(path))throw new Error('Ungültiges Navigationsziel.');
    if(this.navigation&&this.navigation!==path)throw new Error('Ein Lauf darf nur ein Navigationsziel haben.');
    this.navigation=path;
  }
  finishNavigation(completed:boolean):string|undefined {const path=this.navigation;this.navigation=undefined;return completed?path:undefined;}
  request(nodeId:string,interaction:Interaction,signal?:AbortSignal,onWait?:(durationMs:number)=>void):Promise<InteractionResult> {
    if(this.disposed)return Promise.reject(new Error('Die Flow-Ansicht wurde geschlossen.'));
    if(signal?.aborted)return Promise.reject(signal.reason);
    interaction={...interaction,page:requirePage(interaction.page),data:structuredClone(interaction.data)};
    validatePageBindings(interaction.page,interaction.dataType);
    if(interaction.dialogOptions)validatePresentation({dialogOptions:interaction.dialogOptions});
    const started=onWait?performance.now():0;
    return new Promise<InteractionResult>((resolve,reject)=>{
      const pending:Pending={request:{...interaction,nodeId,token:++this.nextToken},resolve,reject,cleanup:()=>signal?.removeEventListener('abort',abort)};
      const abort=()=>{this.remove(pending);reject(signal?.reason??new DOMException('Flow abgebrochen','AbortError'));};
      this.queue.push(pending);
      signal?.addEventListener('abort',abort,{once:true});
      this.publish();
    }).finally(()=>onWait?.(performance.now()-started));
  }
  complete(token:number,result:InteractionResult):boolean {
    const pending=this.queue[0];
    if(!pending||pending.request.token!==token)return false;
    const request=pending.request;
    let normalized:InteractionResult;
    if(result.cancelled){
      if(request.dialogOptions?.allowCancel===false)throw new Error('Abbrechen ist deaktiviert.');
      normalized={action:'cancel',cancelled:true};
    }else{
      const configured=actions(request.page,result.data??request.data);
      const allowed=configured.length?configured.filter(a=>!a.disabled&&a.visible!==false).map(a=>a.id):['continue'];
      if(!allowed.includes(result.action))throw new Error('Ungültige Abschlussaktion.');
      const data=requireData(request.dataType,result.data);validatePageData(request.page,data,request.dataType);
      for(const panel of panels(request.page))if(panel.type==='FlowTable'){const list=fieldType(request.dataType,panel.field);if(list.kind==='array')validateTableChanges(panel as unknown as TablePanel,request.data,data,list.items);}
      normalized={action:result.action,cancelled:false,data};
    }
    this.remove(pending);pending.resolve(normalized);return true;
  }

  fail(token:number,reason:unknown):void {
    const pending=this.queue[0];
    if(pending?.request.token===token){this.remove(pending);pending.reject(reason);}
  }
  cancelAll(reason:unknown=new DOMException('Flow abgebrochen','AbortError')):void {
    this.navigation=undefined;
    const pending=this.queue;this.queue=[];
    for(const item of pending){item.cleanup();item.reject(reason);}
    this.publish();
  }
  dispose():void {this.disposed=true;this.cancelAll();}
  private remove(pending:Pending):void {pending.cleanup();this.queue=this.queue.filter(item=>item!==pending);this.publish();}
  private publish():void {this.state.set(this.queue[0]?.request??null);}
}
