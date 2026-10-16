<script>
 import ThemeControls from './host/ThemeControls.svelte';
 import EditorTheme from './EditorTheme.svelte';
 import {darkModeStore} from '@adam/editor/host.js';
 import {onMount,onDestroy} from 'svelte';
 import {registerNavigationGuard} from './navigation.js';
 import Svg from './host/Svg.svelte';
 import ContextMenuStyles from './ContextMenuStyles.svelte';
 import {createEditorStore} from './model.js';
 import EditorTabs from './EditorTabs.svelte';
 import EditorResources from './EditorResources.svelte';
 import EditorTabHost from './EditorTabHost.svelte';
 import EditorOverlayHost from './EditorOverlayHost.svelte';
 import EditorCommands from './EditorCommands.svelte';
 import DirtyDialog from './DirtyDialog.svelte';
 export let identityKey;
 export let title='Flow2';
 export let showTitle=true;export let sidebarHeader=false;
 export let fullscreen=false;export let onFullscreen;
 export let editor=createEditorStore({identityKey,storage:typeof localStorage==='undefined'?undefined:localStorage,confirm:message=>new Promise(resolve=>{editor.overlay({id:'unsaved',component:DirtyDialog,modal:true,props:{message,answer:value=>{editor.closeOverlay('unsaved');resolve(value);}}});})});
 let libraryOpen=false,activeWorkspacePanel;
 $: activeResource=$editor.resources.find(r=>r.id===($editor.tabs.find(t=>t.id===$editor.activeId)?.resourceId??$editor.selectedId));
 $: modal=$editor.overlays.some(o=>o.modal);
 $: commands=$editor.providers.flatMap(p=>p.commands??[]).filter(c=>c.placement==='workspace');
 $: if(activeWorkspacePanel&&!$editor.workspacePanels.some(panel=>panel.id===activeWorkspacePanel))activeWorkspacePanel=undefined;
 function beforeLeave(event){if(editor.hasChanges()){event.preventDefault();event.returnValue='';}}
 onMount(()=>registerNavigationGuard(()=>editor.prepareLeave()));
 onDestroy(()=>editor.destroy());
</script>
<EditorTheme/>
<ContextMenuStyles/>
<svelte:window on:beforeunload={beforeLeave}/>
<section class="editor-workspace editor-theme" class:dark={$darkModeStore} class:sidebar-header={sidebarHeader} aria-label="Editor-Workspace">
 <header class="workspace-heading" inert={modal?true:undefined}>
  {#if showTitle}<strong>{title}</strong>{/if}<div class="header-primary">{#if onFullscreen}<button class="icon-button fullscreen-toggle" aria-label={fullscreen?'Studio-Kopfzeile einblenden':'Studio-Kopfzeile ausblenden'} title={fullscreen?'Studio-Kopfzeile einblenden':'Studio-Kopfzeile ausblenden'} aria-pressed={fullscreen} on:click={onFullscreen}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={fullscreen?'M5 8.5 12 15.5 19 8.5':'M5 15.5 12 8.5 19 15.5'}/></svg></button>{/if}<button class="icon-button" aria-label="Ressourcen" title="Ressourcen" aria-expanded={libraryOpen} aria-pressed={libraryOpen} on:click={()=>{libraryOpen=!libraryOpen;activeWorkspacePanel=undefined;}}><Svg icon="buttonIcons/burgerMenu"/></button></div>
  <div class="header-top-panels">{#each $editor.workspacePanels.filter(panel=>panel.placement==='workspace-header-top') as panel (panel.id)}<svelte:component this={panel.component} {...panel.props} {editor} active={activeWorkspacePanel===panel.id} on:open={()=>{activeWorkspacePanel=activeWorkspacePanel===panel.id?undefined:panel.id;libraryOpen=false;}}/>{/each}</div>
  <EditorCommands iconComponent={Svg} {editor} {commands} context={{resource:activeResource}}/>
  <div class="theme-actions"><ThemeControls/></div>
  <div class="header-bottom-panels">{#each $editor.workspacePanels.filter(panel=>panel.placement==='workspace-header-bottom') as panel (panel.id)}<svelte:component this={panel.component} {...panel.props} {editor}/>{/each}</div>
 </header>
 {#each $editor.scopes.filter(s=>$editor.status[s.id]?.error) as unit}<p class="error" role="alert">{unit.label}: {$editor.status[unit.id].error} · Lokale Änderungen bleiben erhalten.</p>{/each}
 {#if $editor.error}<p class="error" role="alert">{$editor.error} <button on:click={()=>editor.clearError()}>Schließen</button></p>{/if}
 <div class="workspace-body" inert={modal?true:undefined}>
 <aside aria-label="Workspace-Seitenpanel" hidden={!libraryOpen&&!activeWorkspacePanel}>{#if libraryOpen}<EditorResources {editor}/>{:else}{@const panel=$editor.workspacePanels.find(item=>item.id===activeWorkspacePanel)}{#if panel}<svelte:component this={panel.panelComponent??panel.component} {...panel.props} {editor}/>{/if}{/if}</aside>
 <main><EditorTabs {editor}/><EditorTabHost {editor}/>{#if !$editor.activeId}<div class="empty"><h2>Keine Ressource geöffnet</h2><p>Öffne eine Ressource im Workspace.</p><button on:click={()=>libraryOpen=true}>Ressourcen öffnen</button></div>{/if}{#each $editor.workspacePanels.filter(panel=>panel.placement==='workspace-bottom') as panel (panel.id)}<svelte:component this={panel.component} {...panel.props} {editor}/>{/each}</main>
 </div>
 <slot {editor}/>
 <EditorOverlayHost {editor}/>
</section>
<style>
.theme-actions{margin-left:auto;display:flex;align-items:center;flex:none}.header-primary{display:flex;align-items:center;gap:4px;flex:none}.header-top-panels,.header-bottom-panels{display:contents}.editor-workspace.sidebar-header{--workspace-rail-width:48px;display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.editor-workspace.sidebar-header>.workspace-heading{grid-column:1;grid-row:1 / 3;align-self:stretch;width:var(--workspace-rail-width);min-height:0;padding:0;flex-direction:column;align-items:center;justify-content:flex-start;flex-wrap:nowrap;border-bottom:0;border-right:1px solid var(--w-border)}.editor-workspace.sidebar-header>.workspace-heading .header-primary{width:100%;flex-direction:column;justify-content:center}.editor-workspace.sidebar-header>.workspace-heading .header-top-panels{display:flex;flex-direction:column;align-items:center;gap:4px}.editor-workspace.sidebar-header>.workspace-heading .header-bottom-panels{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;margin-top:auto}.editor-workspace.sidebar-header>.workspace-heading .theme-actions{margin:0}.editor-workspace.sidebar-header>.workspace-body{grid-column:2;grid-row:2;min-height:0}.editor-workspace.sidebar-header>.error{grid-column:2}
.editor-workspace{height:100vh;height:100dvh;display:flex;flex-direction:column;background:var(--w-bg);color:var(--w-text);font-family:inherit;font-size:13px;line-height:1.4;overflow:hidden}header{display:flex;align-items:center;gap:12px;min-height:48px;padding:6px 14px;background:var(--w-panel);border-bottom:1px solid var(--w-border);flex-wrap:wrap}header strong{font-size:17px}button,input{font:inherit;color:inherit;border:1px solid var(--w-border);border-radius:5px;background:var(--w-panel);padding:6px 9px}button{cursor:pointer}button:hover{border-color:var(--w-brand)}button:disabled{opacity:.5;cursor:default}.icon-button{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:7px}.icon-button[aria-pressed=true]{border-color:var(--w-brand);background:color-mix(in srgb,var(--w-brand) 14%,var(--w-panel))}.icon-button :global(svg){width:18px;height:18px}.workspace-body{display:flex;flex:1;min-height:0}main{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}aside{width:320px;min-width:240px;max-width:50vw;resize:horizontal;flex:none;display:flex;flex-direction:column;min-height:0;overflow:auto;background:var(--w-panel);border-right:1px solid var(--w-border);padding:0;box-sizing:border-box}aside[hidden]{display:none}.empty{margin:auto;text-align:center;padding:30px;color:var(--w-muted)}.empty h2{font-size:18px;color:var(--w-text)}.error{margin:0;padding:8px 14px;color:var(--w-danger);background:var(--w-panel)}button:focus-visible,input:focus-visible{outline:2px solid var(--w-brand);outline-offset:2px}@media(max-width:800px){aside{width:260px;min-width:220px}header{gap:6px}}
</style>
