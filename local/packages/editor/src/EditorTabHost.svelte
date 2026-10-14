<script>
 import {derived} from 'svelte/store';
 import EditorOverlayHost from './EditorOverlayHost.svelte';
 export let editor;
 let previous;
 const views=derived(editor,(snapshot,set)=>{if(!previous||['resources','tabs','activeId','documents','providers'].some(key=>previous[key]!==snapshot[key])){previous=snapshot;set(snapshot);}});
 $: state=$views;
 // Retain mounted views across tab changes (including a running resource whose tab closes).
 let mounted=[];
 $: for(const tab of state.tabs)if(!mounted.some(t=>t.id===tab.id))mounted=[...mounted,tab];
 $: mounted=mounted.filter(tab=>{const resource=state.resources.find(r=>r.id===tab.resourceId);return resource&&(state.tabs.some(t=>t.id===tab.id)||state.providers.find(p=>p.id===resource.providerId)?.views.find(v=>v.id===tab.view)?.keepAlive);});
</script>
{#each mounted as tab (tab.id)}
 {@const resource=state.resources.find(r=>r.id===tab.resourceId)}
 {@const view=state.providers.find(p=>p.id===resource.providerId)?.views.find(v=>v.id===tab.view)}
 {#if view}<div class="editor-panel" hidden={state.activeId!==tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-label={tab.title??resource.name}>
 {#each state.providers.find(p=>p.id===resource.providerId)?.panels?.filter(p=>p.placement==='tab')??[] as panel (panel.id)}<svelte:component this={panel.component} {...panel.props} {editor} {resource} {tab}/>{/each}
 <svelte:component this={view.component} {...view.props} {...resource.props} {editor} {resource} {tab} document={state.documents[resource.documentId]} active={state.activeId===tab.id}/>
 <EditorOverlayHost {editor} tabId={tab.id}/>
 </div>{/if}
{/each}
<style>.editor-panel{position:relative;--f-panel:var(--w-panel);--f-text:var(--w-text);--f-border:var(--w-border);--f-muted:var(--w-muted);--f-brand:var(--w-brand);display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}.editor-panel[hidden]{display:none}</style>
