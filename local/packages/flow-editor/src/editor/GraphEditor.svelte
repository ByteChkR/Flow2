<script>
  import ValidationProgressDialog from './ValidationProgressDialog.svelte';
  import {validationProgress} from './validation-progress.js';
  const checkProgress=validationProgress();
  import ThemeControls from '../host/ThemeControls.svelte';
  import {darkModeStore} from "@adam/editor/host.js";
  import GroupDeleteDialog from './GroupDeleteDialog.svelte';
  import {groupDeletion} from './layout.js';
  import MessagePanel from '@adam/editor/diagnostics/MessagePanel.svelte';
  import {flowMessages} from './messages.js';
  import {ContractError} from '@adam-flow/core/flow-core/schema.js';
  $: messageBundle=bundle??{schemaVersion:1,rootGraphId:flow.id,graphs:[flow]};
  $: actionMessages=error?flowMessages(error,messageBundle,catalog.catalog,catalog.types,graphNames):[];
  function navigateMessage(target){if(target.graphId===flow.id)focusNodes(target.nodeIds);else dispatch('diagnostic',target);}

  import RecentEntities from "../host/RecentEntities.svelte";
  import {recentEntities} from "@adam-flow/editor/host.js";
  import {locateDiagnostics} from './validation-results.js';
  import GraphContractComparison from './GraphContractComparison.svelte';
  import ControlSignatureEditor from './ControlSignatureEditor.svelte';
  import GraphInputContract from './GraphInputContract.svelte';
  import {graphInputSignature,assertGraphTarget} from './inline-graphs.js';
  import {validateInterface} from '@adam-flow/core/flow-core/interface.js';
  import {workspacePalette} from './workspace-palette.js';
  import {controlPalette,inferControlSignature} from './control-palette.js';
  import {graphControlSlots} from '@adam-flow/core/flow-core/graph-controls.js';
  import EfTargetSelect from './EfTargetSelect.svelte';
  import EditorCommands from '@adam/editor/EditorCommands.svelte';
 import ContextMenuStyles from './ContextMenuStyles.svelte';
  import RecordEditDialog from './RecordEditDialog.svelte';
  import {configureFlow} from './record-edit.js';
  import {readPreference,writePreference,rememberInputs,restoreInputs} from './editor-preferences.js';
  import {executionBundle} from './execution-bundle.js';
  import '@adam-flow/editor/host.js';
  import {copyNodes,readNodes,pasteNodes,nodeClipboardMime,rememberNodes,rememberedNodes} from './clipboard.js';
  import {flowDesignations} from '@adam-flow/core/flow-core/designations.js';
  $: designationDefinition=flow.designation?flowDesignations.get(flow.designation):undefined;


  import { onMount,onDestroy,createEventDispatcher,tick } from 'svelte';
  import Annotations from './Annotations.svelte';
  import SelectionRectangle from './SelectionRectangle.svelte';
  import {enclosedItems} from './canvas-selection.js';
  import {emptyLayout,assignGroups,transformAnnotation,moveSelection} from './layout.js';
  import InputTypeEditor from './InputTypeEditor.svelte';
  import {inputCatalog} from '@adam-flow/runtime-browser/nodes/input-types.js';
  import {isStep,isTableStep} from '@adam-flow/runtime-browser/nodes/steps.js';
  import InputFieldsInput from './InputFieldsInput.svelte';
  import TableColumnsInput from './TableColumnsInput.svelte';
  import StepNameInput from './StepNameInput.svelte';
  import PageNameInput from './PageNameInput.svelte';
  import PageConfigInput from './PageConfigInput.svelte';
  import {connectedContracts} from './page-config/contracts.js';
  import TextNameInput from './TextNameInput.svelte';
  import CatalogNameInput from './CatalogNameInput.svelte';
  import ValueInput from './ValueInput.svelte';
  import InlineInputs from './InlineInputs.svelte';
  import {typeLabel,displayValue} from './value-model.js';
  import ScalarInput from './ScalarInput.svelte';
  import LogOverlay from './LogOverlay.svelte';
  import StatisticsView from './StatisticsView.svelte';
  import {graphStatistics} from './statistics.js';
  import {summarizePerformance} from './performance.js';
  let executionMode='coordinated';
  function locallyExecutable(flow,bundle,signature,values){
    try{
      const inputs=Object.fromEntries(signature.inputs.filter(p=>Object.hasOwn(values,p.nodeId)).map(p=>[p.name,values[p.nodeId]]));
      const prepared=executionBundle(bundle,flow,inputs);
      return workspace.canRunLocal(prepared?.graphs.find(g=>g.id===flow.id)??flow,prepared);
    }catch{return false;}
  }
  $: localExecutionAvailable=runInputsOpen&&locallyExecutable(flow,bundle,signature,parameterValues);
  $: if(runInputsOpen&&!localExecutionAvailable&&executionMode==='local')executionMode='coordinated';

  let profiling=false,performanceOpen=false,performanceEvents=[],profileBuffer=[],performanceHistory=[],performanceKey='';
  $: performanceNames=Object.fromEntries((bundle?.graphs??[flow]).flatMap(graph=>graph.nodes.map(node=>[`${graph.id}/${node.id}`,`${graphNames[graph.id]??graph.id}: ${definition(node)?.metadata?.label??node.type}`])));
  function closeStatistics(){performanceOpen=false;}
  $: statisticsEnvironment=executionMode==='local'?'browser':(externalRun?.invocation.hybridEnvironment??'server');
  $: staticStatistics=performanceOpen?graphStatistics(flow,bundle,graph=>workspace.inspect(JSON.stringify(graph),executionBundle(bundle,graph,{}),statisticsEnvironment)):undefined;
  $: shownPerformance=externalRun&&!running?externalRun.events.filter(event=>event.profile||event.kind==='profile'):performanceEvents;
  import {appendLog} from './logs.js';
  import NodeDebug from './NodeDebug.svelte';
  import { startDebug,traceDebug,finishDebug,durationLabel } from './debug.js';
  import NodeTree from './NodeTree.svelte';
  import { completeNodePositions,visibleInputPorts,nodeTree,nodeTreeText,graphPoint,zoomAt,connectionPaths,portPosition,bezierPath,orientPorts } from './model.js';
  import { createFlowWorkspace, nodeToolbox } from '@adam-flow/editor/host.js';
  import { isHybridType,inputRequired,flowInterface,graphCatalog,graphNodeDefinition,graphNodeType,sameGraphSignature } from '@adam-flow/core/flow-core/index.js';
  import { removeNode } from '@adam-flow/runtime-browser/runtime-browser/editor.js';
  import ValueBindingEditor from './ValueBindingEditor.svelte';
  import {efCatalog,efDefinition} from '@adam-flow/core/flow-core/ef-nodes.js';
  import {resolveDefinition} from '@adam-flow/core/flow-core/node-resolution.js';
  import {valueNames} from '@adam-flow/core/flow-core/node-names.js';
  import {generalValueOperations,generalValueDefault,generalValueNodeType} from '@adam-flow/core/flow-core/general-value-nodes.js';
  import {valueNodeDefinition,coalesceType,valueNodeType} from '@adam-flow/core/flow-core/value-nodes.js';
  import {queryPalette,queryOperation,queryNodeType} from '@adam-flow/core/flow-core/query-nodes.js';
  import {parseContract} from '@adam-flow/core/flow-core/index.js';
  import ExpressionEditor from './ExpressionEditor.svelte';
  let expressionEditor;
  function openExpression(node,field){try{expressionEditor={nodeId:node.id,title:field.label,scalarResult:['orderBy','thenBy'].includes(queryOperation(node)),predicate:['where','any','all'].includes(queryOperation(node)),graph:parseContract('expression',node.config.expression??field.default)};}catch(cause){error=cause;}}
  $: if(commandHost){
    if(logsOpen)commandHost.overlay({id:commandOwner+'.logs',tabId:commandOwner,component:LogOverlay,props:{entries:logs,running,executionId:logExecutionId},events:{close:()=>logsOpen=false,clear:()=>logs=[]}});
    else commandHost.closeOverlay(commandOwner+'.logs');
  }
  $: if(commandHost){
    if(performanceOpen)commandHost.overlay({id:commandOwner+'.performance',tabId:commandOwner,component:StatisticsView,props:{statistics:staticStatistics,graphName,profiling,events:shownPerformance,running,history:externalRun&&!running?[]:performanceHistory,names:performanceNames},events:{close:closeStatistics}});
    else commandHost.closeOverlay(commandOwner+'.performance');
  }
  export let workspace=createFlowWorkspace();
  export let catalog;
  export let graphName='Flow';
  export let commandHost;export let commandOwner;let actionBar;
  $: tabCommands=[
   {id:'statistics',label:'Statistics',placement:'tab',run:()=>performanceOpen=!performanceOpen},
   {id:'logs',label:`Logs (${logs.length})`,placement:'tab',run:()=>logsOpen=!logsOpen},
   {id:'preview',label:'Vorschau öffnen',placement:'tab',enabled:()=>previewAvailable,run:()=>onPreview?.()},
   {id:'validate',label:'Prüfen',placement:'tab',enabled:()=>!!catalog&&!locked&&!running&&!validating&&!!flow.nodes.length,run:validateFull},
   {id:'clearDebug',label:'Debug zurücksetzen',placement:'tab',visible:()=>!!execution&&!running,enabled:()=>!readOnly,run:clearDebug},
   {id:'run',label:running?'Ausführungsoptionen':'▷ Ausführen',placement:'tab',enabled:()=>!!catalog&&!!flow.nodes.length&&(!locked||running),run:requestRun},
   {id:'abort',label:'Abbrechen',placement:'tab',visible:()=>running,enabled:()=>execution?.state!=='cancelling',run:abortRun},
   {id:'profiling',label:'Profiling',placement:'tab',visible:()=>false,run:()=>profiling=!profiling}
  ];
  $: if(commandHost){profiling;performanceOpen;previewAvailable;locked;running;execution;readOnly;commandHost.registerCommands(commandOwner,tabCommands);}
  export let bundle;
  export let graphNames={};
  export let selectableGraphIds;
  export let internal=false;
  export let autoForeground=true;
  export let fullscreen=false;
  export let previewAvailable=false;
  export let previewVisible=false;
  export let onPreview;
  let runOptionsButton,previewButton;
  export function focusPreview(){if(actionBar)actionBar.focus('preview');else previewButton?.focus();}
  export let onEdit;
  export let inlineGraphs=[];
  export let workspaceGraphs=[];
  export let onPasteInline;
  export let onControlSignature;
  export let interfaceLocked=false;
  export let onInlineCreate;
  export let viewState;
  export let fullDiagnostics=[];
  let validating=false,validationRequest=0;
  export async function focusNodes(ids){
    selected=ids;await tick();if(!canvas)return;
    const nodes=[...canvas.querySelectorAll('[data-selectable-node]')].filter(el=>ids.includes(el.dataset.selectableNode));
    if(!nodes.length)return;
    const bounds=nodes.map(el=>{const p=positions[el.dataset.selectableNode];return {x:p.x,y:p.y,width:el.offsetWidth,height:el.offsetHeight};});
    const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y));
    const width=Math.max(...bounds.map(b=>b.x+b.width))-x,height=Math.max(...bounds.map(b=>b.y+b.height))-y;
    zoom=Math.max(.2,Math.min(zoom,(canvas.clientWidth-80)/width,(canvas.clientHeight-80)/height));
    offset={x:40-x*zoom,y:40-y*zoom};
  }
  $: fullNodeErrors=Object.fromEntries(flow.nodes.map(node=>[node.id,fullDiagnostics.filter(d=>d.graphId===flow.id&&(d.severity??'error')==='error'&&d.nodeIds.includes(node.id)).map(d=>d.message)]));
  async function validateFull(){
    if(validating)return;
    const request=++validationRequest,snapshot=JSON.stringify(bundle??flow);
    validating=true;error='';notice='Graph und Subgraphen werden geprüft …';
    dispatch('validationresults',[]);
    try{
      const inputs=Object.fromEntries(signature.inputs.filter(p=>Object.hasOwn(parameterValues,p.nodeId)).map(p=>[p.name,parameterValues[p.nodeId]]));
      const prepared=executionBundle(bundle,flow,inputs)??{schemaVersion:1,rootGraphId:flow.id,graphs:[structuredClone(flow)]};
      const {local,remote}=await checkProgress.run(async(id,report)=>{
        const startedAt=new Date().toISOString(),graphs=prepared.graphs.map(g=>({id:g.id,name:graphNames[g.id]??g.id,state:'queued'}));
        const local=[];
        for(const graph of prepared.graphs){
          if(disposed)throw new Error('Editor geschlossen.');
          const row=graphs.find(g=>g.id===graph.id);row.state='checking';
          report({startedAt,phase:'Frontend-Prüfung',graphs});
          await new Promise(resolve=>setTimeout(resolve,0));
          const diagnostics=workspace.inspect(JSON.stringify(graph),{...prepared,rootGraphId:graph.id}).diagnostics;
          local.push(...diagnostics.map(d=>({...d,path:`/graphs/${graph.id}${d.path}`})));
          row.state=diagnostics.length?'invalid':'valid';
        }
        report({startedAt,phase:executionMode==='local'?'Prüfung abgeschlossen':'Backend-Prüfung wird vorbereitet',graphs:graphs.map(g=>({...g,state:executionMode==='local'?g.state:'queued'}))});
        const remote=executionMode==='local'?[]:await workspace.validateBundle(prepared,inputs,catalogController.signal,id);
        return {local,remote};
      },graphNames,catalogController.signal);
      if(disposed)return;
      if(request!==validationRequest||snapshot!==JSON.stringify(bundle??flow)){notice='Graph wurde geändert. Bitte erneut prüfen.';return;}
      const results=locateDiagnostics([...local,...remote],prepared,catalog.catalog,catalog.types);
      dispatch('validationresults',results);if(!commandHost)error=results.length?new ContractError(results):'';
      notice=results.length?`${results.length} Meldungen gefunden.`:'Graph und alle bekannten Subgraphen sind gültig.';
    }catch(cause){error=cause;notice='';}
    finally{validating=false;}
  }

  export function captureView(){return {offset:{...offset},zoom,selected:[...selected]};}
  function inlineChild(nodeId,port){return inlineGraphs.find(g=>g.inlineOwner.nodeId===nodeId&&g.inlineOwner.port===port);}
  function ownedReference(id){return inlineGraphs.some(g=>g.inlineOwner.referenceNodeId===id);}
  const inlineInspectionCache=new Map();
  function graphInputIssue(node,port,signature){
    const id=controlGraphId(node,port),target=bundle?.graphs.find(g=>g.id===id);if(!target)return '';
    if(!sameGraphSignature(signature,flowInterface(target,catalog.catalog)))return 'Die Schnittstelle des verbundenen Graphen passt nicht mehr.';
    if(!inlineChild(node.id,port))return '';
    const key=JSON.stringify([target,signature]);
    if(!inlineInspectionCache.has(key)){
      const inspection=workspace.inspect(JSON.stringify(target),executionBundle(bundle,target,{}));
      if(inlineInspectionCache.size>100)inlineInspectionCache.clear();
      inlineInspectionCache.set(key,inspection.diagnostics.map(d=>d.message).join(' · '));
    }
    return inlineInspectionCache.get(key);
  }
  function graphInputs(def){return Object.entries(def.inputs).flatMap(([name,type])=>{while(type.kind==='optional'||type.kind==='nullable')type=type.inner;return type.kind==='graph'?[[name,type.signature]]:[];});}
  let wrapperDialog,wrapperRequest;
  async function confirmGraphChange(message,comparison){
    if(wrapperRequest)return false;
    return new Promise(resolve=>{wrapperRequest={message,comparison,resolve};tick().then(()=>{wrapperDialog.showModal();wrapperDialog.querySelector('[data-cancel]')?.focus();});});
  }
  function answerGraphChange(yes){const request=wrapperRequest;wrapperRequest=undefined;wrapperDialog.close();request?.resolve(yes);}
  async function permitReplace(node,port){return !inlineChild(node.id,port)||await confirmGraphChange('Der bestehende Inline-Graph einschließlich seiner Untergraphen wird ersetzt. Fortfahren?');}
  async function applyControlSignature(node,signature){
    if(readOnly)return false;
    const replacement={...node,graph:{...node.graph,signature}};graphNodeDefinition(replacement);
    if(inlineGraphs.some(g=>g.inlineOwner.nodeId===node.id)&&!await confirmGraphChange('Die Schnittstellen der Inline-Graphen werden angepasst. Nur exakt passende Parameter und Verbindungen bleiben erhalten. Geänderte Parameter müssen neu verbunden werden. Fortfahren?'))return false;
    if(onControlSignature)flow=onControlSignature(node.id,signature);
    else {flow={...flow,nodes:flow.nodes.map(n=>n.id===node.id?replacement:n)};changed();}
    return true;
  }
  async function createInline(node,port,targetId,replaceConfirmed=false){
    if(readOnly||!onInlineCreate)return;
    try{if(!replaceConfirmed&&!await permitReplace(node,port))return;await onInlineCreate({nodeId:node.id,port,targetId});}catch(cause){error=cause;}
  }
  async function removeGraphInput(node,port){
    if(readOnly||!await permitReplace(node,port))return;
    flow={...flow,connections:flow.connections.filter(edge=>!(edge.target.nodeId===node.id&&edge.target.port===port))};changed();
  }
  export let inheritedDesignation;
  $: selectableGraphs=(bundle?.graphs??[]).filter(graph=>!selectableGraphIds||selectableGraphIds.includes(graph.id));
  export let externalRun;
  export let locked=false;
  export let immutable=false;
  export let active=true;
  export let embedded=false;
  const dispatch=createEventDispatcher();
  const catalogController=new AbortController();
  let canvas,controller;
  let loading=true,running=false,error='',notice='',search='',selected=[],pending;
  export let flow={schemaVersion:2,id:'adam-editor',version:1,mode:'interactive',nodes:[],connections:[]};
  export let layout=emptyLayout();
  let comments=structuredClone(layout.comments),groups=structuredClone(layout.groups);
  let positions={...layout.positions},offset=viewState?.offset??{x:0,y:0},zoom=viewState?.zoom??1,gesture;
  $: positions=completeNodePositions(flow,positions);
  $: if(viewState&&loading)selected=viewState.selected??[];
  let disposed=false;
  $: readOnly=running||locked||immutable;
  $: if(!active)cancelGesture();
  $: if(active&&canvas)canvas.focus({preventScroll:true});
  let logs=[],logsOpen=false,logExecutionId;
  let localEdit=false,inputDialog,runInputsOpen=false,runError='';
  $: if(previewVisible&&runInputsOpen)closeRunInputs();
  let toolboxOpen=true,toolboxWidth=260,toolboxObserver;
  let canvasMenu,canvasMenuPosition={x:0,y:0},annotationPoint;
  $: allowedRuntimes=(flow.designation?flowDesignations.get(flow.designation)?.environments:undefined)??(inheritedDesignation?flowDesignations.get(inheritedDesignation)?.environments:undefined)??['server','browser'];
  function runtimeOptions(def){return def.environments.filter(env=>allowedRuntimes.includes(env));}
  function editLocal(draft){if(interfaceLocked)return;flow=configureFlow(flow,draft,catalog.catalog,(bundle?.graphs??[]).map(flow=>({id:flow.id,flow})));graphName=draft.name;positions=completeNodePositions(flow,positions);saveLayout();changed();}
  function toggleToolbox(){toolboxOpen=!toolboxOpen;writePreference('toolbox',{open:toolboxOpen,width:toolboxWidth});}
  function observeToolbox(element){toolboxObserver?.disconnect();toolboxObserver=new ResizeObserver(entries=>{const width=entries[0]?.borderBoxSize?.[0]?.inlineSize;if(width>=190){toolboxWidth=width;writePreference('toolbox',{open:toolboxOpen,width});}});toolboxObserver.observe(element);return {destroy(){toolboxObserver?.disconnect();}};}
  async function openCanvasMenu(event){
    if(readOnly||loading)return;
    if(event.type==='contextmenu'&&event.target.closest('.node,.comment-card,.node-group'))return;
    event.preventDefault();event.stopPropagation();
    const rect=canvas.getBoundingClientRect();const x=event.clientX||rect.left+canvas.clientWidth/2,y=event.clientY||rect.top+canvas.clientHeight/2;
    annotationPoint=graphPoint({x:x-rect.left,y:y-rect.top},offset,zoom);
    canvasMenuPosition={x:Math.max(8,Math.min(x,window.innerWidth-210)),y:Math.max(8,Math.min(y,window.innerHeight-100))};
    await tick();canvasMenu.showPopover();canvasMenu.querySelector('button')?.focus();
  }
  async function requestRun(){runError='';parameterValues=restoreInputs(flow.id,signature.inputs);runInputsOpen=true;await tick();inputDialog.showModal();}
  function closeRunInputs(){inputDialog?.close();runInputsOpen=false;runError='';if(actionBar)actionBar.focus('run');else runOptionsButton?.focus();}

  let selectedFields={};
  function revealField(nodeId,port){if(readOnly||!port)return;selectedFields={...selectedFields,[nodeId]:[...(selectedFields[nodeId]??[]),port]};}
  let validationErrors={};
  let parameterValues={},flowOutputs,controlOutput=false;
  $: effectiveCatalog=catalog?graphCatalog(flow,inputCatalog(flow,catalog.catalog),catalog.types):undefined;
  $: signature=catalog?flowInterface(flow,catalog.catalog):{inputs:[],outputs:[],control:{input:false,output:false}};
  $: parameterNameErrors=Object.fromEntries(validateInterface(signature,new Set()).filter(item=>item.code==='parameter_name').map(item=>[item.path,item.message]));
  let debugNodes={},execution,debugNow=0,debugTimer;
  const executionLabels={starting:'Startet',running:'Läuft',waiting_for_browser:'Übergabe an Browser',completed:'Abgeschlossen',failed:'Fehlgeschlagen',cancelled:'Abgebrochen',cancelling:'Wird abgebrochen'};
  $: skippedCount=Object.values(debugNodes).filter(node=>node.status==='skipped').length;
  $: completedCount=Object.values(debugNodes).filter(node=>node.status==='completed').length;
  $: activeNames=flow.nodes.filter(node=>debugNodes[node.id]?.status==='running').map(node=>definition(node)?.metadata?.label||node.type).join(', ');
  $: displayedRun=externalRun&&!running?invocationView(externalRun):undefined;
  $: if(displayedRun){debugNodes=displayedRun.nodes;logs=displayedRun.entries;debugNow=displayedRun.now;logExecutionId=externalRun.invocation.executionId;execution=displayedRun.execution;flowOutputs=externalRun.invocation.outputs;controlOutput=externalRun.invocation.state==='completed'&&signature.control.output;}
  function invocationView(run){
    const info=run.invocation,now=performance.now();
    let nodes=startDebug(flow,info.skippedNodeIds);
    let entries=[];
    const first=run.events[0]?.timestamp;
    for(const event of run.events){
      nodes=traceDebug(nodes,event,now-(Date.now()-Date.parse(event.timestamp)));
      entries=appendLog(entries,event,flow.nodes.find(node=>node.id===event.nodeId)?.type);
    }
    if(['completed','failed','cancelled'].includes(info.state))nodes=finishDebug(nodes,info.state,now,info.error);
    const terminal=['completed','failed','cancelled'].includes(info.state);
    const elapsed=first?Math.max(0,(terminal?Date.parse(run.events.at(-1).timestamp):Date.now())-Date.parse(first)):0;
    return {nodes,entries,now,execution:{flowId:flow.id,version:flow.version,id:info.executionId,state:info.state,startedAt:now-elapsed}};
  }

  function clearDebug(){if(running||locked)return;performanceEvents=[];profileBuffer=[];performanceHistory=[];performanceKey='';dispatch('cleardebug');debugNodes={};validationErrors={};execution=undefined;flowOutputs=undefined;controlOutput=false;}

  $: availableGraphs=selectableGraphs.filter(graph=>graph.id!==flow.id&&(flow.mode!=='hybrid'||graph.mode==='hybrid'));
  $: palette=[...controlPalette(queryPalette((catalog?.catalog.nodes||[]).filter(node=>!node.control?.start))),...(catalog?workspacePalette(availableGraphs,catalog.catalog,graphNames):[])];
  function downloadNodeTree(){
    const url=URL.createObjectURL(new Blob([nodeTreeText(nodeTree(palette,'',nodeToolbox))],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='flow2-node-tree.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $: tree=nodeTree(palette.filter(node=>(!interfaceLocked||!node.flowPort)&&(flow.mode!=='hybrid'||portable(node))),search,nodeToolbox);
  $: definitions=Object.fromEntries((effectiveCatalog?.nodes||[]).map(node=>[`${node.type}@${node.version}${node.nodeId?'/'+node.nodeId:''}`,node]));
  $: connections=loading||!catalog?[]:connectionPaths(flow,definitions,positions,selectedFields);
  $: preview=connectionPreview(gesture,flow,definitions,positions,selectedFields);
  function connectionPreview(active,draft,defs,layout,fields){
    if(active?.kind!=='connection'||!active.dragging)return '';
    const anchor=portPosition(draft,defs,layout,active.port,fields);
    return active.port.direction==='outputs'?bezierPath(anchor,active.point):bezierPath(active.point,anchor);
  }
  function definition(node){return node.ef?efDefinition(node,catalog.catalog,catalog.types):resolveDefinition(effectiveCatalog??{nodes:[]},node);}
  function changed(){validationRequest++;dispatch('validationresults',[]);clearDebug();error='';notice='';flow={...flow,mode:flow.mode==='hybrid'?'hybrid':flow.nodes.length&&flow.nodes.every(node=>node.environment==='server')?'backend':'interactive'};dispatch('graphchange',flow);}
  function portable(node,extra=[]){return node&&[...Object.values(node.inputs),...Object.values(node.outputs)].every(isHybridType)&&node.environments.includes('server')&&node.environments.includes('browser')&&(!node.graph?.graphId||(bundle?.graphs.find(graph=>graph.id===node.graph.graphId)??extra.find(g=>g.id===node.graph.graphId)?.flow)?.mode==='hybrid');}
  async function load(){
    loading=true;error='';
    try{const value=catalog??await workspace.load(catalogController.signal);if(!disposed){
      catalog=value;
      positions=completeNodePositions(flow,positions);
      if(!readOnly&&!flow.nodes.some(node=>node.type==='Standard.Flow.Start')){
        const start=value.catalog.nodes.find(node=>node.control?.start);
        if(!start)throw new Error('Start-Node fehlt im Katalog.');
        const id=flow.nodes.some(node=>node.id==='start')?`node_${crypto.randomUUID()}`:'start';
        positions={...positions,[id]:{x:70,y:100+Math.ceil(flow.nodes.length/3)*320}};
        flow={...flow,entryNodeId:id,nodes:[{id,type:start.type,typeVersion:start.version,environment:start.environments.includes('server')?'server':start.environments[0],config:{}},...flow.nodes]};
        changed();
      }
    }}
    catch(cause){if(!disposed)error=cause;}
    finally{loading=false;if(!disposed)saveLayout(true);}
  }
  function local(event){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
  export function addGraph(binding,point){
    if(binding.graphId&&selectableGraphIds&&!selectableGraphIds.includes(binding.graphId))throw new Error('Dieser interne Flow gehört zu einem anderen Hauptflow.');
    if(readOnly)return;
    const id=`node_${crypto.randomUUID()}`;
    const node={id,type:graphNodeType(id,binding.operation),typeVersion:1,environment:'server',config:{},graph:binding};
    add(graphNodeDefinition(node),point,id);
    return id;
  }
  function selectReference(node,graphId){
    if(readOnly)return;
    try{
      const target=availableGraphs.find(graph=>graph.id===graphId);if(!target)throw new Error('Graph ist nicht auswählbar.');
      const signature=flowInterface(target,catalog.catalog);
      if(!sameGraphSignature(node.graph.signature,signature)&&flow.connections.some(edge=>edge.source.nodeId===node.id))throw new Error('Die Schnittstelle passt nicht zu den vorhandenen Verbindungen. Bitte zuerst die Referenz trennen.');
      flow={...flow,nodes:flow.nodes.map(item=>item.id===node.id?{...item,graph:{...item.graph,graphId,signature}}:item)};changed();
    }catch(cause){error=cause;}
  }
  function controlGraphId(node,slot){const edge=flow.connections.find(edge=>edge.target.nodeId===node.id&&edge.target.port===slot);return flow.nodes.find(source=>source.id===edge?.source.nodeId)?.graph?.graphId??'';}
  async function chooseControlGraph(node,slot,graphId,sourceId){
    if(readOnly||!graphId)return;
    try{
      const target=selectableGraphs.find(graph=>graph.id===graphId);
      if(!target||target.id===flow.id)throw new Error('Graph ist nicht auswählbar.');
      if(workspaceGraphs.length)assertGraphTarget({graphs:workspaceGraphs,openIds:[],activeId:null},flow.id,target.id);
      if(flow.mode==='hybrid'&&target.mode!=='hybrid')throw new Error('Hybrid-Graphen benötigen hybride Subgraphen.');
      const signature=flowInterface(target,catalog.catalog);
      let next=flow;
      const initial=controlPalette([]).find(def=>def.graph?.operation===node.graph?.operation)?.graph?.signature;
      if(!inlineGraphs.some(g=>g.inlineOwner.nodeId===node.id)&&(!node.graph||initial&&sameGraphSignature(node.graph.signature,initial)||node.graph.operation==='invoke'&&!node.graph.signature.inputs.length&&!node.graph.signature.outputs.length)){try{next=inferControlSignature(flow,node.id,slot,{kind:'graph',signature});}catch{}}
      const expected=graphInputSignature(next,node.id,slot,catalog.catalog,catalog.types);
      if(!sameGraphSignature(expected,signature)){
        if(!onInlineCreate)throw new Error('Die Graph-Schnittstelle passt nicht zum Eingang.');
        if(await confirmGraphChange(inlineChild(node.id,slot)?'Der bestehende Inline-Graph einschließlich seiner Untergraphen wird ersetzt.':'',{expected,actual:signature,graphName:graphNames[graphId]??graphId,port:slot}))await createInline(node,slot,graphId,true);
        return;
      }
      if(!await permitReplace(node,slot))return;
      const id=sourceId??`node_${crypto.randomUUID()}`;
      const reference={id,type:graphNodeType(id,'reference'),typeVersion:1,environment:node.environment,config:{},graph:{operation:'reference',graphId,signature}};
      next={...next,nodes:sourceId?next.nodes:[...next.nodes,reference],connections:next.connections.filter(edge=>!(edge.target.nodeId===node.id&&edge.target.port===slot))};
      next=workspace.connect(next,{nodeId:id,port:'graph'},{nodeId:node.id,port:slot},'data',bundle);
      flow=next;if(!sourceId)positions={...positions,[id]:{x:(positions[node.id]?.x??300)-300,y:(positions[node.id]?.y??0)+Object.keys(positions).length*24}};
      saveLayout(true);changed();
    }catch(cause){error=cause;}
  }
  function switchCases(node,text){
    if(readOnly)return;
    try{
      const cases=JSON.parse(text);
      const replacement={...node,graph:{...node.graph,cases}};
      graphNodeDefinition(replacement);
      flow={...flow,nodes:flow.nodes.map(item=>item.id===node.id?replacement:item)};
      changed();error='';
    }catch(cause){error=cause;}
  }
  function inlineInputs(node,inlineInputs){
    if(readOnly)return;
    flow={...flow,nodes:flow.nodes.map(item=>item.id===node.id?{...item,inlineInputs}:item)};changed();
  }
  function instanceBinding(node,key,value){
    if(readOnly)return;
    flow={...flow,nodes:flow.nodes.map(n=>n.id===node.id?{...n,[key]:value}:n)};changed();
  }
  function valueBinding(node,binding){
    if(readOnly)return;
    try{
      binding=structuredClone(binding);
      if(binding.operation==='getProperty'){
        const fields=binding.type.kind==='object'?binding.type.fields:catalog.types.types.find(item=>item.id===binding.type.name)?.fields;
        if(fields&&!Object.hasOwn(fields,binding.member))binding.member=Object.keys(fields)[0];
        if(binding.type.kind==='entity')binding.result=fields?.[binding.member];else delete binding.result;
      }
      if(binding.operation==='withFields'&&binding.type.kind==='object'&&binding.fields)binding.fields=binding.fields.filter(field=>Object.hasOwn(binding.type.fields,field));
      const replacement={...node,value:binding};valueNodeDefinition(replacement);
      if(flow.mode==='hybrid'&&!portable(valueNodeDefinition(replacement)))throw new Error('Dieser Typ ist nicht in beiden Runtimes verfügbar.');
      flow={...flow,nodes:flow.nodes.map(item=>item.id===node.id?replacement:item)};changed();
    }catch(cause){error=cause;}
  }
  function add(node,point,fixedId){
    if(readOnly||!catalog||node.control?.start)return;
    if(!runtimeOptions(node).length){error='Diese Node unterstützt keine zulässige Runtime.';return;}
    if(flow.mode==='hybrid'&&!portable(node)){error='Hybrid-Graphen erlauben nur Nodes mit beiden Implementierungen und hybride Subgraphen.';return;}
    const id=fixedId??`node_${crypto.randomUUID()}`;
    const center=point||graphPoint({x:canvas.clientWidth/2-120,y:canvas.clientHeight/2-80},offset,zoom);
    if(!point)while(Object.values(positions).some(p=>Math.abs(p.x-center.x)<20&&Math.abs(p.y-center.y)<20)){center.x+=32;center.y+=32;}
    const configuration=Object.fromEntries(Object.entries(node.config||{}).map(([key,field])=>[key,field.default]));
    if(interfaceLocked&&node.flowPort)throw new Error('Die Schnittstelle wird durch den Graph-Eingang vorgegeben.');
    if(node.flowPort){
      let suffix=1;
      const names=flow.nodes.filter(item=>definition(item).flowPort===node.flowPort).map(item=>item.config.name);
      while(names.includes(`${node.flowPort}${suffix}`))suffix++;
      configuration.name=`${node.flowPort}${suffix}`;
    }
    const operation=queryOperation(node);
    const value=node.type===coalesceType?{operation:'coalesce',type:{kind:'string'}}:generalValueOperations.some(op=>node.type===valueNames[op])?generalValueDefault(generalValueOperations.find(op=>node.type===valueNames[op])):undefined;
    const query=operation?{operation,element:structuredClone(node.inputs.query.items),...(operation==='select'?{result:structuredClone(node.inputs.query.items)}:operation==='groupBy'?{result:{kind:'scalar',name:'core.Integer'}}:{})}:undefined;
    positions={...positions,[id]:center};
    flow={...flow,nodes:[...flow.nodes,{id,type:value?(value.operation==='coalesce'?valueNodeType(id):generalValueNodeType(id,value.operation)):query?queryNodeType(id,operation):node.type,typeVersion:node.version,...(node.ui?{ui:structuredClone(node.ui)}:{}),...(node.ef?{ef:structuredClone(node.ef)}:{}),...(query?{query}:{}),...(value?{value}:{}),environment:flow.mode==='hybrid'?'server':runtimeOptions(node).includes('browser')&&!node.graph?'browser':runtimeOptions(node)[0],config:configuration,...(node.graph?{graph:structuredClone(node.graph)}:{})}]};
    selected=[id];clearAnnotations();saveLayout(true);changed();
  }
  function drop(event){
    event.preventDefault();if(readOnly)return;
    const graphId=event.dataTransfer.getData('application/x-adam-flow2-graph');
    if(graphId){dropGraph(graphId,event);return;}
    try{const data=JSON.parse(event.dataTransfer.getData('application/x-adam-flow2-node'));const node=palette.find(node=>node.type===data.type&&node.version===data.version&&node.nodeId===data.nodeId);if(node)add(node,graphPoint(local(event),offset,zoom));}catch{/* Ignore foreign drag payloads. */}
  }
  export function dropGraph(graphId,event){
    if(readOnly)return;
    const hit=document.elementFromPoint(event.clientX,event.clientY);
    if(!hit||!canvas.contains(hit))return;
      try{
        const target=bundle.graphs.find(graph=>graph.id===graphId);
        if(!target)throw new Error('Graph ist nicht mehr im Workspace vorhanden.');
        const targetSignature=flowInterface(target,catalog.catalog);
        const port=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-flow-port][data-direction="inputs"]');
        if(port){
          const receiver=flow.nodes.find(node=>node.id===port.dataset.nodeId);
          let type=definition(receiver).inputs[port.dataset.port];
          while(type?.kind==='optional'||type?.kind==='nullable')type=type.inner;
          if(type?.kind!=='graph')throw new Error('Dieser Eingang erwartet eine andere Graph-Signatur.');
          void chooseControlGraph(receiver,port.dataset.port,graphId);
        }else addGraph({operation:'invoke',signature:targetSignature,graphId},graphPoint(local(event),offset,zoom));
      }catch(cause){error=cause;}
  }
  function currentLayout(){return {...layout,positions,comments,groups};}
  let selectedComments=[],selectedGroups=[];
  function selectionItems(){return {nodes:selected,comments:selectedComments,groups:selectedGroups};}
  function setSelection(value){selected=value.nodes;selectedComments=value.comments;selectedGroups=value.groups;}
  function clearAnnotations(){selectedComments=[];selectedGroups=[];}
  function selectAnnotation(event,kind,id){
    const field=kind==='group'?'groups':'comments',items=selectionItems();
    if(event.ctrlKey||event.metaKey||event.shiftKey){setSelection({...items,[field]:items[field].includes(id)?items[field].filter(key=>key!==id):[...items[field],id]});return false;}
    if(!items[field].includes(id))setSelection({nodes:[],comments:[],groups:[],[field]:[id]});
    return true;
  }
  function applyLayout(value){positions=value.positions;comments=value.comments;groups=value.groups;}
  function saveLayout(reassign=false){if(reassign)applyLayout(assignGroups(currentLayout()));layout=currentLayout();dispatch('layoutchange',layout);}
  function addAnnotation(kind,location){
    if(readOnly)return;
    const point=location?{...location}:graphPoint({x:canvas.clientWidth/2-160,y:canvas.clientHeight/2-100},offset,zoom),id=crypto.randomUUID();
    if(kind==='comment'){if(!location){point.x+=20;point.y+=60;}while(comments.some(item=>Math.abs(item.x-point.x)<20&&Math.abs(item.y-point.y)<20)){point.x+=30;point.y+=30;}comments=[...comments,{id,...point,text:''}];}
    else groups=[...groups,{id,...point,name:'Neue Gruppe',color:'#60a5fa',width:520,height:360,nodeIds:[],commentIds:[]}];
    saveLayout(true);
  }
  function editAnnotation(kind,id,key,value){
    if(readOnly)return;
    if(kind==='group')groups=groups.map(item=>item.id===id?{...item,[key]:value}:item);
    else comments=comments.map(item=>item.id===id?{...item,[key]:value}:item);
    saveLayout();
  }
  let groupDeleteRequest=null;
  function requestGroupDelete(ids,nodes=[],comments=[]){groupDeleteRequest={ids:[...ids],nodes:[...nodes],comments:[...comments],name:ids.length===1?groups.find(g=>g.id===ids[0])?.name??'Gruppe':`${ids.length} Gruppen`};}
  function deleteGroupChoice(contents){
    if(readOnly)throw new Error('Bearbeitung ist gesperrt.');
    const removing=groupDeletion(currentLayout(),groupDeleteRequest.ids,contents);
    if(contents){removing.nodes=[...new Set([...removing.nodes,...groupDeleteRequest.nodes])];removing.comments=[...new Set([...removing.comments,...groupDeleteRequest.comments])];}
    groups=groups.filter(g=>!removing.groups.includes(g.id));
    comments=comments.filter(c=>!removing.comments.includes(c.id));
    for(const id of removing.nodes)remove(id);
    selected=[];clearAnnotations();
    saveLayout(true);
  }
  function deleteAnnotation(kind,id){if(readOnly)return;if(kind==='group'){requestGroupDelete([id]);return;}comments=comments.filter(item=>item.id!==id);saveLayout(true);}
  function annotationStart(event,kind,id){
    if(readOnly||event.button!==0)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus();pending=undefined;
    if(kind==='group'||kind==='comment'){if(!selectAnnotation(event,kind,id))return;gesture={kind:'items',start:{x:event.clientX,y:event.clientY},layout:assignGroups(structuredClone(currentLayout())),items:selectionItems()};return;}
    gesture={kind,id,start:{x:event.clientX,y:event.clientY},layout:structuredClone(currentLayout())};
  }
  function annotationKey(event,kind,id){
    if(readOnly||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const step=event.shiftKey?40:10,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    applyLayout((kind==='group'&&selectedGroups.includes(id)||kind==='comment'&&selectedComments.includes(id))?moveSelection(assignGroups(currentLayout()),selectionItems(),dx,dy):transformAnnotation(currentLayout(),kind,id,dx,dy));
    saveLayout(kind!=='group');
  }
  function moveStart(event,id){
    if(event.button!==0||readOnly)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus();pending=undefined;
    if(event.ctrlKey||event.metaKey||event.shiftKey){selected=selected.includes(id)?selected.filter(item=>item!==id):[...selected,id];return;}
    if(!selected.includes(id)){selected=[id];clearAnnotations();}
    gesture={kind:'items',start:{x:event.clientX,y:event.clientY},layout:assignGroups(structuredClone(currentLayout())),items:selectionItems()};
  }
  function panStart(event){
    if(event.button!==0||event.target.closest('.node,.comment-card,.node-group,button,input,select,textarea,.log-overlay'))return;
    event.preventDefault();canvas.focus();selected=[];clearAnnotations();pending=undefined;
    if(event.shiftKey&&!readOnly){const point=local(event);gesture={kind:'selection',pointerId:event.pointerId,origin:point,point};canvas.setPointerCapture(event.pointerId);return;}
    gesture={kind:'pan',start:{x:event.clientX,y:event.clientY},position:{...offset}};
  }
  function move(event){
    if(!gesture)return;
    if(readOnly&&gesture.kind!=='pan'){gesture=undefined;return;}
    if(gesture.kind==='selection'){if(event.pointerId!==gesture.pointerId)return;gesture={...gesture,point:local(event)};setSelection(enclosedItems(canvas,gesture.origin,gesture.point));return;}
    if(gesture.kind==='connection'){
      if(event.pointerId!==gesture.pointerId)return;
      const dragging=gesture.dragging||Math.hypot(event.clientX-gesture.start.x,event.clientY-gesture.start.y)>4;
      gesture={...gesture,dragging,point:graphPoint(local(event),offset,zoom)};return;
    }
    const dx=event.clientX-gesture.start.x,dy=event.clientY-gesture.start.y;
    if(gesture.kind==='pan')offset={x:gesture.position.x+dx,y:gesture.position.y+dy};
    else if(gesture.kind==='items')applyLayout(moveSelection(gesture.layout,gesture.items,dx/zoom,dy/zoom));
    else if(['group','resize','resizeComment','comment'].includes(gesture.kind))applyLayout(transformAnnotation(gesture.layout,gesture.kind,gesture.id,dx/zoom,dy/zoom));
    else positions={...positions,...Object.fromEntries(Object.entries(gesture.positions).map(([id,point])=>[id,{x:point.x+dx/zoom,y:point.y+dy/zoom}]))};
  }
  function setZoom(next,point={x:canvas.clientWidth/2,y:canvas.clientHeight/2}){
    if(gesture?.kind==='selection')return;
    next=Math.max(.35,Math.min(2,next));offset=zoomAt(point,offset,zoom,next);zoom=next;
  }
  function wheel(event){if(event.target.closest('.comment-preview,input,select,textarea,.log-overlay'))return;event.preventDefault();setZoom(zoom*Math.exp(-event.deltaY*.001),local(event));}
  function remove(id){if(readOnly||definition(flow.nodes.find(node=>node.id===id))?.control?.start||interfaceLocked&&definition(flow.nodes.find(node=>node.id===id))?.flowPort)return;flow=removeNode(flow,id);const next={...positions};delete next[id];positions=next;selected=[];clearAnnotations();pending=undefined;saveLayout(true);changed();}
  function editingText(event){return event.target.closest('input,select,textarea,[contenteditable]:not([contenteditable="false"]),.log-overlay');}
  function key(event){
    if(groupDeleteRequest)return;
    if(!active||editingText(event))return;
    if((event.ctrlKey||event.metaKey)&&!event.altKey){
      const shortcut=event.key.toLowerCase();
      if(shortcut==='c'){
        const text=selectionText();if(!text)return;
        event.preventDefault();event.stopPropagation();rememberNodes(text);notice=`${selected.length} Node(s) kopiert.`;
        // OS clipboard is optional; copying between graphs must also work without browser permissions.
        try{navigator.clipboard?.writeText(text).catch(()=>{});}catch{}
        return;
      }
      if(shortcut==='v'&&rememberedNodes()){
        event.preventDefault();event.stopPropagation();if(!readOnly&&catalog)pasteText(rememberedNodes());return;
      }
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();setSelection({nodes:flow.nodes.filter(node=>!definition(node)?.control?.start).map(node=>node.id),comments:comments.map(c=>c.id),groups:groups.map(g=>g.id)});}
    if(event.key==='Escape'){cancelGesture();selected=[];clearAnnotations();}
    if((event.key==='Delete'||event.key==='Backspace')&&!readOnly&&(selected.length||selectedComments.length||selectedGroups.length)){event.preventDefault();if(selectedGroups.length){requestGroupDelete(selectedGroups,selected,selectedComments);return;}comments=comments.filter(c=>!selectedComments.includes(c.id));for(const id of [...selected])remove(id);selected=[];clearAnnotations();saveLayout(true);}
  }
  function selectionText(){
    const ids=selected.filter(id=>!definition(flow.nodes.find(node=>node.id===id))?.control?.start);
    return ids.length?JSON.stringify(copyNodes(flow,positions,ids,workspaceGraphs)):'';
  }
  function textCopied(event){if(active&&editingText(event))rememberNodes('');}
  function copySelection(event){
    if(!active||editingText(event)||!event.clipboardData)return;
    const text=selectionText();if(!text)return;
    event.clipboardData.setData(nodeClipboardMime,text);event.clipboardData.setData('text/plain',text);event.preventDefault();
    rememberNodes(text);notice=`${selected.length} Node(s) kopiert.`;
  }
  function pasteSelection(event){
    if(!active||readOnly||!catalog||editingText(event)||!event.clipboardData)return;
    const text=event.clipboardData.getData(nodeClipboardMime)||event.clipboardData.getData('text/plain');
    if(pasteText(text))event.preventDefault();
  }
  function pasteText(text){
    try{
      const copied=readNodes(text);
      if(!copied){notice='Die Zwischenablage enthält keine Flow-Nodes.';return false;}
      const point=graphPoint({x:canvas.clientWidth/2-120,y:canvas.clientHeight/2-80},offset,zoom);
      while(Object.values(positions).some(p=>Math.abs(p.x-point.x)<24&&Math.abs(p.y-point.y)<24)){point.x+=32;point.y+=32;}
      const pasted=pasteNodes(flow,positions,copied,point);
      const defs=Object.fromEntries(graphCatalog(pasted.flow,inputCatalog(pasted.flow,catalog.catalog),catalog.types).nodes.map(node=>[`${node.type}@${node.version}${node.nodeId?'/'+node.nodeId:''}`,node]));
      const names={input:new Set(signature.inputs.map(port=>port.name)),output:new Set(signature.outputs.map(port=>port.name))};
      for(const node of pasted.flow.nodes.filter(node=>pasted.ids.includes(node.id))){
        const def=defs[`${node.type}@${node.typeVersion}/${node.id}`]??defs[`${node.type}@${node.typeVersion}`];
        if(!def||def.control?.start)throw new Error('Unbekannte oder nicht kopierbare Node in der Zwischenablage.');
        if(flow.mode==='hybrid'&&!portable(def,copied.inlineGraphs??[]))throw new Error('Hybrid-Graphen erlauben nur Nodes mit beiden Implementierungen und hybride Subgraphen.');
        if(flow.mode==='hybrid')node.environment='server';
        if(interfaceLocked&&def.flowPort)throw new Error('Die Schnittstelle des Inline-Graphen wird durch seinen Eingang vorgegeben.');
        if(def.flowPort){const used=names[def.flowPort],base=String(node.config.name??def.config?.name?.default??def.flowPort);let name=base,suffix=2;while(used.has(name))name=`${base}_${suffix++}`;node.config.name=name;used.add(name);}
      }
      const next=workspace.specialize(pasted.flow);
      if(copied.inlineGraphs?.length){
        if(!onPasteInline)throw new Error('Inline-Graphen benötigen einen Workspace.');
        flow=onPasteInline({...pasted,flow:next},copied);positions=pasted.positions;selected=pasted.ids;clearAnnotations();pending=undefined;saveLayout(true);notice=`${selected.length} Node(s) eingefügt.`;return true;
      }
      flow=next;positions=pasted.positions;selected=pasted.ids;clearAnnotations();pending=undefined;saveLayout(true);changed();notice=`${selected.length} Node(s) eingefügt.`;return true;
    }catch(cause){error=cause;return true;}
  }
  function connectPorts(first,second){
    if(readOnly)return;
    try{
      const {source,target,kind}=orientPorts(first,second);
      const sourceNode=flow.nodes.find(node=>node.id===source.nodeId);
      if(kind!=='control'&&sourceNode?.graph?.operation==='reference'){void chooseControlGraph(flow.nodes.find(n=>n.id===target.nodeId),target.port,sourceNode.graph.graphId,sourceNode.id);return;}
      const next=kind==='control'?flow:inferControlSignature(flow,target.nodeId,target.port,definition(sourceNode).outputs[source.port]);
      flow=workspace.connect(next,source,target,kind,bundle);changed();
    }catch(cause){error=cause;}
  }
  // Click/keyboard selection uses the same orientation rules as a drag in either direction.
  function selectPort(port){
    if(readOnly)return;
    if(!pending){pending=port;error='';notice='';return;}
    const first=pending;pending=undefined;
    if(first.nodeId===port.nodeId&&first.port===port.port&&first.direction===port.direction)return;
    connectPorts(first,port);
  }
  function portStart(event,port){
    if(readOnly||event.button!==0)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus();
    gesture={kind:'connection',pointerId:event.pointerId,port,dragging:false,
      start:{x:event.clientX,y:event.clientY},point:graphPoint(local(event),offset,zoom)};
    error='';notice='';
  }
  function finish(event){
    const active=gesture;
    if(!active)return;
    if(active.kind==='selection'){if(event.pointerId!==active.pointerId)return;setSelection(enclosedItems(canvas,active.origin,local(event)));if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);gesture=undefined;return;}
    if(active.kind!=='connection'){gesture=undefined;if(active.kind!=='pan')saveLayout(active.kind!=='group');return;}
    if(event.pointerId!==active.pointerId)return;
    gesture=undefined;
    if(!active.dragging){selectPort(active.port);return;}
    pending=undefined;
    // Hit-test the actual release location, including when touch implicitly captures the pointer.
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-flow-port]');
    if(!target||!canvas.contains(target))return;
    const port={nodeId:target.dataset.nodeId,port:target.dataset.port,direction:target.dataset.direction,kind:target.dataset.kind};
    if(active.port.nodeId===port.nodeId&&active.port.port===port.port&&active.port.direction===port.direction)return;
    connectPorts(active.port,port);
  }
  function cancelGesture(){if(gesture?.kind==='selection'&&canvas?.hasPointerCapture(gesture.pointerId))canvas.releasePointerCapture(gesture.pointerId);if(gesture&&gesture.kind!=='selection'&&gesture.kind!=='connection'&&gesture.kind!=='pan')saveLayout(gesture.kind!=='group');gesture=undefined;pending=undefined;}
  function config(node,key,event){
    if(readOnly)return;
    const field=definition(node).config[key];
    const value=field.type==='number'?event.target.valueAsNumber:field.type==='boolean'?event.target.checked:event.target.value;
    configValue(node,key,value);
  }
  function configValue(node,key,value){
    if(readOnly)return;
    try{flow=workspace.specialize({...flow,nodes:flow.nodes.map(item=>item.id===node.id?{...item,config:{...item.config,[key]:value}}:item)});changed();error='';return true;}
    catch(cause){error=cause;return false;}
  }
  function environment(node,event){
    if(readOnly||!runtimeOptions(definition(node)).includes(event.target.value))return;
    const old=flow;
    try{
      let next={...flow,nodes:flow.nodes.map(item=>item.id===node.id?{...item,environment:event.target.value}:item),connections:[]};
      for(const edge of old.connections)next=workspace.connect(next,edge.source,edge.target,edge.kind,bundle);
      flow=next;changed();
    }catch(cause){flow=old;event.target.value=node.environment;error=cause;}
  }
  function disconnect(index){if(readOnly)return;flow={...flow,connections:flow.connections.filter((_,i)=>i!==index)};changed();}
  function signatureIssue(node,bundle,catalog){
    if(!node.graph?.graphId||!bundle)return '';
    const target=bundle.graphs.find(graph=>graph.id===node.graph.graphId);
    if(!target)return 'Referenzierter Graph fehlt.';
    return sameGraphSignature(node.graph.signature,flowInterface(target,catalog.catalog))?'':'Die Schnittstelle des Graphen hat sich geändert.';
  }
  function refreshSignature(node){
    if(readOnly)return;
    const target=bundle.graphs.find(graph=>graph.id===node.graph.graphId);
    if(!target)return;
    flow={...flow,nodes:flow.nodes.map(item=>item.id===node.id?{...item,graph:{...item.graph,signature:flowInterface(target,catalog.catalog)}}:item)};
    changed();validate();
  }
  function validate(){
    let inspection;
    try{
      const prepared=executionBundle(bundle,flow,Object.fromEntries(signature.inputs.filter(p=>Object.hasOwn(parameterValues,p.nodeId)).map(p=>[p.name,parameterValues[p.nodeId]])));
      inspection=workspace.inspect(JSON.stringify(prepared?.graphs.find(graph=>graph.id===flow.id)??flow),prepared);
      const nested=[];
      for(const target of prepared?.graphs??[]){
        const metadata=workspaceGraphs.find(g=>g.id===target.id);if(target.id===flow.id||!metadata?.inlineOwner)continue;
        const child=workspace.inspect(JSON.stringify(target),executionBundle(prepared,target,{}));
        let owner=metadata.inlineOwner;const seen=new Set();
        while(owner.graphId!==flow.id&&!seen.has(owner.graphId)){seen.add(owner.graphId);const next=workspaceGraphs.find(g=>g.id===owner.graphId)?.inlineOwner;if(!next)break;owner=next;}
        nested.push(...child.diagnostics.map(d=>({...d,node:owner.graphId===flow.id?owner.nodeId:undefined,path:`/graphs/${target.id}${d.path}`,message:d.message})));
      }
      inspection={...inspection,diagnostics:[...inspection.diagnostics,...nested]};
    }
    catch(cause){error=cause;return false;}
    validationErrors={};
    for(const diagnostic of inspection.diagnostics)for(const id of (diagnostic.node||'').split(' → ')){
      if(flow.nodes.some(node=>node.id===id))validationErrors[id]=[...(validationErrors[id]||[]),diagnostic.message];
    }
    error=inspection.diagnostics.length?new ContractError(inspection.diagnostics):'';notice=error?'':'Flow ist gültig.';return !error;}
  export function abortRun(){
    if(!running)return;
    execution={...execution,state:'cancelling'};controller?.abort();
  }
  function isGuidParameter(type){while(type.kind==='optional'||type.kind==='nullable')type=type.inner;return type.kind==='scalar'&&type.name==='core.Guid';}
  function recentEntitySelected(parameter,record){parameterInput(parameter,record.Id);if(parameter.name==='EntityId'){const name=signature.inputs.find(p=>p.name==='EntityName'&&p.type.kind==='string');if(name)parameterInput(name,record.EntityName);}}
  function parameterInput(parameter,value){
    if(running||locked)return;
    const next={...parameterValues};
    if(value===undefined)delete next[parameter.nodeId];else next[parameter.nodeId]=value;
    parameterValues=next;rememberInputs(flow.id,signature.inputs,next);clearDebug();error='';runError='';notice='';
  }
  async function run(){
    if(running||locked)return;
    if(!validate()){runError=error;return;}
    parameterValues=Object.fromEntries(Object.entries(parameterValues).map(([id,value])=>{const parameter=signature.inputs.find(item=>item.nodeId===id);const target=parameter?.type.kind==='graph'?bundle?.graphs.find(graph=>graph.id===value?.graphId):undefined;return [id,target?{graphId:target.id,revision:target.version}:value];}));
    const inputs=Object.fromEntries(signature.inputs.filter(parameter=>Object.hasOwn(parameterValues,parameter.nodeId)).map(parameter=>[parameter.name,parameterValues[parameter.nodeId]]));
    try{workspace.requireInputs(signature.inputs,inputs);}
    catch(cause){
      runError=cause;error=cause;
      for(const parameter of signature.inputs){
        const messages=(cause.diagnostics||[]).filter(item=>item.path===`/inputs/${parameter.name}`).map(item=>item.message);
        if(messages.length)validationErrors={...validationErrors,[parameter.nodeId]:messages};
      }
      return;
    }
    recentEntities.remember({Id:inputs.EntityId,EntityName:inputs.EntityName});
    rememberInputs(flow.id,signature.inputs,parameterValues);closeRunInputs();
    const runBundle=executionBundle(bundle,flow,inputs);
    const snapshot=runBundle?.graphs.find(graph=>graph.id===flow.id)??structuredClone(flow);
    flowOutputs=undefined;controlOutput=false;logs=[];logsOpen=!profiling;logExecutionId=undefined;
    performanceEvents=[];profileBuffer=[];if(profiling){performanceOpen=true;const key=JSON.stringify([snapshot,runBundle,inputs]);if(key!==performanceKey){performanceHistory=[];performanceKey=key;}}
    running=true;dispatch('runstate',true);cancelGesture();controller=new AbortController();notice='Flow wird ausgeführt …';
    debugNow=performance.now();debugNodes=startDebug(snapshot,workspace.inspect(JSON.stringify(snapshot),runBundle).plan.skippedNodeIds);
    execution={flowId:snapshot.id,version:snapshot.version,state:'starting',startedAt:debugNow,id:undefined};
    debugTimer=setInterval(()=>{debugNow=performance.now();if(profiling)performanceEvents=profileBuffer.slice();},250);
    try{
      const result=await workspace.run(JSON.stringify(snapshot),{
        inputs,profiling,executionMode,...(runBundle?{bundle:runBundle}:{}),signal:controller.signal,
        onTrace:event=>{if(!disposed){if(event.profile||event.kind==='profile')profileBuffer.push(event);dispatch('graphtrace',event);const node=snapshot.nodes.find(node=>node.id===event.nodeId);logs=appendLog(logs,event,event.graphId&&event.graphId!==flow.id?graphNames[event.graphId]:node?definition(node)?.metadata?.label:undefined);if(event.graphId&&event.graphId!==flow.id)return;debugNodes=traceDebug(debugNodes,event,performance.now());if(event.kind==='node'&&event.status==='running'&&!controller.signal.aborted)execution={...execution,state:'running'};}},
        onProgress:state=>{if(!disposed){dispatch('graphprogress',state);logExecutionId=executionMode==='local'?undefined:state.executionId;controlOutput=state.controlOutput;execution={...execution,id:state.executionId,state:controller.signal.aborted?'cancelling':state.state};}}
      });
      if(result.state==='completed')flowOutputs=result.outputs;
      const outcome=result.state==='completed'?'completed':'failed';
      debugNow=performance.now();execution={...execution,state:outcome};
      debugNodes=finishDebug(debugNodes,outcome,debugNow,result.error);
      notice=outcome==='completed'?'Ausführung abgeschlossen.':'';if(result.error)error=result.error;
    }catch(cause){
      const cancelled=controller.signal.aborted;
      debugNow=performance.now();execution={...execution,state:cancelled?'cancelled':'failed'};
      debugNodes=finishDebug(debugNodes,cancelled?'cancelled':'failed',debugNow,cancelled?null:{code:'client',message:String(cause),nodeId:null});
      if(cancelled){notice='Ausführung abgebrochen.';error={code:'cancelled'};}else{notice='';error=cause;}
    }finally{performanceEvents=profileBuffer.slice();if(profiling){const report=summarizePerformance(performanceEvents);if(report.runMs!==null)performanceHistory=[...performanceHistory,{state:execution?.state,durationMs:report.runMs,cacheHits:report.cacheHits,cacheMisses:report.cacheMisses}].slice(-20);}clearInterval(debugTimer);running=false;dispatch('graphresult',{state:execution?.state,error:error||null,messages:error?flowMessages(error,messageBundle,catalog.catalog,catalog.types,graphNames):[],outputs:flowOutputs??{}});dispatch('graphend',execution?.state);dispatch('runstate',false);controller=undefined;}
  }
  onMount(()=>{const prefs=readPreference('toolbox');if(prefs&&typeof prefs==='object'){toolboxOpen=prefs.open!==false;if(Number.isFinite(prefs.width))toolboxWidth=Math.max(190,Math.min(600,prefs.width));}void load();});onDestroy(()=>{disposed=true;wrapperRequest?.resolve(false);commandHost?.unregisterCommands(commandOwner);commandHost?.closeOverlay(commandOwner+'.logs');commandHost?.closeOverlay(commandOwner+'.performance');catalogController.abort();controller?.abort();clearInterval(debugTimer);});
</script>
{#if $checkProgress}<ValidationProgressDialog progress={$checkProgress}/>{/if}
{#if groupDeleteRequest}<GroupDeleteDialog name={groupDeleteRequest.name} description="Beim Auflösen bleiben Nodes, Kommentare und Untergruppen erhalten. Beim Löschen wird der Gruppeninhalt einschließlich Untergruppen entfernt. Geschützte Start- und Schnittstellen-Nodes bleiben erhalten." onChoose={deleteGroupChoice} onClose={()=>groupDeleteRequest=null}/>{/if}
<ContextMenuStyles/>
<svelte:window on:copy={textCopied} on:pointermove={move} on:pointerup={finish} on:pointercancel={cancelGesture} on:blur={cancelGesture} />
<section class="editor" class:dark={$darkModeStore} class:readonly={readOnly} class:embedded aria-label="Flow2 Editor">
  <header class="toolbar"><strong class="graph-title">{graphName}<button class="edit-graph" aria-label="Graph bearbeiten" title="Graph bearbeiten" disabled={!catalog||locked||running||interfaceLocked} on:click={()=>onEdit?onEdit():localEdit=true}>✎</button></strong><span>Editor</span><span class="temporary">{immutable?'Geerbter Flow · schreibgeschützt':interfaceLocked?'Inline-Graph':internal?'Interner Flow':'Workspace-Graph'}</span>{#if flow.designation}<span title={designationDefinition?.description}>{designationDefinition?.name??flow.designation}</span>{/if}<div class="spacer"></div>
    {#if !embedded}<ThemeControls/>{/if}
    {#if commandHost}<EditorCommands bind:this={actionBar} editor={commandHost} commands={tabCommands} context={{}}/>{:else}
    <button aria-expanded={performanceOpen} on:click={()=>performanceOpen=!performanceOpen}>Statistics</button>
    <button aria-expanded={logsOpen} on:click={()=>logsOpen=!logsOpen}>Logs ({logs.length})</button>
    <button bind:this={previewButton} disabled={!previewAvailable} on:click={()=>onPreview?.()}>Vorschau öffnen</button>
    <button on:click={validateFull} disabled={!catalog||locked||running||validating||!flow.nodes.length}>{validating?'Prüft …':'Prüfen'}</button>
    {#if execution&&!running}<button disabled={readOnly} on:click={clearDebug}>Debug zurücksetzen</button>{/if}
    {#if running}<button bind:this={runOptionsButton} on:click={requestRun}>Ausführungsoptionen</button><button on:click={abortRun} disabled={execution?.state==='cancelling'}>Abbrechen</button>{:else}<button class="primary" bind:this={runOptionsButton} on:click={requestRun} disabled={!catalog||!flow.nodes.length}>▷ Ausführen</button>{/if}
    {/if}
  </header>
  {#if execution}
    <div class="execution-bar" data-state={execution.state} role="status" aria-label="Flow-Ausführung">
      <div><strong>{executionLabels[execution.state]||execution.state}</strong><span>Flow {execution.flowId} · v{execution.version}</span><span title={execution.id||''}>{execution.id?`Lauf ${execution.id.slice(0,8)}`:'Lauf wird gestartet …'}</span></div>
      <div><span>{activeNames?`Aktiv: ${activeNames}`:`${completedCount} abgeschlossen${skippedCount?` · ${skippedCount} nicht ausgeführt`:``} / ${flow.nodes.length} Nodes`}</span><span>{durationLabel(debugNow-execution.startedAt)}</span>{#if running}<strong class="readonly-label">Schreibgeschützt</strong>{/if}</div>
    </div>
  {/if}
  <div class="body">
    <button class="toolbox-toggle" aria-expanded={toolboxOpen} aria-label={toolboxOpen?'Node-Bibliothek einklappen':'Node-Bibliothek ausklappen'} on:click={toggleToolbox}>{toolboxOpen?'‹':'›'}</button>
    {#if toolboxOpen}<aside class="toolbox" style={`width:${toolboxWidth}px`} use:observeToolbox aria-label="Node-Bibliothek"><div class="library-heading"><h2>Nodes</h2><span>{catalog?.catalog.nodes.filter(node=>!node.control?.start).length||0}</span></div>
      <button class="tree-download" disabled={loading||!catalog} title="Vollständigen Node-Baum mit Gruppen, technischen Namen und Laufzeiten als Text herunterladen" on:click={downloadNodeTree}>Node-Baum herunterladen</button>
      <input class="search" aria-label="Nodes suchen" type="search" placeholder="Nodes suchen …" bind:value={search} />

      <div class="tree">
        {#if loading}<p class="muted" role="status">Nodes werden geladen …</p>
        {:else if !catalog}<button on:click={load}>Erneut laden</button>
        {:else}{#key search}<NodeTree {tree} expanded={!!search.trim()} disabled={readOnly} on:add={event=>add(event.detail)} />{/key}{#if !tree.children.length&&!tree.nodes.length}<p class="muted">Keine Nodes gefunden.</p>{/if}{/if}
      </div>
      <p class="library-help">Node auf den Graphen ziehen<br />oder zum Hinzufügen anklicken.<br />Gruppen: Node-Kopf hinein- oder herausziehen.<br />Shift+Ziehen auf der Fläche: Rechteckauswahl.<br />Strg/Shift-Klick: Mehrfachauswahl.<br />Strg+C / Strg+V: Kopieren / Einfügen.<br />Strg+A: Nodes, Kommentare und Gruppen auswählen.</p>
    </aside>{/if}
    <div class="graph-area">
      <MessagePanel messages={actionMessages} navigate={navigateMessage} canNavigate={target=>messageBundle.graphs.some(g=>g.id===target.graphId&&target.nodeIds.some(id=>g.nodes.some(n=>n.id===id)))}/>
    <!-- The graph is a composite keyboard surface; its nodes and ports expose native buttons. -->
    <!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
    <div class="canvas" bind:this={canvas} role="application" aria-label="Flow-Graph" tabindex="0" on:contextmenu={openCanvasMenu} on:keydown={event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)openCanvasMenu(event);else key(event);}} on:copy={copySelection} on:paste={pasteSelection} on:pointerdown={panStart} on:wheel|nonpassive={wheel} on:dragover|preventDefault on:drop={drop}
      style={`background-position:${offset.x}px ${offset.y}px;background-size:${24*zoom}px ${24*zoom}px`}>
      {#if !flow.nodes.length}<div class="empty"><div class="empty-icon" aria-hidden="true">＋</div><h2>Dein Flow beginnt hier</h2><p>Ziehe eine Node aus der Liste auf die Fläche.</p></div>{/if}
      {#if gesture?.kind==='selection'}<SelectionRectangle start={gesture.origin} end={gesture.point}/>{/if}
      <div class="world" style={`transform:translate(${offset.x}px,${offset.y}px) scale(${zoom})`}>
        <Annotations {groups} {comments} {selectedComments} {selectedGroups} disabled={readOnly} on:start={e=>annotationStart(e.detail.event,e.detail.kind,e.detail.id)} on:key={e=>annotationKey(e.detail.event,e.detail.kind,e.detail.id)} on:edit={e=>editAnnotation(e.detail.kind,e.detail.id,e.detail.field,e.detail.value)} on:remove={e=>deleteAnnotation(e.detail.kind,e.detail.id)}/>
        <svg class="edges" aria-label="Verbindungen"><g>
          {#each connections as connection,index}{#if !ownedReference(flow.connections[index].source.nodeId)}
            <path class="connection" class:boundary-connection={connection.boundary} class:control-connection={flow.connections[index].kind==='control'} class:active-connection={debugNodes[flow.connections[index].target.nodeId]?.status==='running'} class:completed-connection={debugNodes[flow.connections[index].source.nodeId]?.status==='completed'&&debugNodes[flow.connections[index].target.nodeId]?.status==='completed'} d={connection.path}><title>{connection.boundary?connection.transition:'Verbindung innerhalb einer Laufzeit'}</title></path>
            {#if connection.boundary}<foreignObject x={connection.midpoint.x-84} y={connection.midpoint.y-34} width="168" height="22"><div class="boundary-label" title="Übergabe zwischen Laufzeiten">⇄ {connection.transition}</div></foreignObject>{/if}
            <foreignObject x={connection.midpoint.x-10} y={connection.midpoint.y-10} width="20" height="20"><button class="unlink" disabled={readOnly} title="Verbindung entfernen" aria-label="Verbindung entfernen" on:click={()=>disconnect(index)}>×</button></foreignObject>
          {/if}{/each}
          {#if preview}<path class="connection-preview" d={preview} />{/if}
        </g></svg>
        {#each (loading||!catalog?[]:flow.nodes.filter(n=>!ownedReference(n.id))) as node (node.id)}
          {@const def=definition(node)}
          {@const visiblePorts=visibleInputPorts(node,def,flow.connections,selectedFields[node.id])}
          {@const hiddenPorts=Object.keys(def.inputs).filter(port=>!visiblePorts.includes(port))}
          {@const issue=signatureIssue(node,bundle,catalog)}
          {@const hasError=!!issue||debugNodes[node.id]?.status==='failed'||!!validationErrors[node.id]?.length||!!fullNodeErrors[node.id]?.length}
          <article class="node" data-selectable-node={node.id} data-environment={node.environment} class:has-error={hasError} data-execution-status={debugNodes[node.id]?.status} class:selected={selected.includes(node.id)} style={`left:${positions[node.id]?.x??70}px;top:${positions[node.id]?.y??100}px`} aria-label={def.metadata?.label||node.type}>
            <div class="node-heading"><button class="node-drag" title={`${def.metadata?.label||node.type}${def.metadata?.description?'\n'+def.metadata.description:''}`} aria-disabled={readOnly} on:pointerdown={event=>moveStart(event,node.id)} on:click={event=>{if(event.detail===0){selected=[node.id];clearAnnotations();}}}><span class="node-title">{node.graph?.graphId?(graphNames[node.graph.graphId]||node.graph.graphId):def.metadata?.label||node.type}</span>{#if hasError}<span class="error-badge">! Fehler</span>{/if}</button><button class="remove" title="Node entfernen" aria-label={`${def.metadata?.label||node.type} entfernen`} disabled={readOnly||def.control?.start||interfaceLocked&&!!def.flowPort} on:click={()=>remove(node.id)}>×</button></div>
            <div class="environment"><span>{flow.mode==='hybrid'?'Runtime des Aufrufers':'Ausführung'}</span>{#if flow.mode==='hybrid'}<span>{externalRun?.invocation.hybridEnvironment==='browser'?'Browser':externalRun?.invocation.hybridEnvironment==='server'||running?'Backend':'Beim Aufruf festgelegt'}</span>{:else}<select aria-label={`${def.metadata?.label||node.type}: Ausführung`} aria-invalid={!runtimeOptions(def).includes(node.environment)} disabled={readOnly||(runtimeOptions(def).length===1&&runtimeOptions(def).includes(node.environment))||!runtimeOptions(def).length} value={node.environment} on:change={event=>environment(node,event)}>{#if !runtimeOptions(def).includes(node.environment)}<option value={node.environment} disabled>{node.environment} · nicht zulässig</option>{/if}{#each runtimeOptions(def) as env}<option value={env}>{env==='server'?'Backend':'Browser'}</option>{/each}</select>{/if}</div>

            {#if def.control}
              <div class="control-ports">
                {#each ['inputs','outputs'] as direction}
                  {@const port=direction==='inputs'?'in':'out'}
                  {@const missing=direction==='inputs'&&!flow.connections.some(edge=>edge.kind==='control'&&edge.target.nodeId===node.id)}
                  <div class:output={direction==='outputs'}>
                    {#if def.control[direction==='inputs'?'input':'output']}
                      <button class="port control-port" class:missing class:pending={pending?.nodeId===node.id&&pending?.kind==='control'&&pending?.direction===direction}
                        data-flow-port data-kind="control" data-node-id={node.id} data-port={port} data-direction={direction} disabled={readOnly}
                        aria-label={`${def.metadata?.label||node.type}: Ablauf-${direction==='inputs'?'Eingang':'Ausgang'}`}
                        title={missing?'Ablauf-Eingang nicht verbunden: Diese Node wird nicht ausgeführt.':'Ablaufverbindung: Verzweigungen laufen parallel, zusammengeführte Zweige warten auf alle Vorgänger.'}
                        on:pointerdown={event=>portStart(event,{nodeId:node.id,port,direction,kind:'control'})}
                        on:click={event=>{if(event.detail===0)selectPort({nodeId:node.id,port,direction,kind:'control'});}}>
                        <i></i><span>{missing?'Ablauf fehlt':'Ablauf'}</span>
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
            <div class="ports">{#each ['inputs','outputs'] as direction}<div class:output={direction==='outputs'}>{#each Object.entries(def[direction]).filter(([port])=>direction==='outputs'||visiblePorts.includes(port)) as [port,type]}{@const required=direction==='inputs'&&inputRequired(def,node.config,port)}{@const missing=required&&!node.inlineInputs?.[port]?.enabled&&!flow.connections.some(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port===port)}<button class="port" class:missing class:pending={pending?.nodeId===node.id&&pending?.port===port&&pending?.direction===direction} data-flow-port data-node-id={node.id} data-port={port} data-direction={direction} disabled={readOnly} aria-label={`${def.metadata?.label||node.type}: ${direction==='outputs'?'Ausgang':'Eingang'} ${port}`} title={missing?'Pflichteingang nicht verbunden':required?'Pflichteingang: Zum Verbinden ziehen oder beide Ports anklicken':'Zum Verbinden zu einem anderen Port ziehen oder beide Ports anklicken'} on:pointerdown={event=>portStart(event,{nodeId:node.id,port,direction})} on:click={event=>{if(event.detail===0)selectPort({nodeId:node.id,port,direction});}}><i></i><span title={`${def.metadata?.[direction]?.[port]?.label||port}: ${typeLabel(type)}`}>{def.metadata?.[direction]?.[port]?.label||port}{required?' *':''}<small>{typeLabel(required&&type.kind==='optional'?type.inner:type)}</small></span></button>{/each}</div>{/each}</div>
            {#if hiddenPorts.length}<div class="field-picker"><select aria-label="Entity-Feld hinzufügen" disabled={readOnly} value="" on:change={event=>{revealField(node.id,event.target.value);event.target.value='';}}><option value="" disabled>Feld hinzufügen …</option>{#each hiddenPorts as port}<option value={port}>{def.metadata?.inputs?.[port]?.label||port.replace(/^field_/,'')}</option>{/each}</select></div>{/if}
            <InlineInputs {node} {visiblePorts} definition={def} connections={flow.connections} disabled={readOnly} on:change={event=>inlineInputs(node,event.detail)}/>
            {#if def.config}<div class="config">{#each Object.entries(def.config) as [key,field]}<div class="config-field" class:date-config={field.type==='scalar'&&field.scalar==='core.DateTimeOffset'}><label for={`config-${flow.id}-${node.id}-${key}`}>{field.label||key}</label>{#if key==='parameterType'&&node.type.startsWith('Backend.Template.')}<small>Wird aus dem verbundenen Record übernommen: {typeLabel(def.inputs.parameters??def.inputs.model)}</small>{:else if key==='expression'&&queryOperation(node)}{#if node.query?.operation!=='any'||node.query.predicate}<button id={`config-${flow.id}-${node.id}-${key}`} disabled={readOnly} on:click={()=>openExpression(node,field)}>Ausdruck bearbeiten</button>{/if}{:else if node.type==='Frontend.UI.Input'&&key==='fields'}<InputFieldsInput value={node.config[key]??field.default} type={node.ui.dataType} disabled={readOnly} on:value={event=>configValue(node,key,event.detail)}/>{:else if isTableStep(node.type)&&key==='columns'}<TableColumnsInput value={node.config[key]??field.default} type={node.ui.dataType} disabled={readOnly} on:value={event=>configValue(node,key,event.detail)}/>{:else if (isStep(node.type)||node.type==='Frontend.Navigation.OpenRecord')&&(key==='searchName'||key==='detailsName')}<StepNameInput id={`config-${flow.id}-${node.id}-${key}`} collection={key==='searchName'?'searches':'details'} label={field.label} value={node.config[key]??field.default} disabled={readOnly} on:value={event=>configValue(node,key,event.detail)}/>{:else if node.type==='Frontend.UI.PageConfig'&&key==='page'}<PageConfigInput contracts={connectedContracts(flow,node.id)} value={node.config[key]??field.default} disabled={readOnly} on:value={event=>configValue(node,key,event.detail)}/>{:else if node.type==='Frontend.UI.PageByName'&&key==='name'}<PageNameInput id={`page-${node.id}`} value={node.config[key]??field.default} disabled={readOnly} on:value={event=>configValue(node,key,event.detail)}/>{:else if node.type==='Standard.Text.ByName'&&key==='name'}<TextNameInput id={`config-${flow.id}-${node.id}-${key}`} value={node.config[key]??field.default} disabled={readOnly} on:value={event=>configValue(node,key,event.detail)}/>{:else if node.type==='Standard.Values.Constant.Catalog'&&key==='value'}<CatalogNameInput id={`config-${flow.id}-${node.id}-${key}`} value={node.config[key]??field.default} disabled={readOnly} on:value={event=>configValue(node,key,event.detail)}/>{:else if field.type==='scalar'}<ScalarInput id={`config-${flow.id}-${node.id}-${key}`} scalar={field.scalar} value={node.config[key]??field.default} label={field.label||key} disabled={readOnly} on:value={event=>configValue(node,key,event.detail)} />{:else if field.type==='string'&&field.options}<select id={`config-${flow.id}-${node.id}-${key}`} value={node.config[key]??field.default} disabled={readOnly} on:change={event=>config(node,key,event)}>{#each field.options as option}<option value={option}>{option}</option>{/each}</select>{:else if field.type==='number'}<input type="number" step="any" id={`config-${flow.id}-${node.id}-${key}`} value={node.config[key]??field.default} disabled={readOnly||interfaceLocked&&!!def.flowPort} on:input={event=>config(node,key,event)} />{:else if field.type==='boolean'}<input type="checkbox" id={`config-${flow.id}-${node.id}-${key}`} checked={node.config[key]??field.default} disabled={readOnly} on:change={event=>config(node,key,event)} />{:else}<input id={`config-${flow.id}-${node.id}-${key}`} value={node.config[key]??field.default} disabled={readOnly||interfaceLocked&&!!def.flowPort} on:input={event=>config(node,key,event)} />{/if}</div>{/each}</div>{/if}
            {#if node.ef}<EfTargetSelect binding={node.ef} targets={def.metadata.efTargets??[]} disabled={readOnly} on:change={event=>instanceBinding(node,'ef',event.detail)}/>{/if}
            {#if node.ui}<strong>{isTableStep(node.type)?'Zeilentyp / Datenvertrag':node.type==='Frontend.UI.Input'?'Eingabefelder / Datenvertrag':'Seitendaten'}</strong><InputTypeEditor type={node.ui.dataType} disabled={readOnly} on:type={event=>{if(event.detail.kind==='object')instanceBinding(node,'ui',{dataType:event.detail});else error='Seitendaten müssen ein Record sein.';}}/>{/if}
            {#if node.query?.operation==='any'}<label><input type="checkbox" checked={node.query.predicate??false} disabled={readOnly} on:change={event=>instanceBinding(node,'query',{...node.query,predicate:event.target.checked})}/>Mit Bedingung</label>{/if}
            {#if def.flowPort && parameterNameErrors[`/flow/nodes/${node.id}/config/name`]}<p class="parameter-name-error" role="alert">{parameterNameErrors[`/flow/nodes/${node.id}/config/name`]} Beginne mit A–Z, a–z oder _. Leerzeichen, Umlaute und Sonderzeichen sind nicht erlaubt.</p>{/if}
            {#if node.value}<ValueBindingEditor binding={node.value} disabled={readOnly||interfaceLocked&&!!def.flowPort} on:value={event=>valueBinding(node,event.detail)}/>{/if}
            {#if node.graph?.operation==='reference'}<div class="config"><label>Flow<select aria-label="Referenzierter Flow" disabled={readOnly} value={node.graph.graphId} on:change={event=>{selectReference(node,event.target.value);event.target.value=flow.nodes.find(item=>item.id===node.id).graph.graphId;}}>{#if !availableGraphs.some(graph=>graph.id===node.graph.graphId)}<option value={node.graph.graphId}>Graph nicht verfügbar</option>{/if}{#each availableGraphs as graph}<option value={graph.id}>{graphNames[graph.id]??graph.id}</option>{/each}</select></label></div>{/if}
            {#if node.graph&&graphControlSlots(node.graph).length}<ControlSignatureEditor binding={node.graph} disabled={readOnly} onApply={signature=>applyControlSignature(node,signature)}/>{/if}
            {#each graphInputs(def) as [slot,contract]}
              <GraphInputContract issue={graphInputIssue(node,slot,contract)} name={slot} signature={contract} value={controlGraphId(node,slot)} graphs={availableGraphs} {graphNames} inline={!!inlineChild(node.id,slot)} disabled={readOnly} canCreate={!!onInlineCreate} onSelect={id=>chooseControlGraph(node,slot,id)} onCreate={()=>createInline(node,slot)} onOpen={()=>dispatch('opengraph',{graphId:controlGraphId(node,slot),nodeId:node.id})} onRemove={()=>removeGraphInput(node,slot)}/>
            {/each}
            {#if node.graph?.operation==='switch'}<label>Fälle (JSON-Liste)<input aria-label="Switch-Fälle" disabled={readOnly} value={JSON.stringify(node.graph.cases)} on:change={event=>switchCases(node,event.target.value)}/></label>{/if}
            {#if node.graph?.graphId}<button class="open-graph" on:click={()=>dispatch('opengraph',{graphId:node.graph.graphId,nodeId:node.id,invocationId:execution?.id})}>{node.graph.operation==='reference'?'Referenz':'Aufruf'} · Graph öffnen ↗</button>{/if}
            {#if node.graph&&!['input','output','reference'].includes(node.graph.operation)&&!node.graph.graphId&&execution}<button on:click={()=>dispatch('opengraph',{nodeId:node.id,invocationId:execution.id})}>Subgraph-Lauf öffnen ↗</button>{/if}
            {#if issue}<button disabled={readOnly} on:click={()=>refreshSignature(node)}>Schnittstelle aktualisieren</button>{/if}
            <NodeDebug errors={[...(fullNodeErrors[node.id]||[]),...(validationErrors[node.id]||[]),...(issue?[issue]:[])]} debug={debugNodes[node.id]} environment={node.environment} now={debugNow} />
          </article>
        {/each}
      </div>
      {#if !commandHost&&performanceOpen}<StatisticsView statistics={staticStatistics} {graphName} {profiling} events={shownPerformance} {running} history={externalRun&&!running?[]:performanceHistory} names={performanceNames} on:close={()=>performanceOpen=false} />{/if}
      {#if !commandHost&&logsOpen}<LogOverlay entries={logs} {running} executionId={logExecutionId} on:close={()=>logsOpen=false} on:clear={()=>logs=[]} />{/if}
      <div class="viewport-controls"><button aria-label="Verkleinern" on:click={()=>setZoom(zoom-.1)}>−</button><button title="Ansicht zurücksetzen" on:click={()=>{zoom=1;offset={x:0,y:0};}}>{Math.round(zoom*100)} %</button><button aria-label="Vergrößern" on:click={()=>setZoom(zoom+.1)}>＋</button></div>
      <footer><span class:error={!!error} role="status">{(error?'Details im Meldungsbereich':notice)||(pending?'Gegenüberliegenden Port auswählen. Escape bricht ab.':'Fläche ziehen zum Verschieben · Mausrad zum Zoomen')}</span><span>{flow.nodes.length} Nodes · {flow.connections.length} Verbindungen</span></footer>
    </div>
    </div>
  </div>
  {#if expressionEditor}<ExpressionEditor layout={layout.expressions?.[expressionEditor.nodeId]??emptyLayout()} on:layoutsave={event=>{layout={...currentLayout(),expressions:{...layout.expressions,[expressionEditor.nodeId]:event.detail}};saveLayout();}} graph={expressionEditor.graph} title={expressionEditor.title} predicate={expressionEditor.predicate} scalarResult={expressionEditor.scalarResult} types={catalog.types} on:close={()=>expressionEditor=undefined} on:save={event=>{if(configValue(flow.nodes.find(node=>node.id===expressionEditor.nodeId),'expression',JSON.stringify(event.detail)))expressionEditor=undefined;}}/>{/if}
{#if localEdit}<RecordEditDialog state={{graphs:[{id:flow.id,name:graphName,technicalName:graphName,flow,readOnly:immutable,...(internal?{ownerId:'owner'}:{})}],groups:[]}} request={{kind:'graph',mode:'edit',id:flow.id}} catalog={catalog.catalog} onSave={editLocal} onClose={()=>localEdit=false} blocked={locked||running}/>{/if}
{#if runInputsOpen}<dialog class="run-inputs" aria-label="Flow ausführen" bind:this={inputDialog} on:cancel|preventDefault={closeRunInputs}><form on:submit|preventDefault={run}><h2>Flow ausführen</h2>
 <fieldset class="run-options"><legend>Ausführung und Debugging</legend>
 <label><input type="checkbox" bind:checked={autoForeground} on:change={event=>dispatch('executionoptions',{autoForeground:event.currentTarget.checked,fullscreen})}/> Neue Ansichten automatisch anzeigen</label>
 <label><input type="checkbox" bind:checked={fullscreen} on:change={event=>dispatch('executionoptions',{autoForeground,fullscreen:event.currentTarget.checked})} disabled={running||locked}/> Im Vollbild ausführen</label>
 <label>Ausführung <select bind:value={executionMode} disabled={running||locked}><option value="coordinated">Mit Backend-Koordination</option>{#if localExecutionAvailable}<option value="local">Lokal im Browser</option>{/if}</select></label>
 <label title="Zusätzliche Zeitmessungen für den nächsten Lauf"><input type="checkbox" bind:checked={profiling} disabled={running||locked}/> Profiling</label>
 </fieldset>
 {#if signature.inputs.length}<h3>Eingaben für diesen Lauf</h3>{/if}
 {#each signature.inputs as parameter (parameter.nodeId)}<div class="parameter"><span>{parameter.name} <small>{typeLabel(parameter.type)}</small></span><ValueInput type={parameter.type} value={parameterValues[parameter.nodeId]} disabled={running||locked} label={`Flow-Eingabe ${parameter.name}`} graphs={selectableGraphs} {graphNames} catalog={catalog.catalog} on:value={event=>parameterInput(parameter,event.detail.value)}/>{#if isGuidParameter(parameter.type)}<RecentEntities value={parameterValues[parameter.nodeId]} disabled={running||locked} on:select={event=>recentEntitySelected(parameter,event.detail)}/>{/if}</div>{/each}
 {#if runError}<MessagePanel messages={flowMessages(runError,messageBundle,catalog.catalog,catalog.types,graphNames)} />{/if}<div class="dialog-actions"><button type="button" on:click={closeRunInputs}>Abbrechen</button><button type="submit" disabled={running||locked}>Ausführen</button></div></form></dialog>{/if}
<div class="canvas-menu flow2-context-menu" popover="auto" bind:this={canvasMenu} role="menu" tabindex="-1" on:keydown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...canvasMenu.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}}} aria-label="Canvas-Aktionen" style={`left:${canvasMenuPosition.x}px;top:${canvasMenuPosition.y}px`}><button role="menuitem" disabled={readOnly} on:click={()=>{addAnnotation('comment',annotationPoint);canvasMenu.hidePopover();}}>+ Kommentar</button><button role="menuitem" disabled={readOnly} on:click={()=>{addAnnotation('group',annotationPoint);canvasMenu.hidePopover();}}>+ Gruppe</button></div>
</section>
<dialog class="graph-change-dialog" bind:this={wrapperDialog} aria-label="Graph-Verbindung anpassen" on:cancel|preventDefault={()=>answerGraphChange(false)}>
 <header><h2>{wrapperRequest?.comparison?'Graph-Schnittstelle passt nicht':'Graph-Verbindung anpassen'}</h2></header>
 <div class="graph-change-content">
  {#if wrapperRequest?.comparison}<GraphContractComparison {...wrapperRequest.comparison}/>{/if}
  {#if wrapperRequest?.message}<p class:replacement-warning={!!wrapperRequest.comparison}>{wrapperRequest.message}</p>{/if}
 </div>
 <footer><button data-cancel on:click={()=>answerGraphChange(false)}>Abbrechen</button><button class="confirm" on:click={()=>answerGraphChange(true)}>{wrapperRequest?.comparison?'Ja, Inline-Wrapper erstellen':'Ja'}</button></footer>
</dialog>
<style>
  .tree-download{margin:0 16px 10px;font-size:12px!important}

  .editor.dark{color-scheme:dark;--f-success:#86efac;--f-danger:#fca5a5;--f-warning:#fcd34d}
  /* Defaults cross Svelte component boundaries; specialized controls keep their own layout. */
  .editor :global(:where(input,select,textarea,button)){font:inherit;color:var(--f-text);accent-color:var(--f-brand)}
  .editor :global(:where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),select,textarea)){
    background:var(--f-bg);border:1px solid var(--f-border);border-radius:4px;padding:5px 7px;min-width:0;max-width:100%;
  }
  .editor :global(:where(button:not([role=menuitem]))){background:var(--f-panel);border:1px solid var(--f-border);border-radius:5px;padding:6px 12px;cursor:pointer}
  .editor :global(:where(input,textarea)::placeholder){color:var(--f-muted);opacity:1}
  .editor :global(:where(input,select,textarea,button):focus-visible){outline:2px solid var(--f-brand);outline-offset:2px}
  .editor :global(:where(button):disabled){opacity:.5;cursor:default}

 .graph-change-dialog{width:780px;max-width:calc(100vw - 40px);max-height:85vh;padding:0;border:1px solid var(--w-border,#ddd);border-radius:10px;background:var(--w-panel,#fff);color:inherit;font:inherit;overflow:auto}
 .graph-change-dialog::backdrop{background:#0006}
 .graph-change-dialog header{padding:20px 24px 16px;border-bottom:1px solid var(--w-border,#ddd)}
 .graph-change-dialog h2{margin:0;font-size:19px}
 .graph-change-content{padding:18px 24px}.graph-change-content>p{margin:0;line-height:1.5}
 .graph-change-content>.replacement-warning{margin-top:14px;padding:12px;border-left:3px solid #d99b24;background:#eaa32312}
 .graph-change-dialog footer{position:sticky;bottom:0;display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;padding:14px 24px;background:var(--w-panel,#fff);border-top:1px solid var(--w-border,#ddd)}
 .graph-change-dialog button{font:inherit;padding:8px 12px;border:1px solid var(--w-border,#ccc);border-radius:5px;background:var(--w-panel,#fff);color:inherit;cursor:pointer}
 .graph-change-dialog button.confirm{background:var(--w-accent,#38e6bc);color:#102c25;border-color:transparent}

  .parameter-name-error { color: #b42318; margin: 0; padding: 8px; font-size: 12px; }

 .run-options{display:flex;flex-direction:column;align-items:flex-start;gap:12px;border:1px solid var(--f-border);border-radius:5px;padding:12px;margin:16px 0}.run-options label{display:flex;align-items:center;gap:7px}.run-inputs h2{margin:0;font-size:18px}.run-inputs h3{font-size:14px}

 .graph-title{display:flex;align-items:center;gap:6px}.edit-graph{opacity:0;padding:3px}.graph-title:hover .edit-graph,.graph-title:focus-within .edit-graph{opacity:1}.toolbox{min-width:190px;max-width:min(600px,50vw);resize:horizontal;overflow:auto}.toolbox-toggle{padding:3px;align-self:stretch;border-radius:0;width:20px}.run-inputs{position:fixed;width:520px;max-width:calc(100vw - 32px);max-height:85vh;overflow:auto;background:var(--f-panel);color:var(--f-text);border:1px solid var(--f-border);border-radius:8px;padding:20px}.run-inputs::backdrop{background:#0006}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.run-inputs :global([role=alert]){color:var(--f-danger)}.environment select[aria-invalid=true]{border-color:var(--f-danger)}

  .field-picker{padding:0 10px 10px}.field-picker select{width:100%;min-width:0}

  .edges path.connection.boundary-connection{stroke:#d97706;stroke-width:4;stroke-dasharray:12 4 2 4}.boundary-label{border:1px solid #d97706;border-radius:4px;background:var(--f-panel);color:var(--f-text);font-size:10px;text-align:center;line-height:20px;white-space:nowrap;pointer-events:none}

  .port.missing{color:var(--f-danger)}.port.missing i{border-color:var(--f-danger)}.config select{min-width:0;width:130px}
  .config .date-config{display:flex;flex-direction:column;align-items:stretch;gap:5px;}
  .editor{--f-bg:rgb(var(--color-background,243,244,246));--f-panel:rgb(var(--color-background-400,255,255,255));--f-text:rgb(var(--color-primary,31,41,55));--f-muted:color-mix(in srgb,var(--f-text) 75%,var(--f-panel));--f-success:#15803d;--f-danger:#dc2626;--f-warning:#b45309;color-scheme:light;--f-border:rgb(var(--color-secondary-300,209,213,219));--f-brand:rgb(var(--color-brand,37,99,235));--f-brand-text:rgb(var(--color-brand-accessible,255,255,255));height:100vh;height:100dvh;width:100%;display:flex;flex-direction:column;background:var(--f-bg);color:var(--f-text);font-family:inherit;font-size:13px;line-height:1.4;overflow:hidden}
  .open-graph{width:100%;font-size:11px!important;border-radius:0;border-width:1px 0 0}
  .editor.embedded{height:100%;min-height:0}
  .editor :global(*){box-sizing:border-box}.editor button:not(:where([role=menuitem])),.editor input,.editor select{font:inherit;color:inherit}.toolbar{height:54px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;background:var(--f-panel);border-bottom:1px solid var(--f-border)}.toolbar strong{font-size:17px}.toolbar strong span{font-weight:400;color:var(--f-muted);margin-left:6px}.temporary{font-size:11px;color:var(--f-muted);margin-left:16px}.spacer{flex:1}button:not(:where([role=menuitem])){cursor:pointer;border:1px solid var(--f-border);border-radius:5px;background:var(--f-panel);padding:6px 12px}button:not(:where([role=menuitem])):hover{border-color:var(--f-brand)}button:not(:where([role=menuitem])):disabled{opacity:.5;cursor:default}button:not(:where([role=menuitem])):focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--f-brand);outline-offset:2px}.toolbar .primary{background:var(--f-brand);border-color:var(--f-brand);color:var(--f-brand-text)}.body{display:flex;flex:1;min-height:0}aside{width:260px;flex:none;display:flex;flex-direction:column;border-right:1px solid var(--f-border);background:var(--f-panel)}.library-heading{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 12px}.library-heading h2{font-size:14px;font-weight:600;margin:0}.library-heading>span{font-size:11px;color:var(--f-muted);background:var(--f-bg);padding:2px 7px;border-radius:4px}.search{width:calc(100% - 32px);margin:0 16px 10px;padding:8px 10px;border:1px solid var(--f-border);border-radius:5px;background:var(--f-bg);font-size:12px!important}.tree{flex:1;min-height:0;overflow:auto;padding:0 10px}.library-help{padding:12px 16px;margin:0;font-size:11px;line-height:1.7;color:var(--f-muted);border-top:1px solid var(--f-border)}.muted{color:var(--f-muted);padding:8px;font-size:12px}.graph-area{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:hidden}.canvas{flex:1;min-width:0;min-height:0;isolation:isolate;position:relative;overflow:hidden;background-color:var(--f-bg);background-image:radial-gradient(var(--f-border) 1px,transparent 1px);touch-action:none;outline:none}.world{position:absolute;top:0;left:0;width:0;height:0;transform-origin:0 0}.empty{position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;width:90%;color:var(--f-muted)}.empty-icon{font-size:28px;margin-bottom:12px}.empty h2{font-size:17px;color:var(--f-text);font-weight:500;margin:0 0 8px}.empty p{font-size:13px;margin:0}.node{position:absolute;width:240px;background:var(--f-panel);border:1px solid var(--f-border);border-radius:7px;box-shadow:0 3px 12px #0000000d;overflow:visible}.node.selected{border-color:var(--f-brand);box-shadow:0 0 0 1px var(--f-brand)}.node-heading{height:44px;display:flex;align-items:center;border-bottom:1px solid var(--f-border)}.node-drag{flex:1;text-align:left;font-weight:600!important;border:0;background:transparent;cursor:grab;padding:12px;font-size:13px!important;touch-action:none}.remove{border:0;background:transparent;color:var(--f-muted)!important;font-size:18px!important;padding:4px 10px}.environment{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-size:11px;color:var(--f-muted)}select{background:var(--f-bg);border:1px solid var(--f-border);border-radius:4px;padding:3px 5px;font-size:11px!important}.ports{display:flex;justify-content:space-between;padding-bottom:10px;min-height:38px}.ports>div{width:50%;min-width:0}.port{position:relative;display:flex;align-items:center;gap:7px;border:0;background:transparent;width:100%;height:28px;padding:0 12px;font-size:11px!important;text-align:left}.port{touch-action:none;cursor:crosshair;user-select:none}.ports .port>span{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:12px}.port small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;line-height:10px;color:var(--f-muted)}.port i{position:absolute;left:-5px;width:9px;height:9px;border-radius:50%;border:2px solid var(--f-brand);background:var(--f-panel)}.output .port{justify-content:flex-end;text-align:right}.output .port i{left:auto;right:-5px}.port:hover i,.port.pending i{background:var(--f-brand)}.config{padding:10px 12px 12px;border-top:1px solid var(--f-border)}.config-field{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px}.config input{min-width:0;width:130px;background:var(--f-bg);border:1px solid var(--f-border);border-radius:4px;padding:5px 7px}.edges{position:absolute;top:0;left:0;width:1px;height:1px;overflow:visible;pointer-events:none}.edges path{fill:none;stroke:var(--f-brand);stroke-width:2}.edges .connection-preview{stroke-dasharray:6 4;opacity:.7}.unlink{pointer-events:auto;width:20px;height:20px;padding:0;border-radius:50%;font-size:12px!important;color:var(--f-muted)!important}.viewport-controls{position:absolute;left:18px;bottom:52px;display:flex;box-shadow:0 2px 8px #0000000d}.viewport-controls button:not(:where([role=menuitem])){border-radius:0;font-size:12px;min-width:32px;padding:7px 9px}.viewport-controls button:not(:where([role=menuitem])):first-child{border-radius:5px 0 0 5px}.viewport-controls button:not(:where([role=menuitem])):last-child{border-radius:0 5px 5px 0}footer{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;gap:16px;padding:9px 16px;background:var(--f-panel);border-top:1px solid var(--f-border);color:var(--f-muted);font-size:11px}footer>span:first-child{min-width:0;max-height:90px;overflow:auto}footer>span:last-child{white-space:nowrap}.error{color:var(--f-danger)}@media(max-width:700px){aside{width:190px}.temporary{display:none}.toolbar{padding:0 10px}.library-help{font-size:10px}footer>span:last-child{display:none}}

  .execution-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 16px;border-bottom:1px solid var(--f-border);background:var(--f-panel);font-size:11px}.execution-bar>div{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.execution-bar span{color:var(--f-muted);font-variant-numeric:tabular-nums}.execution-bar strong{color:var(--f-brand)}.execution-bar[data-state=completed] strong{color:var(--f-success)}.execution-bar[data-state=failed] strong{color:var(--f-danger)}.execution-bar[data-state=cancelled] strong{color:var(--f-warning)}.execution-bar .readonly-label{color:var(--f-text);background:var(--f-bg);border:1px solid var(--f-border);border-radius:4px;padding:3px 6px}.readonly .node-drag{cursor:default}.node[data-execution-status=running]{border-color:var(--f-brand);box-shadow:0 0 0 2px var(--f-brand)}.node[data-execution-status=completed]{border-color:var(--f-success)}.node[data-execution-status=failed]{border-color:var(--f-danger);box-shadow:0 0 0 1px var(--f-danger)}.node[data-execution-status=cancelled]{border-color:var(--f-warning)}.edges path.completed-connection{stroke:var(--f-success)}.edges path.active-connection{stroke-width:3;stroke-dasharray:8 5;animation:flow-dash .7s linear infinite}@keyframes flow-dash{to{stroke-dashoffset:-26}}@media(prefers-reduced-motion:reduce){.edges path.active-connection{animation:none}}

  .control-ports{display:flex;height:28px}.control-ports>div{width:50%}.control-port{font-weight:600!important}.control-port i{border-radius:1px;transform:rotate(45deg)}.control-port.missing{color:var(--f-danger)}.control-port.missing i{border-color:var(--f-danger);background:#dc2626}.edges .control-connection{stroke-dasharray:5 4;stroke-width:3}
  .node{--node-accent:var(--f-brand);background:color-mix(in srgb,var(--node-accent) 10%,var(--f-panel))}
  .node[data-environment=server]{--node-accent:#8b5cf6}
  .node-heading{background:color-mix(in srgb,var(--node-accent) 18%,var(--f-panel));border-radius:6px 6px 0 0;box-shadow:inset 0 3px var(--node-accent)}
  .node-drag{display:flex;align-items:center;gap:8px;min-width:0}.node-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .environment>span{font-weight:600;color:var(--f-text)}
  .node.has-error{border-color:var(--f-danger);box-shadow:0 0 0 2px #dc2626,0 4px 16px #dc262626}
  .node.has-error .node-heading{box-shadow:inset 0 3px #dc2626}
  .error-badge{margin-left:auto;flex:none;padding:2px 6px;border-radius:4px;background:#b91c1c;color:white;font-size:10px;font-weight:700}
  .parameter{display:flex;flex-direction:column;gap:5px;margin:10px 0;font-size:12px;overflow-wrap:anywhere}.parameter small{font-size:10px;color:var(--f-muted)}
</style>
