<script>
 import {resourceColor} from './resource-colors.js';
 import ContextMenuStyles from './ContextMenuStyles.svelte';
 import {createEventDispatcher,tick} from 'svelte';
 import {orderedTabs,reorderTab,tabsToClose} from './tab-state.js';
 import {documentDirty} from './model.js';
 export let editor;
 $: graphs=$editor.tabs.map(tab=>{const resource=$editor.resources.find(r=>r.id===tab.resourceId);const doc=$editor.documents[resource?.documentId];return {id:tab.id,color:resourceColor(resource?.providerId),name:tab.title??resource?.name??tab.id,dirty:resource?.dirty??(doc&&documentDirty(doc))};});
 $: openIds=$editor.tabs.map(t=>t.id);
 $: activeId=$editor.activeId;
 $: pinned=$editor.tabs.filter(t=>t.pinned).map(t=>t.id);
 const runningId=null;
 const dispatch=createEventDispatcher();
 let menu,menuId,menuPosition={x:0,y:0},dragged;
 $: ids=orderedTabs(openIds,pinned);
 async function context(event,id){event.preventDefault();menuId=id;const rect=event.currentTarget.getBoundingClientRect();menuPosition={x:Math.max(8,Math.min(event.clientX||rect.left,window.innerWidth-240)),y:Math.max(8,Math.min(event.clientY||rect.bottom,window.innerHeight-235))};await tick();menu.showPopover();menu.querySelector('button')?.focus();}
 function action(kind){menu.hidePopover();if(kind==='pin')editor.pin(menuId);else editor.close(kind==='this'?[menuId]:tabsToClose(ids,pinned,menuId,kind));}
 async function key(event,id){if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)return context(event,id);const index=ids.indexOf(id);let next;if(event.key==='ArrowRight')next=ids[(index+1)%ids.length];if(event.key==='ArrowLeft')next=ids[(index+ids.length-1)%ids.length];if(event.key==='Home')next=ids[0];if(event.key==='End')next=ids.at(-1);if(event.key==='Delete'){event.preventDefault();editor.close([id]);await tick();next=activeId;}if(!next)return;event.preventDefault();editor.activate(next);await tick();document.getElementById(`tab-${next}`)?.focus();}
 function drop(event,id){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();editor.reorder(reorderTab(ids,pinned,dragged,id,event.clientX>rect.left+rect.width/2));dragged=null;}
</script>
<ContextMenuStyles/>
<div class="tabs" role="tablist" aria-label="Editor-Tabs">
 {#each ids as id (id)}{@const graph=graphs.find(g=>g.id===id)}{#if graph}
 <div role="presentation" class="tab-item" style={`--resource-accent:${graph.color}`} class:selected={activeId===id} draggable="true" on:dragstart={event=>{dragged=id;event.dataTransfer.setData('text/plain',id);event.dataTransfer.effectAllowed='move';}} on:dragend={()=>dragged=null} on:dragover|preventDefault on:drop={event=>drop(event,id)} on:contextmenu={event=>context(event,id)}>
 <button role="tab" aria-label={graph.name} id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={activeId===id} tabindex={activeId===id?0:-1} on:keydown={event=>key(event,id)} on:click={()=>editor.activate(id)}>{#if pinned.includes(id)}<span aria-label="Angeheftet">📌 </span>{/if}{graph.name}{graph.dirty?' •':''}</button>
 <button class="close" title="Tab schließen" aria-label={`${graph.name}: Tab schließen`} on:click={()=>editor.close([id])}>×</button>
 </div>{/if}{/each}
</div>
<div class="tab-menu flow2-context-menu" popover="auto" role="menu" tabindex="-1" aria-label="Tab-Aktionen" bind:this={menu} style={`left:${menuPosition.x}px;top:${menuPosition.y}px`} on:keydown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}}}>
 <button role="menuitem" on:click={()=>action('pin')}>{pinned.includes(menuId)?'Unpin':'Pin'}</button><button role="menuitem" on:click={()=>action('this')}>Close</button><button role="menuitem" on:click={()=>action('right')}>Close Tabs to the Right</button><button role="menuitem" on:click={()=>action('left')}>Close Tabs to the Left</button><button role="menuitem" on:click={()=>action('others')}>Close all but this</button>
</div>
<style>
 .tabs{display:flex;flex:none;overflow-x:auto;min-height:38px;background:var(--w-panel);border-bottom:1px solid var(--w-border)}.tab-item{display:flex;border-right:1px solid var(--w-border);border-bottom:2px solid transparent;flex:none;background:color-mix(in srgb,var(--resource-accent) 10%,var(--w-panel))}.selected{background:color-mix(in srgb,var(--resource-accent) 20%,var(--w-panel));border-bottom-color:var(--resource-accent)}button{font:inherit;color:inherit;cursor:pointer}.tab-item button{padding:6px 9px;background:transparent;border:0;white-space:nowrap}.tab-item [role=tab]{max-width:240px;overflow:hidden;text-overflow:ellipsis}.close{color:var(--w-muted)}button:focus-visible{outline:2px solid var(--w-brand)}
</style>
