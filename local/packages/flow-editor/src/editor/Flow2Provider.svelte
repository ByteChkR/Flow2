<script>
 import ValidationProgressDialog from './ValidationProgressDialog.svelte';
 import {validationProgress} from './validation-progress.js';
 const saveProgress=validationProgress();
 import {onMount,onDestroy,tick} from 'svelte';
 import ValidationSaveDialog from './ValidationSaveDialog.svelte';
 import {validationStates,validationLabels} from './validation-state.js';
 import {locateDiagnostics} from './validation-results.js';
 import {readableId} from './workspace-api.js';
 import InternalGroupDialog from './InternalGroupDialog.svelte';
 import {internalGroups,internalGroupOf,saveInternalGroup,moveInternalGraph,deleteInternalGroup} from './internal-groups.js';
 import Flow2TreeTools from './Flow2TreeTools.svelte';
 import Flow2GraphTab from './Flow2GraphTab.svelte';
 import GroupDeleteDialog from './GroupDeleteDialog.svelte';
 import RecordEditDialog from './RecordEditDialog.svelte';
 import ExecutionOverlay from '../ui/ExecutionOverlay.svelte';
 import {pasteInlineGraphs} from './clipboard.js';
 import {validateInternalFlows} from './internal-flows.js';
 import {createInlineGraph,inlineAt,removeInlineUnit,pruneInlineGraphs,synchronizeInlineInterfaces} from './inline-graphs.js';
 import {canReferenceGraph,cloneFlowUnit,promoteInternalGraph} from './internal-flows.js';
 import {loadWorkspace,saveWorkspace,fromDocument,workspaceFingerprint,graphFingerprint,groupFingerprint,persistenceError,importWorkspace,exportWorkspaceState} from './workspace-api.js';
 import {saveRecord,deleteRecord} from './record-edit.js';
 import {FlowInteractions} from '@adam-flow/runtime-browser/ui/interactions.js';
 import {activeNodeLabels} from '@adam-flow/runtime-browser/ui/active-nodes.js';
 import {createFlowWorkspace} from '@adam-flow/editor/host.js';
 import {emptyWorkspace,assignGraphGroup,moveWorkspaceGroup,openGraph,updateGraph,resolveWorkspaceModes,updateLayout,setWorkspaceGroupCollapsed,revealGraphGroup} from './graph-workspace.js';
 import {decodeWorkspace,encodeWorkspace} from './workspace-storage.js';
 import {flowDesignations} from '@adam-flow/core/flow-core/designations.js';
 import {backendTriggerDesignation,entityBackendTriggerDesignation,frontendProcessDesignation} from '@adam-flow/editor/host.js';
 export let editor;export let state=emptyWorkspace();
 const id='flow2',scopeId='flow2.workspace',documentId='flow2.workspace';
 const resourceId=key=>`flow2:${key}`;
 const folderResourceId=(owner,id)=>`flow2:folder:${owner}:${id}`;
 const controller=new AbortController(),interactions=new FlowInteractions();
 const workspace=createFlowWorkspace(interactions);
 let catalog,persistenceDocument,storageReady=false,disposed=false,generation=0,lastShared,lastSaved;
 let editors={},invocations=[],events=[],chosen={},runningId=null;
 let previewId=null,previewResult=null,fullscreen=false,previewMinimized=false,autoForeground=true;
 let importFile,pendingImport,importName='';
 let error='',loading=true,designationFilter='';
 let saveDiagnostics=[],diagnosticState,checkingValidation=false,pendingDiagnostic;
 $: statuses=validationStates(state);
 $: persistedResults=catalog?locateSavedDiagnostics(state,statuses):[];
 function locateSavedDiagnostics(current,status){
  const ids=new Map(current.graphs.map(g=>[g.flowId??readableId(current,g),g.id]));
  const diagnostics=current.graphs.filter(g=>status[g.id]==='invalid').flatMap(g=>g.validation?.diagnostics??[]).map(d=>({...d,path:d.path.split('/').map(part=>ids.get(part)??part).join('/')}));
  return locateDiagnostics(diagnostics,{schemaVersion:1,rootGraphId:current.activeId??current.graphs[0]?.id,graphs:current.graphs.map(g=>g.flow)},catalog.catalog,catalog.types);
 }
 $: if(diagnosticState&&diagnosticState.graphs.some(g=>state.graphs.find(x=>x.id===g.id)?.flow!==g.flow)){saveDiagnostics=[];diagnosticState=undefined;}
 $: designations=[...new Set([...flowDesignations.list().map(item=>item.id),...state.graphs.map(graph=>graph.flow.designation).filter(Boolean)])].map(id=>flowDesignations.get(id)??{id,name:`Unbekannt: ${id}`});
 const unsubscribe=editor.subscribe(snapshot=>{const shared=snapshot.documents[documentId];if(shared&&shared.draft!==lastShared){if(lastSaved&&lastSaved!==shared.saved){generation++;editors={};}lastSaved=shared.saved;lastShared=shared.draft;state=shared.draft;}});
 $: if(storageReady&&state!==lastShared){if(editor.edit(documentId,state))lastShared=state;}
 $: editingBlocked=!!runningId||!!$editor.status[scopeId]?.busy||!storageReady;
 $: graphNames=Object.fromEntries(state.graphs.map(graph=>[graph.id,graph.name+(graph.inlineOwner?' · Inline':graph.ownerId?' · Intern':'')]));
 const actions={changeControlSignature,pasteInline,createInline,debugContext,invocationLabel,open,editRecord,openCall,endRun,changed,runState,deleteEntry,promote,internalCopy,
  diagnosticShown:()=>pendingDiagnostic=undefined,
  instance:(id,instance)=>{if(editors[id]!==instance)editors={...editors,[id]:instance};},
  layout:(id,layout)=>{if(!editingBlocked&&!state.graphs.find(g=>g.id===id)?.readOnly)state=updateLayout(state,id,layout);},
  clearDebug:id=>invocations=invocations.filter(i=>i.graphId!==id),
  trace:event=>events=[...events,event],progress:event=>invocations=event.invocations||[],
  result:result=>{previewResult={...result,navigationPath:interactions.finishNavigation(result.state==='completed')};previewMinimized=false;},
  preview:()=>previewMinimized=false,choose:(id,value)=>chosen={...chosen,[id]:value},
  options:options=>{if(autoForeground!==options.autoForeground)autoForeground=options.autoForeground;if(fullscreen!==options.fullscreen)fullscreen=options.fullscreen;}
 };
 $: editor.provider({id,label:'Flows',rootDrop:dropTarget(),panels:[{id:'flow2.designations',placement:'tree',component:Flow2TreeTools,props:{designations,value:designationFilter,onChange:value=>designationFilter=value}}],views:[{id:'edit',component:Flow2GraphTab,keepAlive:true}],commands:[
  {id:'flow2.export',label:'Workspace exportieren',icon:'buttonIcons/download',placement:'resource-header',enabled:()=>!editingBlocked,run:exportWorkspace},
  {id:'flow2.import',label:'Workspace importieren',icon:'buttonIcons/upload',placement:'resource-header',enabled:()=>!editingBlocked,run:()=>importFile.click()},
 ]});
 $: editor.scope({id:scopeId,label:'Flow-Workspace',providerId:id,locked:!!runningId||!storageReady,save:save,reload:reload});
 function command(key,label,run,enabled=()=>!editingBlocked){return {id:key,label,placement:'context',run,enabled};}
 function resourceCommands(kind,item){return [
  command(`${item.id}.edit`,'Bearbeiten',()=>editRecord(kind,'edit',item.id)),
  command(`${item.id}.copy`,'Kopieren',()=>editRecord(kind,'copy',item.id)),
  ...(kind==='group'?[
   command(`${item.id}.group`,'Neue Untergruppe',()=>editRecord('group','create',undefined,item.id),()=>!editingBlocked&&!item.readOnly),
   command(`${item.id}.graph`,'Neuer Graph',()=>editRecord('graph','create',undefined,item.id),()=>!editingBlocked&&!item.readOnly)
  ]:[command(`${item.id}.internalGroup`,'Neue Untergraph-Gruppe',()=>editInternalGroup(item.ownerId??item.id),()=>!editingBlocked&&!item.readOnly),command(`${item.id}.internal`,'Neuer Untergraph',()=>editRecord('graph','create',undefined,undefined,item.ownerId??item.id),()=>!editingBlocked&&!item.readOnly),...(item.ownerId?[command(`${item.id}.promote`,'Global verfügbar machen',()=>promote(item),()=>!editingBlocked&&!item.readOnly)]:[command(`${item.id}.internalCopy`,'Als interne Kopie übernehmen',()=>internalCopy(item),()=>!editingBlocked&&!!currentGraphId()&&currentGraphId()!==item.id&&!state.graphs.find(g=>g.id===currentGraphId())?.readOnly)])]),
  command(`${item.id}.delete`,'Löschen',()=>deleteEntry(kind,item.id),()=>!editingBlocked&&!item.readOnly)
 ];}
 function movedResource(resource,groupId){
  if(editingBlocked||!resource.startsWith('flow2:'))throw new Error('Verschieben ist nicht verfügbar.');
  const key=resource.slice('flow2:'.length),graph=state.graphs.find(g=>g.id===key);
  if(graph){
   if(graph.groupId===groupId)throw new Error('Graph liegt bereits in dieser Gruppe.');
   if(state.graphs.some(g=>g.id!==key&&!g.ownerId&&g.groupId===groupId&&(g.technicalName??g.name)===(graph.technicalName??graph.name)))throw new Error('Graphname ist im Ziel bereits vorhanden.');
   return assignGraphGroup(state,key,groupId);
  }
  const group=state.groups?.find(g=>g.id===key);
  if(!group||group.parentId===groupId)throw new Error('Keine Änderung der Gruppe.');
  return moveWorkspaceGroup(state,key,groupId);
 }
 function dropTarget(groupId){return {canDrop:resource=>{try{movedResource(resource,groupId);return true;}catch{return false;}},drop:resource=>{try{state=movedResource(resource,groupId);if(groupId)state=setWorkspaceGroupCollapsed(state,groupId,false);}catch(cause){error=String(cause);}}};}
 function editInternalGroup(ownerId,parentId,id){
  if(editingBlocked)return;
  const group=internalGroups(state,ownerId).find(g=>g.id===id);
  editor.overlay({id:'flow2.internalGroup',component:InternalGroupDialog,modal:true,props:{name:group?.name??'',onClose:()=>editor.closeOverlay('flow2.internalGroup'),onSave:name=>{state=saveInternalGroup(state,ownerId,name,parentId??group?.parentId,id);}}});
 }
 function internalDrop(ownerId,parentId){
  function moved(resource){
   if(editingBlocked)throw new Error('Editor ist gesperrt.');
   const group=internalGroups(state,ownerId).find(g=>folderResourceId(ownerId,g.id)===resource);
   if(group){if(group.parentId===parentId)throw new Error('Gruppe liegt bereits hier.');return saveInternalGroup(state,ownerId,group.name,parentId,group.id);}
   const graph=state.graphs.find(g=>resourceId(g.id)===resource);
   if(!graph||internalGroupOf(state,graph)===parentId&&graph.ownerId===ownerId)throw new Error('Keine Änderung.');
   return moveInternalGraph(state,ownerId,graph.id,parentId);
  }
  return {canDrop:resource=>{try{moved(resource);return true;}catch{return false;}},drop:resource=>{try{state=moved(resource);}catch(cause){error=String(cause);}}};
 }
 function registerResources(){
  const saved=editor.snapshot().documents[documentId]?.saved;
  const matches=graph=>{const root=graph.ownerId?state.graphs.find(g=>g.id===graph.ownerId):graph;return !designationFilter||(designationFilter==='__none'?!root?.flow.designation:root?.flow.designation===designationFilter);};
  const visibleGroups=new Set();for(const graph of state.graphs.filter(matches)){let parent=graph.groupId;while(parent&&!visibleGroups.has(parent)){visibleGroups.add(parent);parent=state.groups?.find(g=>g.id===parent)?.parentId;}}
  const graphDirty=g=>!g.readOnly&&graphFingerprint(g)!==graphFingerprint(saved?.graphs?.find(old=>old.id===g.id));
  const groups=(state.groups??[]).map(group=>({id:resourceId(group.id),providerId:id,documentId,name:group.displayName||group.name,hidden:!!designationFilter&&!visibleGroups.has(group.id),dirty:!group.readOnly&&groupFingerprint(group)!==groupFingerprint(saved?.groups?.find(g=>g.id===group.id)),...(group.parentId?{parentId:resourceId(group.parentId)}:{}),expandable:true,defaultExpanded:!group.collapsed,readOnly:group.readOnly,description:group.originName,movable:!editingBlocked&&!group.readOnly,dropTarget:dropTarget(group.id),commands:resourceCommands('group',group),onToggle:expanded=>state=setWorkspaceGroupCollapsed(state,group.id,!expanded)}));
  const folders=state.graphs.filter(root=>!root.ownerId).flatMap(root=>internalGroups(state,root.id).map(group=>({id:folderResourceId(root.id,group.id),providerId:id,documentId,name:group.name,parentId:group.parentId?folderResourceId(root.id,group.parentId):resourceId(root.id),hidden:!matches(root),readOnly:root.readOnly,expandable:true,defaultExpanded:true,movable:!editingBlocked&&!root.readOnly,dropTarget:internalDrop(root.id,group.id),commands:[
   command(`${root.id}.${group.id}.graph`,'Neuer Untergraph',()=>editRecord('graph','create',undefined,undefined,root.id,group.id),()=>!editingBlocked&&!root.readOnly),
   command(`${root.id}.${group.id}.group`,'Neue Untergruppe',()=>editInternalGroup(root.id,group.id),()=>!editingBlocked&&!root.readOnly),
   command(`${root.id}.${group.id}.rename`,'Umbenennen',()=>editInternalGroup(root.id,undefined,group.id),()=>!editingBlocked&&!root.readOnly),
   command(`${root.id}.${group.id}.delete`,'Löschen',()=>groupDelete(group.name,contents=>{if(editingBlocked)throw new Error('Bearbeitung ist gesperrt.');state=deleteInternalGroup(state,root.id,group.id,contents);}),()=>!editingBlocked&&!root.readOnly)
  ]})));
  const graphs=state.graphs.map(graph=>({id:resourceId(graph.id),providerId:id,name:graph.name,hidden:!!graph.inlineOwner||!matches(graph),documentId,view:'edit',...(graph.ownerId||graph.groupId?{parentId:graph.ownerId&&internalGroupOf(state,graph)?folderResourceId(graph.ownerId,internalGroupOf(state,graph)):resourceId(graph.ownerId??graph.groupId)}:{}),readOnly:graph.readOnly,description:[graph.originName,validationLabels[statuses[graph.id]]].filter(Boolean).join(' · '),dirty:graphDirty(graph),expandable:state.graphs.some(g=>g.ownerId===graph.id&&!g.inlineOwner)||internalGroups(state,graph.id).length>0,defaultExpanded:!graph.internalsCollapsed,
   ...(graph.flow.designation?{badge:{text:flowDesignations.get(graph.flow.designation)?.name??graph.flow.designation,color:[backendTriggerDesignation,entityBackendTriggerDesignation].includes(graph.flow.designation)?'color-mix(in srgb,#8b5cf6 18%,var(--w-panel))':graph.flow.designation===frontendProcessDesignation?'color-mix(in srgb,var(--w-brand) 18%,var(--w-panel))':undefined}}:graph.ownerId?{badge:{text:'Intern'}}:{}),
   movable:!editingBlocked&&!graph.readOnly&&!graph.inlineOwner,...(!graph.ownerId?{dropTarget:internalDrop(graph.id)}:{}),dragData:!editingBlocked&&currentGraphId()&&currentGraphId()!==graph.id&&canReferenceGraph(state,currentGraphId(),graph.id)?{'application/x-adam-flow2-graph':graph.id}:undefined,commands:resourceCommands('graph',graph),onOpen:()=>activateGraph(graph.id),onToggle:expanded=>state={...state,graphs:state.graphs.map(g=>g.id===graph.id?{...g,internalsCollapsed:!expanded}:g)},
   props:{data:{state,graph,catalog,workspace,graphNames,invocations,events,chosen,editingBlocked,previewId,previewMinimized,autoForeground,fullscreen,actions,generation,statuses,saveDiagnostics,checkingValidation,pendingDiagnostic,persistedResults}}
  }));
  editor.resources(id,[...groups,...folders,...graphs,
   {id:'flow2.createGraph',providerId:id,documentId,name:'+ Neuer Graph',onOpen:()=>editRecord('graph','create')},
   {id:'flow2.createGroup',providerId:id,name:'+ Neue Gruppe',onOpen:()=>editRecord('group','create')}
  ]);
 }
 // Explicit dependencies keep provider publication separate from store notifications.
 $: if(catalog){state;designationFilter;graphNames;invocations;events;chosen;editingBlocked;previewId;previewMinimized;autoForeground;fullscreen;generation;statuses;saveDiagnostics;checkingValidation;pendingDiagnostic;persistedResults;registerResources();}
 function activateGraph(graphId){state=revealGraphGroup(openGraph(state,graphId),graphId);}
 async function open(graphId){await tick();editor.open(resourceId(graphId));}
 async function reload(){let doc;try{doc=await loadWorkspace(controller.signal,workspace.validationCapabilities());}catch(cause){throw new Error(persistenceError(cause));}if(disposed)throw new Error('Editor geschlossen.');persistenceDocument=doc;const loaded=fromDocument(doc,state);invocations=[];events=[];chosen={};return [{id:documentId,draft:loaded}];}
 async function save(documents){
  // Keep exactly the reviewed snapshot throughout validation and a possible draft override.
  const draft=structuredClone(documents.find(d=>d.id===documentId)?.draft??state);
  const capabilities=workspace.validationCapabilities();let doc;
  const persist=options=>saveProgress.run(id=>saveWorkspace(draft,persistenceDocument,controller.signal,options,id),{},controller.signal);
  checkingValidation=true;
  try{
   try{doc=await persist(capabilities);}
   catch(cause){
    const response=cause?.response?.data;
    if(response?.code!=='validation_failed'||!Array.isArray(response.diagnostics))throw cause;
    const ids=new Map(draft.graphs.map(g=>[readableId(draft,g),g.id]));
    const diagnostics=response.diagnostics.map(d=>({...d,path:d.path.split('/').map(part=>ids.get(part)??part).join('/')}));
    saveDiagnostics=locateDiagnostics(diagnostics,{schemaVersion:1,rootGraphId:draft.activeId??draft.graphs[0]?.id,graphs:draft.graphs.map(g=>g.flow)},catalog.catalog,catalog.types);
    diagnosticState=state;checkingValidation=false;
    const decision=await new Promise(resolve=>{
     const finish=value=>{resolve(value);editor.closeOverlay('flow2.validationSave');};
     editor.overlay({id:'flow2.validationSave',component:ValidationSaveDialog,modal:true,props:{results:saveDiagnostics,graphNames,onClose:()=>finish(false),onDraft:()=>finish(true),onShow:result=>{finish(false);void showSaveDiagnostic(result);}}});
    });
    if(!decision)throw new Error('Nicht gespeichert. Validierungsfehler werden im Graphen angezeigt.');
    if(disposed)throw new Error('Editor geschlossen.');
    checkingValidation=true;
    doc=await persist({...capabilities,allowInvalid:true});
   }
   if(disposed)throw new Error('Editor geschlossen.');persistenceDocument=doc;
   return [{id:documentId,draft:fromDocument(doc,draft)}];
  }catch(cause){throw new Error(persistenceError(cause));}finally{checkingValidation=false;}
 }
 async function showSaveDiagnostic(result){const target=state.graphs.find(g=>g.id===result.graphId);await open(target?.inlineOwner?target.ownerId:result.graphId);pendingDiagnostic=result;}

 async function load(){loading=true;error='';try{const loaded=await workspace.load(controller.signal);const document=await loadWorkspace(controller.signal,workspace.validationCapabilities());if(disposed)return;catalog=loaded;persistenceDocument=document;state=fromDocument(document,state);editor.document(documentId,scopeId,state,{fingerprint:workspaceFingerprint});lastShared=editor.snapshot().documents[documentId].draft;state=lastShared;storageReady=true;await tick();registerResources();if(!editor.hasPreferences()){const ids=[...state.openIds],active=state.activeId;for(const graphId of ids)editor.open(resourceId(graphId));if(active)editor.open(resourceId(active));}editor.preferencesReady();const requested=new URLSearchParams(window.location.search).get('flowDefinitionId');const graph=requested&&state.graphs.find(g=>g.databaseId===requested);if(graph)await open(graph.id);}catch(cause){if(!disposed)error=persistenceError(cause);}finally{loading=false;}}
 function editRecord(kind,mode,recordId,parentId,ownerId,internalGroupId){if(editingBlocked)return;const request={kind,mode,id:recordId,parentId,ownerId};editor.overlay({id:'flow2.record',component:RecordEditDialog,modal:true,props:{state,request,catalog:catalog.catalog,blocked:editingBlocked,onOpenGraph:id=>{editor.closeOverlay('flow2.record');void open(id);},onSave:draft=>{state=saveRecord(state,request,draft,catalog.catalog);if(internalGroupId&&ownerId)state=moveInternalGraph(state,ownerId,state.activeId,internalGroupId);generation++;if(kind==='graph'&&state.activeId)void open(state.activeId);},onClose:()=>editor.closeOverlay('flow2.record')}});}
 function groupDelete(name,onChoose){editor.overlay({id:'flow2.delete-group',component:GroupDeleteDialog,modal:true,props:{name,onChoose,onClose:()=>editor.closeOverlay('flow2.delete-group')}});}
 function deleteEntry(kind,recordId){if(editingBlocked)return;if(kind==='group'){groupDelete(state.groups?.find(g=>g.id===recordId)?.name??'Gruppe',contents=>{if(editingBlocked)throw new Error('Bearbeitung ist gesperrt.');state=deleteRecord(state,{kind,id:recordId,mode:'edit'},contents);});return;}state=deleteRecord(state,{kind,id:recordId,mode:'edit'});}
 function currentGraphId(){return editor.activeContext().resource?.providerId===id?state.activeId:null;}
 function changed(graphId,flow){if(!editingBlocked&&!state.graphs.find(g=>g.id===graphId)?.readOnly)state=resolveWorkspaceModes(synchronizeInlineInterfaces(pruneInlineGraphs(updateGraph(state,graphId,flow),catalog.catalog,catalog.types),graphId,catalog.catalog,catalog.types));}
 function changeControlSignature(graphId,nodeId,signature){
  if(editingBlocked)throw new Error('Der Editor ist gesperrt.');
  const parent=state.graphs.find(g=>g.id===graphId);
  const next=updateGraph(state,graphId,{...parent.flow,nodes:parent.flow.nodes.map(node=>node.id===nodeId?{...node,graph:{...node.graph,signature}}:node)});
  state=synchronizeInlineInterfaces(next,graphId,catalog.catalog,catalog.types);return state.graphs.find(g=>g.id===graphId).flow;
 }
 function pasteInline(graphId,pasted,copied){
  if(editingBlocked)throw new Error('Der Editor ist gesperrt.');
  const next=resolveWorkspaceModes(pasteInlineGraphs(state,graphId,pasted,copied));validateInternalFlows(next);state=next;return state.graphs.find(g=>g.id===graphId).flow;
 }
 function createInline(graphId,{nodeId,port,targetId}){
  if(editingBlocked)throw new Error('Der Editor ist gesperrt.');
  let next=state;const existing=inlineAt(next,graphId,nodeId,port);
  if(existing){
   const parent=next.graphs.find(g=>g.id===graphId),ref=existing.inlineOwner.referenceNodeId;
   next=removeInlineUnit(next,existing.id);
   next=updateGraph(next,graphId,{...parent.flow,nodes:parent.flow.nodes.filter(n=>n.id!==ref),connections:parent.flow.connections.filter(e=>e.source.nodeId!==ref&&e.target.nodeId!==ref)});
  }
  next=createInlineGraph(next,graphId,nodeId,port,catalog.catalog,catalog.types,targetId);
  state=resolveWorkspaceModes(next);return inlineAt(state,graphId,nodeId,port).id;
 }
 function runState(graphId,running){runningId=running?graphId:null;if(running){previewId=graphId;previewResult=null;previewMinimized=false;invocations=[];events=[];chosen={};}else interactions.cancelAll();}
 function closePreview(){previewId=null;previewResult=null;editor.closeOverlay('flow2.preview');}
 $: if(previewId)editor.overlay({id:'flow2.preview',component:ExecutionOverlay,modal:!previewMinimized,props:{onMinimize:()=>editors[runningId??previewId??state.activeId]?.focusPreview(),onState:value=>{if(previewMinimized!==value.minimized)previewMinimized=value.minimized;if(autoForeground!==value.autoForeground)autoForeground=value.autoForeground;},result:previewResult,close:closePreview,interactions,fullscreen,minimized:previewMinimized,autoForeground,graphName:graphNames[previewId]??previewId,activeNodes:activeNodeLabels(events,state.graphs,catalog?.catalog),abort:()=>editors[runningId]?.abortRun()}});
 function openCall(detail){const invocation=invocations.find(i=>i.parentInvocationId===detail.invocationId&&i.callNodeId===detail.nodeId);const graphId=invocation?.graphId??detail.graphId;if(!graphId){error='Dieser Aufruf hat noch keinen Subgraphen gestartet.';return;}if(invocation)chosen={...chosen,[graphId]:invocation.executionId};void open(graphId);}
 function endRun(outcome){invocations=invocations.map(item=>['completed','failed'].includes(item.state)?item:{...item,state:outcome==='cancelled'?'cancelled':'failed'});}
 function invocationLabel(invocation,index){const path=[];let item=invocation;while(item){path.unshift(graphNames[item.graphId]||item.graphId);item=invocations.find(parent=>parent.executionId===item.parentInvocationId);}return `${invocation.parentInvocationId?`Aufruf ${index+1}`:'Direkter Lauf'} · ${path.join(' → ')} · ${invocation.hybridEnvironment?(invocation.hybridEnvironment==='server'?'Backend':'Browser')+' · ':''}${invocation.callKey?invocation.callKey+' · ':''}${invocation.executionId.slice(0,8)} · ${invocation.state}`;}
 function debugContext(graphId,items,traces,selection){const choices=items.filter(i=>i.graphId===graphId),invocation=choices.find(i=>i.executionId===selection[graphId])??choices.at(-1);return invocation?.parentInvocationId?{invocation,events:traces.filter(e=>e.invocationId===invocation.executionId)}:undefined;}
 function internalCopy(graph){const active=state.graphs.find(g=>g.id===state.activeId);state=cloneFlowUnit(state,graph,active.ownerId??active.id);if(state.activeId)void open(state.activeId);}
 function promote(graph){state=promoteInternalGraph(state,graph.id);}
 function exportWorkspace(){const url=URL.createObjectURL(new Blob([encodeWorkspace(exportWorkspaceState(state))],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='flow2-workspace.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function readImport(event){const file=event.target.files?.[0];event.target.value='';if(!file||editingBlocked)return;try{if(file.size>20*1024*1024)throw new Error('Die Datei darf höchstens 20 MB groß sein.');pendingImport=decodeWorkspace(await file.text());importName=file.name;}catch(cause){error=`Import fehlgeschlagen: ${String(cause)}`;}}
 function applyImport(){if(!pendingImport||editingBlocked)return;state=importWorkspace(state,pendingImport);generation++;editors={};invocations=[];events=[];chosen={};closePreview();pendingImport=null;if(state.activeId)void open(state.activeId);}
 onMount(()=>void load());onDestroy(()=>{disposed=true;unsubscribe();controller.abort();interactions.dispose();});
</script>
{#if $saveProgress}<ValidationProgressDialog progress={$saveProgress}/>{/if}
<input type="file" accept=".json,application/json" aria-label="Workspace-Datei importieren" bind:this={importFile} on:change={readImport} hidden/>
{#if loading}<p role="status">Workspace wird geladen …</p>{/if}
{#if error}<p role="alert">{error} <button on:click={load}>Erneut laden</button></p>{/if}
{#if pendingImport}<section aria-label="Workspace-Import prüfen"><strong>{importName}</strong><p>{pendingImport.graphs.length} Graphen · {pendingImport.groups?.length??0} Gruppen. Der Import fügt lokale Kopien in einer neuen Gruppe hinzu. Erst Speichern übernimmt sie in die Datenbank.</p><button disabled={editingBlocked} on:click={applyImport}>Als Kopien hinzufügen</button><button on:click={()=>pendingImport=null}>Abbrechen</button></section>{/if}
<style>.drag-preview{position:fixed;z-index:9999;pointer-events:none;background:var(--w-panel);border:1px solid var(--w-brand);padding:8px;border-radius:5px}p[role=alert]{color:#b91c1c;margin:0;padding:8px 14px}section{padding:12px;border-top:1px solid var(--w-border);background:var(--w-panel)}button{font:inherit;color:inherit;background:var(--w-panel);border:1px solid var(--w-border);border-radius:5px;padding:6px 9px}</style>
