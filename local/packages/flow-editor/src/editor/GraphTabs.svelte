<script>
 import ContextMenuStyles from './ContextMenuStyles.svelte';
 import {createEventDispatcher,tick} from 'svelte';
 import {orderedTabs,reorderTab,tabsToClose} from './tab-state.js';
 export let graphs=[];export let openIds=[];export let activeId;export let runningId;export let pinned=[];
 const dispatch=createEventDispatcher();
 let menu,menuId,menuPosition={x:0,y:0},dragged;
 $: ids=orderedTabs(openIds,pinned);
 async function context(event,id){event.preventDefault();menuId=id;const rect=event.currentTarget.getBoundingClientRect();menuPosition={x:Math.max(8,Math.min(event.clientX||rect.left,window.innerWidth-240)),y:Math.max(8,Math.min(event.clientY||rect.bottom,window.innerHeight-235))};await tick();menu.showPopover();menu.querySelector('button')?.focus();}
 function action(kind){menu.hidePopover();if(kind==='pin')dispatch('pin',menuId);else dispatch('close',kind==='this'?[menuId]:tabsToClose(ids,pinned,menuId,kind));}
 async function key(event,id){if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)return context(event,id);const index=ids.indexOf(id);let next;if(event.key==='ArrowRight')next=ids[(index+1)%ids.length];if(event.key==='ArrowLeft')next=ids[(index+ids.length-1)%ids.length];if(event.key==='Home')next=ids[0];if(event.key==='End')next=ids.at(-1);if(event.key==='Delete'){event.preventDefault();dispatch('close',[id]);await tick();next=activeId;}if(!next)return;event.preventDefault();dispatch('open',next);await tick();document.getElementById(`tab-${next}`)?.focus();}
 function drop(event,id){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();dispatch('reorder',reorderTab(ids,pinned,dragged,id,event.clientX>rect.left+rect.width/2));dragged=null;}
</script>
<ContextMenuStyles/>
<div class="tabs" role="tablist" aria-label="Graph-Tabs">
 {#each ids as id (id)}{@const graph=graphs.find(g=>g.id===id)}{#if graph}
 <div role="presentation" class="tab-item" class:selected={activeId===id} draggable="true" on:dragstart={event=>{dragged=id;event.dataTransfer.setData('text/plain',id);event.dataTransfer.effectAllowed='move';}} on:dragend={()=>dragged=null} on:dragover|preventDefault on:drop={event=>drop(event,id)} on:contextmenu={event=>context(event,id)}>
 <button role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={activeId===id} tabindex={activeId===id?0:-1} on:keydown={event=>key(event,id)} on:click={()=>dispatch('open',id)}>{#if pinned.includes(id)}<span aria-label="Angeheftet">📌 </span>{/if}{graph.name}{runningId===id?' · läuft':''}</button>
 <button class="close" title="Tab schließen – Graph bleibt erhalten" aria-label={`${graph.name}: Tab schließen`} on:click={()=>dispatch('close',[id])}>×</button>
 </div>{/if}{/each}
</div>
<div class="tab-menu flow2-context-menu" popover="auto" role="menu" tabindex="-1" aria-label="Tab-Aktionen" bind:this={menu} style={`left:${menuPosition.x}px;top:${menuPosition.y}px`} on:keydown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}}}>
 <button role="menuitem" on:click={()=>action('pin')}>{pinned.includes(menuId)?'Unpin':'Pin'}</button><button role="menuitem" on:click={()=>action('this')}>Close</button><button role="menuitem" on:click={()=>action('right')}>Close Tabs to the Right</button><button role="menuitem" on:click={()=>action('left')}>Close Tabs to the Left</button><button role="menuitem" on:click={()=>action('others')}>Close all but this</button>
</div>
<style>
 .tabs{display:flex;flex:none;overflow-x:auto;min-height:38px;background:var(--w-panel);border-bottom:1px solid var(--w-border)}.tab-item{display:flex;border-right:1px solid var(--w-border);border-bottom:2px solid transparent;flex:none}.selected{background:var(--w-bg);border-bottom-color:var(--w-brand)}button{font:inherit;color:inherit;cursor:pointer}.tab-item button{padding:6px 9px;background:transparent;border:0;white-space:nowrap}.tab-item [role=tab]{max-width:240px;overflow:hidden;text-overflow:ellipsis}.close{color:var(--w-muted)}button:focus-visible{outline:2px solid var(--w-brand)}
</style>
