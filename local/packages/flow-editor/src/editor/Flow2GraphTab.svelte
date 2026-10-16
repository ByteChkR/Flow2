<script>
 import GraphEditor from './GraphEditor.svelte';
 import {onDestroy,tick} from 'svelte';
 import {validationLabels} from './validation-state.js';
 import {visibleGraphs} from './internal-flows.js';
 export let data;export let active;export let editor;export let resource;export let tab;export let document;
 let instance,shownId;
 let validationResults=[],validatedState,lastSaveDiagnostics;
 $: displayedResults=[...validationResults,...(data.persistedResults??[])].filter((item,index,all)=>all.findIndex(other=>other.graphId===item.graphId&&other.path===item.path&&other.message===item.message)===index);
 $: if(data.saveDiagnostics!==lastSaveDiagnostics){lastSaveDiagnostics=data.saveDiagnostics;if(lastSaveDiagnostics?.length){validationResults=lastSaveDiagnostics;validatedState=state;}}
 $: if(active&&data.pendingDiagnostic){const result=data.pendingDiagnostic;actions.diagnosticShown();void showDiagnostic(result);}
 $: if(validatedState&&validatedState.graphs.some(before=>state.graphs.find(after=>after.id===before.id)?.flow!==before.flow)){validationResults=[];validatedState=undefined;}
 function validation(results){validationResults=results;validatedState=state;}
 async function showDiagnostic(result){navigate(result.graphId);await tick();instance?.focusNodes(result.nodeIds);}
 function graphPath(id){const target=state.graphs.find(g=>g.id===id);return target?ancestry(target,state).map(g=>g.name).join(' › '):id;}

 const views=new Map();
 let viewGraph,viewId;
 $: ({state,graph,catalog,workspace,graphNames,invocations,events,chosen,editingBlocked,previewId,previewMinimized,actions}=data);
 $: ({debugContext,invocationLabel,open,editRecord,openCall,endRun,changed,runState}=actions);
 $: viewId=state.graphs.some(g=>g.id===shownId)?shownId:graph.id;
 $: viewGraph=state.graphs.find(g=>g.id===viewId)??graph;
 $: inlineGraphs=state.graphs.filter(g=>g.inlineOwner?.graphId===viewId);
 $: breadcrumbs=ancestry(viewGraph,state);
 function ancestry(current,state){const result=[],seen=new Set();while(current&&!seen.has(current.id)){seen.add(current.id);result.unshift(current);current=state.graphs.find(g=>g.id===(current.inlineOwner?.graphId??current.ownerId));}return result;}
 function navigate(id){if(instance)views.set(viewId,instance.captureView());actions.instance(viewId,undefined);shownId=id;}
 function openNested(detail){const target=state.graphs.find(g=>g.id===detail.graphId);if(target?.inlineOwner)navigate(target.id);else openCall(detail);}
 async function createInline(detail){const id=actions.createInline(viewId,detail);navigate(id);}
 $: if(instance)actions.instance(viewId,instance);
 onDestroy(()=>actions.instance(viewId,undefined));
</script>
<div class="validation-status" data-state={data.statuses?.[viewId]??'unchecked'} title="Freigabe für die Ausführung außerhalb des Editors">{validationLabels[data.checkingValidation?'checking':data.statuses?.[viewId]??'unchecked']}{#if viewGraph.validation?.validatedAt}<small> · Letzte Prüfung: {new Date(viewGraph.validation.validatedAt).toLocaleString()}</small>{/if}</div>
{#key data.generation+viewId}
            {#if invocations.some(item=>item.graphId===graph.id)}<label class="invocation-choice">Ausführung <select aria-label="Subgraph-Aufruf auswählen" value={chosen[graph.id]??invocations.filter(item=>item.graphId===graph.id).at(-1)?.executionId} on:change={event=>actions.choose(graph.id,event.target.value)}>{#each invocations.filter(item=>item.graphId===graph.id) as invocation,index}<option value={invocation.executionId}>{invocationLabel(invocation,index)}</option>{/each}</select></label>{/if}
            {#if graph.ownerId}<nav aria-label="Flow-Pfad"><button on:click={()=>open(graph.ownerId)}>{state.graphs.find(item=>item.id===graph.ownerId)?.name}</button> › {graph.name} · Intern</nav>{/if}
            {#if viewGraph.inlineOwner||viewId!==graph.id}<nav aria-label="Inline-Flow-Pfad">{#each breadcrumbs as crumb,index}{#if index} › {/if}<button disabled={crumb.id===viewId} on:click={()=>navigate(crumb.id)}>{crumb.name}</button>{/each}{#if viewGraph.inlineOwner}<small> · Schnittstelle durch den Graph-Eingang vorgegeben</small>{/if}</nav>{/if}
            <GraphEditor on:diagnostic={event=>showDiagnostic(event.detail)} fullDiagnostics={displayedResults} on:validationresults={event=>validation(event.detail)} onControlSignature={(nodeId,signature)=>actions.changeControlSignature(viewId,nodeId,signature)} workspaceGraphs={state.graphs} onPasteInline={(pasted,copied)=>actions.pasteInline(viewId,pasted,copied)} {inlineGraphs} onInlineCreate={createInline} interfaceLocked={!!viewGraph.inlineOwner} viewState={views.get(viewId)??(viewGraph.inlineOwner?{zoom:.7,offset:{x:20,y:20},selected:[]}:undefined)} commandHost={editor} commandOwner={tab.id} autoForeground={data.autoForeground} fullscreen={data.fullscreen} on:executionoptions={event=>actions.options(event.detail)} previewAvailable={!!previewId} previewVisible={!!previewId&&!previewMinimized} onPreview={actions.preview} onEdit={viewGraph.inlineOwner?undefined:()=>editRecord('graph','edit',viewGraph.id)} inheritedDesignation={viewGraph.ownerId?state.graphs.find(g=>g.id===viewGraph.ownerId)?.flow.designation:undefined} internal={!!viewGraph.ownerId} selectableGraphIds={visibleGraphs(state,viewGraph.id).map(item=>item.id)} layout={viewGraph.layout} on:layoutchange={event=>actions.layout(viewGraph.id,event.detail)} on:cleardebug={()=>actions.clearDebug(viewGraph.id)} externalRun={debugContext(viewGraph.id,invocations,events,chosen)} on:graphtrace={event=>actions.trace(event.detail)} on:graphprogress={event=>actions.progress(event.detail)} bind:this={instance} {workspace} {catalog} {graphNames} bundle={{schemaVersion:1,rootGraphId:viewGraph.id,graphs:state.graphs.map(item=>item.flow)}} on:opengraph={event=>openNested(event.detail)} on:graphresult={event=>actions.result(event.detail)} on:graphend={event=>endRun(event.detail)} flow={viewGraph.flow} graphName={viewGraph.name} embedded {active} locked={editingBlocked} immutable={!!viewGraph.readOnly} on:graphchange={event=>changed(viewGraph.id,event.detail)} on:runstate={event=>runState(viewGraph.id,event.detail)} />
{/key}
<style>.validation-status{padding:6px 16px;border-bottom:1px solid var(--w-border);background:var(--w-panel);color:#92400e}.validation-status[data-state=valid]{color:#047857}.validation-status[data-state=invalid]{color:#b42318}.validation-status small{color:var(--w-muted)}
.invocation-choice{padding:6px 12px;background:var(--w-panel)}nav{padding:4px 12px}button,select{font:inherit;color:inherit;background:var(--w-panel);border:1px solid var(--w-border);border-radius:4px}</style>
