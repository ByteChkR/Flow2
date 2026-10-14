<script>
 import {tick} from 'svelte';
 import Svg from './host/Svg.svelte';
 import EditorCommands from './EditorCommands.svelte';
 import {documentDirty} from './model.js';
 export let editor;export let search='';export let providerId;export let label='Workspace-Ressourcen';
 let rows=[],dragId=null,dropId=null;
 $: rootDrop=$editor.providers.find(p=>p.id===providerId)?.rootDrop;
 let selectedKey=null,elements={},menu,menuResource,position={x:0,y:0};
 $: resources=$editor.resources.filter(r=>!r.hidden&&(!providerId||r.providerId===providerId));
 function expanded(r){return $editor.expanded[r.id]??r.defaultExpanded??true;}
 function flatten(items,parentId,depth,seen=new Set()){
  return items.filter(r=>r.parentId===parentId).flatMap(r=>{if(seen.has(r.id))return [];const next=new Set([...seen,r.id]);const children=flatten(items,r.id,depth+1,next);const match=!search||r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase());if(search&&!match&&!children.length)return [];return [{...r,depth,expanded:(r.expandable||items.some(c=>c.parentId===r.id))?expanded(r):undefined},...(search||expanded(r)?children:[])];});
 }
 $: {search;$editor.expanded;rows=flatten(resources,undefined,0);}
 $: tabKey=rows.some(r=>r.id===selectedKey)?selectedKey:rows[0]?.id;
 function drag(event,row){
  if(!row.dragData&&!row.movable||event.target.closest('button')){event.preventDefault();return;}
  dragId=row.movable?row.id:null;
  for(const [type,value] of Object.entries(row.dragData??{}))event.dataTransfer.setData(type,value);
  if(row.movable)event.dataTransfer.setData('application/x-adam-editor-resource',row.id);
  event.dataTransfer.effectAllowed=row.movable?'copyMove':'copy';
 }
 function over(event,target,id){event.stopPropagation();if(!dragId||!target?.canDrop(dragId)){event.dataTransfer.dropEffect='none';dropId=null;return;}event.preventDefault();event.dataTransfer.dropEffect='move';dropId=id;}
 function drop(event,target){event.preventDefault();event.stopPropagation();const id=event.dataTransfer.getData('application/x-adam-editor-resource');dropId=null;dragId=null;if(id&&target?.canDrop(id))target.drop(id);}
 function endDrag(){dragId=null;dropId=null;}

 function activate(row){select(row);if(row.view||row.onOpen)editor.open(row.id);else if(row.expanded!==undefined)editor.toggle(row.id,!row.expanded);}
 function select(row){selectedKey=row.id;editor.select(row.id);row.onSelect?.();}
 async function keydown(event,row,index){if(event.target!==event.currentTarget)return;let next;if(event.key==='ArrowDown')next=rows[Math.min(index+1,rows.length-1)];else if(event.key==='ArrowUp')next=rows[Math.max(0,index-1)];else if(event.key==='Home')next=rows[0];else if(event.key==='End')next=rows.at(-1);else if(event.key==='ArrowRight'&&row.expanded!==undefined){if(!row.expanded)editor.toggle(row.id,true);else if(rows[index+1]?.depth>row.depth)next=rows[index+1];}else if(event.key==='ArrowLeft'){if(row.expanded)editor.toggle(row.id,false);else next=rows.slice(0,index).reverse().find(r=>r.depth<row.depth);}else if(event.key==='Enter'){if(!row.view&&!row.onOpen&&row.expanded!==undefined)editor.toggle(row.id,!row.expanded);else editor.open(row.id);}else if(event.key===' '){select(row);if(row.expanded!==undefined)editor.toggle(row.id,!row.expanded);}else return;event.preventDefault();if(next){select(next);await tick();elements[next.id]?.focus();}}
 function hasActions(row){return row.commands?.some(c=>c.placement==='context'&&c.visible?.({resource:row})!==false);}
 async function actions(event,row){
  if(!hasActions(row))return;
  event.preventDefault();event.stopPropagation();select(row);menuResource=row;
  const rect=event.currentTarget.getBoundingClientRect();
  const pointer=event.type==='contextmenu'&&(event.clientX!==0||event.clientY!==0);
  position={x:Math.max(8,Math.min(pointer?event.clientX:rect.right+6,window.innerWidth-336)),y:Math.max(8,Math.min(pointer?event.clientY:rect.top,window.innerHeight-360))};
  await tick();menu.showPopover();
 }
</script>
<div class="tree" role="tree" aria-label={label}>
 {#each rows as row,index (row.id)}
 {@const doc=$editor.documents[row.documentId]}
 <div draggable={!!row.dragData||!!row.movable} on:dragstart={event=>drag(event,row)} on:dragend={endDrag} on:dragover={event=>over(event,row.dropTarget,row.id)} on:dragleave={()=>{if(dropId===row.id)dropId=null;}} on:drop={event=>drop(event,row.dropTarget)} class:drop-target={dropId===row.id} role="treeitem" aria-label={row.entryCount==null?row.name:`${row.name} (${row.entryCount})`} aria-level={row.depth+1} aria-selected={selectedKey===row.id} aria-expanded={row.expanded} tabindex={tabKey===row.id?0:-1} bind:this={elements[row.id]} class="tree-row" class:create-row={!row.view&&!!row.onOpen} class:active={$editor.tabs.find(t=>t.id===$editor.activeId)?.resourceId===row.id} class:selected={selectedKey===row.id} style={`padding-left:${8+row.depth*16}px`} title={row.description??row.name} on:click={()=>activate(row)} on:contextmenu={event=>actions(event,row)} on:keydown={event=>keydown(event,row,index)}>
 {#if row.expanded!==undefined}<button class="toggle" tabindex="-1" aria-label={`${row.name} ${row.expanded?'zuklappen':'aufklappen'}`} on:click|stopPropagation={()=>editor.toggle(row.id,!row.expanded)}>{row.expanded?'▾':'▸'}</button>{:else}<span class="resource-icon">{#if row.icon}<Svg icon={row.icon}/>{:else}◇{/if}</span>{/if}
 {#if !row.view&&row.onOpen}<button class="create name" on:click|stopPropagation={()=>editor.open(row.id)}>{row.name}</button>{:else}<span class="name">{row.name}{#if row.entryCount!=null} ({row.entryCount}){/if}</span>{/if}{#if row.dirty??(doc&&documentDirty(doc))}<span title="Ungespeicherte Änderungen">•</span>{/if}{#if row.readOnly}<small title={row.description??'Schreibgeschützt'}>🔒</small>{/if}
 {#if row.badge}<small class="badge" style:--badge-color={row.badge.color}>{row.badge.text}</small>{/if}
 {#if hasActions(row)}<button class="actions" aria-label={`Aktionen für ${row.name}`} title="Weitere Aktionen" aria-haspopup="dialog" on:click|stopPropagation={event=>actions(event,row)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>{/if}
 </div>
 {/each}
 {#if rootDrop}<div class="root-drop" class:drop-target={dropId==='__root'} on:dragover={event=>over(event,rootDrop,'__root')} on:dragleave={()=>dropId=null} on:drop={event=>drop(event,rootDrop)}>In Workspace-Ebene verschieben</div>{/if}
</div>
<div class="flow2-context-menu" popover="auto" bind:this={menu} style={`left:${position.x}px;top:${position.y}px`} role="dialog" aria-label={`Aktionen für ${menuResource?.name??'Eintrag'}`} on:click={()=>menu.hidePopover()}>{#if menuResource}<strong>{menuResource.name}</strong><EditorCommands iconComponent={Svg} {editor} context={{resource:menuResource}} commands={menuResource.commands?.filter(c=>c.placement==='context')??[]}/>{/if}</div>
<style>.create{font:inherit;text-align:left;color:inherit;background:transparent;border:0;padding:0;cursor:pointer}.tree{min-width:0;padding:4px 0}.tree-row{user-select:none;-webkit-user-select:none;display:flex;align-items:center;gap:5px;min-height:33px;padding:3px 8px;border-radius:4px;cursor:pointer;box-sizing:border-box;color:var(--w-text)}.tree-row:hover,.selected{background:color-mix(in srgb,var(--resource-accent,var(--w-brand)) 15%,var(--w-panel))}.selected{box-shadow:inset 3px 0 var(--resource-accent,var(--w-brand))}.active .name{font-weight:600}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}span.name{pointer-events:none}.root-drop{user-select:none;margin:8px;padding:10px;border:1px dashed var(--w-border);color:var(--w-muted);font-size:12px}.drop-target{outline:2px solid var(--w-brand);background:var(--w-panel)}.toggle{border:0;background:transparent;color:inherit;padding:2px;width:22px;flex:none;cursor:pointer;font:inherit}.resource-icon{width:22px;flex:none;text-align:center;color:var(--w-muted)}.resource-icon :global(svg){width:18px;height:18px}.actions{opacity:0;display:inline-flex;align-items:center;justify-content:center;flex:none;width:26px;height:26px;padding:4px;border:1px solid transparent;border-radius:4px;background:transparent;color:inherit;cursor:pointer}.actions svg{width:16px;height:16px}.actions:hover{border-color:var(--w-border);background:var(--w-panel)}.actions:focus-visible{outline:2px solid var(--w-brand);outline-offset:1px}.tree-row:hover .actions,.tree-row:focus-within .actions{opacity:1}.badge{background:color-mix(in srgb,var(--badge-color,var(--w-brand)) 20%,var(--w-panel));color:var(--w-text);border:1px solid var(--w-border);padding:2px 6px;border-radius:4px;font-size:11px}.tree-row:focus-visible{outline:2px solid var(--w-brand)}</style>
