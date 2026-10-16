<script>
 import {workspaceBottomConsole,openBottomTab,closeBottomTab,closeBottomWindow} from './workspace-bottom-console.js';
 import StatisticsView from './StatisticsView.svelte';
 import LogOverlay from './LogOverlay.svelte';
 import WorkspaceDiagnosticsPanel from './WorkspaceDiagnosticsPanel.svelte';
 let panelElement;
 let height=320,resizing=false,startY=0,startHeight=0;
 $: state=$workspaceBottomConsole;
 $: kind=state.openKinds[0]??null;
 $: current=state.tabs.find(tab=>tab.kind===kind&&tab.id===state.activeId)??state.tabs.find(tab=>tab.kind===kind);
 function resizeStart(event){if(event.button!==0)return;resizing=true;startY=event.clientY;startHeight=height;event.currentTarget.setPointerCapture?.(event.pointerId);event.preventDefault();}
 function resizeMove(event){if(!resizing)return;height=Math.max(180,Math.min(Math.round((panelElement?.parentElement?.clientHeight??window.innerHeight)*.65),startHeight+startY-event.clientY));}
 function resizeEnd(){resizing=false;}
 function tabs(kind){return state.tabs.filter(tab=>tab.kind===kind);}
</script>
<svelte:window on:pointermove={resizeMove} on:pointerup={resizeEnd} on:pointercancel={resizeEnd}/>
{#if kind}<section class="bottom-window" bind:this={panelElement} data-kind={kind} style={`--console-height:${height}px`} aria-label={kind}>
 <div class="resize-handle" role="separator" aria-orientation="horizontal" aria-label="Höhe des Panels anpassen" on:pointerdown={resizeStart}></div>
 <header><div class="tabs" role="tablist">{#if ['logs','profiler'].includes(kind)}{#each tabs(kind) as tab (tab.id)}<div class:active={current?.id===tab.id}><button role="tab" aria-selected={current?.id===tab.id} on:click={()=>openBottomTab(tab.id)}>{tab.title}</button><button class="tab-close" aria-label={`${tab.title} schließen`} on:click={()=>closeBottomTab(tab.id)}>×</button></div>{/each}{:else}<strong>{kind==='statistics'?'Statistics':'Fehlerkonsole'}</strong>{/if}</div><button class="window-close" aria-label={`${kind} schließen`} on:click={()=>closeBottomWindow(kind)}>×</button></header>
 <div class="panel-content">{#if kind==='statistics'}<StatisticsView embedded {...state.statistics}/>{:else if kind==='diagnostics'}{#if !state.diagnostics.messages?.length}<p>Keine Meldungen vorhanden.</p>{/if}<WorkspaceDiagnosticsPanel embedded messages={state.diagnostics.messages??[]} navigate={state.diagnostics.navigate} canNavigate={state.diagnostics.canNavigate}/>{:else if kind==='logs'&&current}<LogOverlay embedded {...current.data} on:clear={current.data.clear}/>{:else if kind==='profiler'&&current}<StatisticsView embedded {...current.data}/>{:else}<p>Für den ausgewählten Flow liegen noch keine Daten vor.</p>{/if}</div>
</section>{/if}
<style>.bottom-window{position:relative;flex:none;height:min(var(--console-height),65%);max-height:65%;box-sizing:border-box;display:flex;flex-direction:column;min-height:0;overflow:visible;border-top:1px solid var(--w-border);background:var(--w-panel);color:var(--w-text);font:13px system-ui}.resize-handle{position:absolute;top:-7px;left:0;right:0;height:13px;cursor:ns-resize;z-index:2}.bottom-window header{display:flex;min-height:38px;border-bottom:1px solid var(--w-border)}.tabs{display:flex;flex:1;overflow-x:auto}.tabs>div{display:flex;border-right:1px solid var(--w-border);border-bottom:2px solid transparent;background:color-mix(in srgb,var(--w-brand) 8%,var(--w-panel))}.tabs>div.active{background:color-mix(in srgb,var(--w-brand) 18%,var(--w-panel));border-bottom-color:var(--w-brand)}.tabs button,.window-close{padding:6px 10px;border:0;background:transparent;color:inherit;font:inherit;white-space:nowrap;cursor:pointer}.tabs strong{padding:9px 12px}.tab-close,.window-close{color:var(--w-muted)}.window-close{border-left:1px solid var(--w-border)}.panel-content{display:flex;flex:1;min-height:0;overflow:hidden}.panel-content>:global(*){flex:1;min-height:0}</style>
