import type {NodeToolboxEntry} from './editor/model.js';
export let nodeToolbox:NodeToolboxEntry[]=[];
import {writable,type Readable} from 'svelte/store';
import type {FlowWorkspace} from '@adam-flow/runtime-browser/runtime-browser/workspace.js';
export const configStore=writable<Record<string,any[]>>({});
export let backendTriggerDesignation='';
export let entityBackendTriggerDesignation='';
export let frontendProcessDesignation='';
let factory:(...args:any[])=>FlowWorkspace=()=>{throw new Error('Flow editor host: provide a workspace or configure createWorkspace.');};
let transport:any;
export const workspaceTransport={get:(...args:any[])=>required().get(...args),post:(...args:any[])=>required().post(...args),put:(...args:any[])=>required().put(...args),isAxiosError:(error:unknown):error is {response?:{data?:{error?:string}};message:string}=>!!transport?.isAxiosError?.(error)};
function required(){if(!transport)throw new Error('Flow editor host: workspace persistence is not configured.');return transport;}
export function createFlowWorkspace(...args:any[]){return factory(...args);}
export const recentEntities={remember:(record:unknown)=>remember(record)};
let remember:(record:unknown)=>unknown=()=>false;
let unsubscribe:(()=>void)|undefined;
export function configureFlowEditorHost(host:{nodeToolbox?:NodeToolboxEntry[];createWorkspace?:(...args:any[])=>FlowWorkspace;transport?:any;config?:Readable<Record<string,any[]>>;rememberEntity?:(record:any)=>unknown;designations?:{backendTrigger:string;entityBackendTrigger:string;frontendProcess:string}}){
 if(host.nodeToolbox)nodeToolbox=host.nodeToolbox;
 if(host.createWorkspace)factory=host.createWorkspace;
 if(host.transport)transport=host.transport;
 if(host.config){unsubscribe?.();unsubscribe=host.config.subscribe(configStore.set);}
 if(host.rememberEntity)remember=host.rememberEntity;
 if(host.designations){backendTriggerDesignation=host.designations.backendTrigger;entityBackendTriggerDesignation=host.designations.entityBackendTrigger;frontendProcessDesignation=host.designations.frontendProcess;}
 return ()=>{unsubscribe?.();unsubscribe=undefined;};
}
