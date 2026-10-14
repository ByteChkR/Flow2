import {writable, get} from 'svelte/store';
import type {ComponentType} from 'svelte';

export type EditorContext = {resource?: EditorResource; tab?: EditorTab};
export interface EditorCommand {
 id:string; label:string; icon?:string; placement:'workspace'|'resource-header'|'tab'|'context';
 visible?:(context:EditorContext)=>boolean; enabled?:(context:EditorContext)=>boolean;
 run:(context:EditorContext)=>void|Promise<void>;
}
export interface EditorResource {
 id:string; providerId:string; name:string; entryCount?:number; parentId?:string; documentId?:string; documentIds?:string[]; scopeId?:string;
 dragData?:Record<string,string>; movable?:boolean; dropTarget?:EditorDropTarget;
 icon?:string; badge?:{text:string;color?:string}; description?:string; readOnly?:boolean;
 expandable?:boolean; defaultExpanded?:boolean; hidden?:boolean; dirty?:boolean;
 status?:'loading'|'ready'|'error';error?:string;
 view?:string; props?:Record<string,unknown>; commands?:EditorCommand[];
 onOpen?:()=>void; onSelect?:()=>void; onToggle?:(expanded:boolean)=>void;
}
export interface EditorTab {id:string; resourceId:string; view:string; title?:string; pinned:boolean}
export interface EditorView {id:string; component:ComponentType; props?:Record<string,unknown>; keepAlive?:boolean}
export interface EditorPanel {id:string;placement:'tree'|'tab';component:ComponentType;props?:Record<string,unknown>}
export interface EditorDropTarget {canDrop:(resourceId:string)=>boolean;drop:(resourceId:string)=>void}
export interface EditorProvider {rootDrop?:EditorDropTarget;id:string; label:string; views:EditorView[]; commands?:EditorCommand[];panels?:EditorPanel[]}
export interface EditorDocument {
 id:string; scopeId:string; draft:unknown; saved:unknown; revision:number; readOnly:boolean;
 fingerprint:(value:unknown)=>string;
}
export interface SaveScope {
 id:string; label:string; providerId:string; readOnly?:boolean; locked?:boolean;
 save:(documents:ReadonlyArray<{id:string;draft:unknown}>)=>Promise<ReadonlyArray<{id:string;draft:unknown}>|void>;
 reload:()=>Promise<ReadonlyArray<{id:string;draft:unknown}>>;
}
export interface ScopeStatus {busy:'save'|'reload'|null;error:string|null}
export interface EditorOverlay {id:string;component:ComponentType;tabId?:string;events?:Record<string,(detail:unknown)=>void>;props?:Record<string,unknown>;modal?:boolean}
export interface EditorSnapshot {
 providers:EditorProvider[];resources:EditorResource[];selectedId:string|null;tabs:EditorTab[];activeId:string|null;
 documents:Record<string,EditorDocument>;scopes:SaveScope[];status:Record<string,ScopeStatus>;
 expanded:Record<string,boolean>;overlays:EditorOverlay[];error:string|null;
}
export type DirtyDecision='save'|'discard'|'cancel';
export interface EditorPreferences {version:1;tabs:EditorTab[];activeId:string|null;expanded:Record<string,boolean>}
const clone=(value:unknown)=>structuredClone(value);
// Documents are replaced on every edit/save; unrelated UI updates reuse the cached result.
const dirtyCache=new WeakMap<EditorDocument,boolean>();
export function documentDirty(doc:EditorDocument){if(!dirtyCache.has(doc))dirtyCache.set(doc,doc.draft!==doc.saved&&doc.fingerprint(doc.draft)!==doc.fingerprint(doc.saved));return dirtyCache.get(doc)!;}
export function createEditorStore(options:{identityKey:string;storage?:Pick<Storage,'getItem'|'setItem'>;confirm?:(message:string)=>Promise<DirtyDecision>} ) {
 const initial:EditorSnapshot={providers:[],resources:[],selectedId:null,tabs:[],activeId:null,documents:{},scopes:[],status:{},expanded:{},overlays:[],error:null};
 const store=writable(initial);let pending:EditorPreferences|undefined;let destroyed=false;
 const preferenceKey=`adam.editor.v1.${encodeURIComponent(options.identityKey)}`;
 try{const parsed=JSON.parse(options.storage?.getItem(preferenceKey)??'null');if(parsed?.version===1&&Array.isArray(parsed.tabs)&&parsed.expanded&&typeof parsed.expanded==='object')pending=parsed;}catch{/* Unavailable/corrupt personal preferences don't affect documents. */}
 const hadPreferences=!!pending;let restoreOrder=pending?.tabs.map(tab=>tab.id)??[];
 const orderRestored=(tabs:EditorTab[])=>[...tabs].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(restoreOrder.includes(a.id)?restoreOrder.indexOf(a.id):Infinity)-(restoreOrder.includes(b.id)?restoreOrder.indexOf(b.id):Infinity));
 const commandSets=new Map<string,EditorCommand[]>();
 const snapshot=()=>get(store);
 const update=(fn:(state:EditorSnapshot)=>EditorSnapshot)=>{if(!destroyed)store.update(fn);};
 function persist(){const s=snapshot();try{options.storage?.setItem(preferenceKey,JSON.stringify({version:1,tabs:orderRestored([...s.tabs,...(pending?.tabs??[]).filter(t=>!s.tabs.some(open=>open.id===t.id))]),activeId:s.activeId??pending?.activeId??null,expanded:s.expanded}));}catch{/* Storage may be disabled. */}}
 function resource(id:string){return snapshot().resources.find(item=>item.id===id);}
 function scopeDirty(id:string){return Object.values(snapshot().documents).some(doc=>doc.scopeId===id&&documentDirty(doc));}
 function writableScope(id:string){const s=snapshot(),scope=s.scopes.find(item=>item.id===id);return !!scope&&!scope.readOnly&&!scope.locked&&!s.status[id]?.busy;}
 function canReload(id:string){const s=snapshot(),scope=s.scopes.find(item=>item.id===id);return !!scope&&!scope.locked&&!s.status[id]?.busy;}
 function activeContext():EditorContext {const s=snapshot(),tab=s.tabs.find(item=>item.id===s.activeId);const r=tab&&resource(tab.resourceId);return {...(tab?{tab}:{}),...(r?{resource:r}:{})};}
 function restore(){if(!pending)return;const s=snapshot();const tabs=pending.tabs.filter(t=>typeof t.id==='string'&&typeof t.view==='string'&&s.resources.some(r=>r.id===t.resourceId&&s.providers.find(p=>p.id===r.providerId)?.views.some(v=>v.id===t.view)));const ids=new Set(s.tabs.map(t=>t.id));update(s=>({...s,tabs:orderRestored([...s.tabs,...tabs.filter(t=>!ids.has(t.id))]),activeId:tabs.some(t=>t.id===pending?.activeId)?pending!.activeId:s.activeId,expanded:{...pending!.expanded,...s.expanded}}));pending={...pending,tabs:pending.tabs.filter(t=>!tabs.some(open=>open.id===t.id)),activeId:tabs.some(t=>t.id===pending?.activeId)?null:pending.activeId};}
 function provider(value:EditorProvider){update(s=>({...s,providers:[...s.providers.filter(p=>p.id!==value.id),value]}));restore();}
 function resources(providerId:string,values:EditorResource[]){
  if(values.some(r=>r.providerId!==providerId)||new Set(values.map(r=>r.id)).size!==values.length)throw new Error('Ungültige Ressourcenregistrierung.');
  update(s=>{const other=s.resources.filter(r=>r.providerId!==providerId);if(values.some(r=>other.some(o=>o.id===r.id)))throw new Error('Ressourcen-ID ist bereits registriert.');const all=[...other,...values];const tabs=s.tabs.filter(t=>all.some(r=>r.id===t.resourceId));return {...s,resources:all,tabs,activeId:tabs.some(t=>t.id===s.activeId)?s.activeId:tabs.at(-1)?.id??null};});restore();
 }
 function open(resourceId:string,view?:string,title?:string){const r=resource(resourceId);if(!r)return;if(!view&&!r.view){r.onOpen?.();return;}const v=view??r.view??'edit';if(!snapshot().providers.find(p=>p.id===r.providerId)?.views.some(item=>item.id===v)){r.onOpen?.();return;}
  if(pending)pending.activeId=null;const id=JSON.stringify([resourceId,v]);update(s=>({...s,tabs:s.tabs.some(t=>t.id===id)?s.tabs:[...s.tabs,{id,resourceId,view:v,pinned:false,...(title?{title}:{})}],activeId:id}));r.onOpen?.();persist();return id;
 }
 function activate(id:string){if(pending)pending.activeId=null;if(!snapshot().tabs.some(t=>t.id===id))return;update(s=>({...s,activeId:id}));const tab=snapshot().tabs.find(t=>t.id===id)!;resource(tab.resourceId)?.onOpen?.();persist();}
 function pin(id:string){update(s=>{const tabs=s.tabs.map(t=>t.id===id?{...t,pinned:!t.pinned}:t);return {...s,tabs:[...tabs.filter(t=>t.pinned),...tabs.filter(t=>!t.pinned)]};});restoreOrder=snapshot().tabs.map(t=>t.id);persist();}
 function reorder(ids:string[]){const tabs=snapshot().tabs;if(ids.length!==tabs.length||new Set(ids).size!==tabs.length||ids.some(id=>!tabs.some(t=>t.id===id)))return;const next=ids.map(id=>tabs.find(t=>t.id===id)!);update(s=>({...s,tabs:[...next.filter(t=>t.pinned),...next.filter(t=>!t.pinned)]}));restoreOrder=snapshot().tabs.map(t=>t.id);persist();}
 function toggle(id:string,expanded:boolean){update(s=>({...s,expanded:{...s.expanded,[id]:expanded}}));resource(id)?.onToggle?.(expanded);persist();}
 function scope(value:SaveScope){update(s=>({...s,scopes:[...s.scopes.filter(x=>x.id!==value.id),value],status:{...s.status,[value.id]:s.status[value.id]??{busy:null,error:null}}}));}
 function document(id:string,scopeId:string,draft:unknown,config:{readOnly?:boolean;fingerprint?:(value:unknown)=>string}={}){if(snapshot().documents[id])return;update(s=>({...s,documents:{...s.documents,[id]:{id,scopeId,draft:clone(draft),saved:clone(draft),revision:0,readOnly:config.readOnly??false,fingerprint:config.fingerprint??JSON.stringify}}}));}
 function edit(id:string,draft:unknown){const doc=snapshot().documents[id];if(!doc||doc.readOnly||!writableScope(doc.scopeId))return false;update(s=>({...s,documents:{...s.documents,[id]:{...doc,draft,revision:doc.revision+1}}}));return true;}
 // Providers can report canonical server state after their initial asynchronous load.
 function replace(id:string,draft:unknown){replaceMany([{id,draft}]);}
 function registerDocuments(scopeId:string,values:ReadonlyArray<{id:string}>){update(s=>{const documents={...s.documents};for(const {id} of values)if(!documents[id])documents[id]={id,scopeId,draft:null,saved:null,revision:0,readOnly:false,fingerprint:JSON.stringify};return {...s,documents};});}
 function replaceMany(values:ReadonlyArray<{id:string;draft:unknown}>){update(s=>{const documents={...s.documents};for(const {id,draft} of values){const doc=documents[id];if(doc)documents[id]={...doc,draft:clone(draft),saved:clone(draft),revision:doc.revision+1};}return {...s,documents};});}

 async function save(scopeId:string){const s=snapshot(),unit=s.scopes.find(x=>x.id===scopeId);if(!unit||!writableScope(scopeId))return false;
  const docs=Object.values(s.documents).filter(d=>d.scopeId===scopeId);update(s=>({...s,status:{...s.status,[scopeId]:{busy:'save',error:null}}}));
  try{const result=await unit.save(docs.map(d=>({id:d.id,draft:clone(d.draft)})));update(s=>{const documents={...s.documents};for(const before of docs){const current=documents[before.id];if(!current)continue;const saved=result?.find(d=>d.id===before.id)?.draft??before.draft;documents[before.id]={...current,saved:clone(saved),draft:current.revision===before.revision?clone(saved):current.draft};}return {...s,documents};});return true;
  }catch(error){update(s=>({...s,status:{...s.status,[scopeId]:{busy:'save',error:String(error)}}}));return false;
  }finally{update(s=>({...s,status:{...s.status,[scopeId]:{busy:null,error:s.status[scopeId]?.error??null}}}));}
 }
 async function saveAll(){const result=[];for(const unit of snapshot().scopes.filter(u=>scopeDirty(u.id))){const success=await save(unit.id);result.push({scopeId:unit.id,label:unit.label,success,error:success?null:snapshot().status[unit.id]?.error??'Speicherbereich ist gesperrt oder beschäftigt.'});}return result;}
 async function decide(message:string){return options.confirm?options.confirm(message):'cancel' as const;}
 async function reload(scopeId:string){const unit=snapshot().scopes.find(u=>u.id===scopeId);if(!unit||!canReload(scopeId))return false;if(scopeDirty(scopeId)){const decision=await decide(`Änderungen in „${unit.label}“ vor dem Neuladen speichern?`);if(decision==='cancel'||decision==='save'&&!await save(scopeId))return false;}
  update(s=>({...s,status:{...s.status,[scopeId]:{busy:'reload',error:null}}}));try{const values=await unit.reload();replaceMany(values);return true;}catch(error){update(s=>({...s,status:{...s.status,[scopeId]:{busy:'reload',error:String(error)}}}));return false;}finally{update(s=>({...s,status:{...s.status,[scopeId]:{busy:null,error:s.status[scopeId]?.error??null}}}));}
 }
 async function close(ids:string[]){
  const s=snapshot(),remaining=s.tabs.filter(t=>!ids.includes(t.id));
  const documentIds=(tab:EditorTab)=>{const r=resource(tab.resourceId);return r?.documentIds??(r?.documentId?[r.documentId]:[]);};
  const retainedDocuments=new Set(remaining.flatMap(documentIds));
  const closingDocuments=new Set(s.tabs.filter(t=>ids.includes(t.id)).flatMap(documentIds).filter(id=>!retainedDocuments.has(id)));
  const scopeIds=[...new Set([...closingDocuments].map(id=>s.documents[id]).filter((doc):doc is EditorDocument=>!!doc&&documentDirty(doc)).map(doc=>doc.scopeId))];
  const decisions=new Map<string,DirtyDecision>();
  for(const id of scopeIds){
   const unit=s.scopes.find(u=>u.id===id)!;
   if(!writableScope(id)){update(s=>({...s,error:`„${unit.label}“ ist zurzeit gesperrt. Der Tab bleibt geöffnet.`}));return false;}
   const answer=await decide(`Ungespeicherte Änderungen: Speichern betrifft den Speicherbereich „${unit.label}“. Verwerfen betrifft die zu schließenden Dokumente.`);
   if(answer==='cancel')return false;decisions.set(id,answer);
  }
  for(const [id,answer] of decisions)if(answer==='save'&&!await save(id))return false;
  update(s=>{
   let documents=s.documents;for(const id of closingDocuments){const doc=documents[id];if(doc&&decisions.get(doc.scopeId)==='discard'&&documentDirty(doc)){if(documents===s.documents)documents={...documents};documents[id]={...doc,draft:clone(doc.saved),revision:doc.revision+1};}}
   const tabs=s.tabs.filter(t=>!ids.includes(t.id));return {...s,documents,tabs,activeId:tabs.some(t=>t.id===s.activeId)?s.activeId:tabs.at(-1)?.id??null};
  });persist();return true;
 }
 async function prepareLeave(){
  const dirty=snapshot().scopes.filter(scope=>scopeDirty(scope.id));if(!dirty.length)return true;
  const answer=await decide(`Editor verlassen: Änderungen in ${dirty.map(scope=>'„'+scope.label+'“').join(', ')} speichern?`);
  if(answer==='cancel')return false;
  if(answer==='save'){const result=await saveAll();return result.every(item=>item.success);}
  return true;
 }
 function overlay(value:EditorOverlay){update(s=>({...s,overlays:[...s.overlays.filter(o=>o.id!==value.id),value]}));}
 function closeOverlay(id:string){if(!snapshot().overlays.some(o=>o.id===id))return;update(s=>({...s,overlays:s.overlays.filter(o=>o.id!==id)}));}
 async function execute(command:EditorCommand,context=activeContext()){if(command.visible?.(context)===false||command.enabled?.(context)===false)return;try{await command.run(context);}catch(error){update(s=>({...s,error:String(error)}));}}
 function readPreference(key:string):unknown{try{return JSON.parse(options.storage?.getItem(`${preferenceKey}.${key}`)??'null');}catch{return null;}}
 function writePreference(key:string,value:unknown){try{options.storage?.setItem(`${preferenceKey}.${key}`,JSON.stringify(value));}catch{/* Personal layout remains usable when browser storage is unavailable. */}}
 return {readPreference,writePreference,select:(id:string)=>update(s=>({...s,selectedId:id})),clearError:()=>update(s=>({...s,error:null})),subscribe:store.subscribe,snapshot,provider,resources,scope,document,registerDocuments,edit,replace,replaceMany,resource,activeContext,open,activate,pin,reorder,toggle,close,save,saveAll,reload,prepareLeave,scopeDirty,writableScope,canReload,overlay,closeOverlay,execute,
  registerCommands:(owner:string,commands:EditorCommand[])=>{commandSets.set(owner,commands);},
  commandsFor:(owner:string)=>commandSets.get(owner)??[],
  unregisterCommands:(owner:string)=>{commandSets.delete(owner);},
  hasChanges:()=>Object.values(snapshot().documents).some(documentDirty),
  destroy:()=>{destroyed=true;},
  hasPreferences:()=>hadPreferences,
  preferencesReady:()=>{restore();persist();},
 };
}
export type EditorStore=ReturnType<typeof createEditorStore>;
