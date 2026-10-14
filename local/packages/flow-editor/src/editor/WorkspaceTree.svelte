<script>
  import {backendTriggerDesignation,entityBackendTriggerDesignation,frontendProcessDesignation} from '@adam-flow/editor/host.js';
  import {createEventDispatcher,tick} from 'svelte';
  import {flowDesignations} from '@adam-flow/core/flow-core/designations.js';
  let designationFilter='';
  $: designations=[...new Set([...flowDesignations.list().map(item=>item.id),...state.graphs.map(graph=>graph.flow.designation).filter(Boolean)])].map(id=>flowDesignations.get(id)??{id,name:`Unbekannt: ${id}`});
  import {workspaceTree} from './graph-workspace.js';
  export let state;
  export let search='';
  export let selectedKey=null;
  export let actionsOpen=false;
  export let actionsId;
  export let disabled=false;
  const dispatch=createEventDispatcher();
  let elements={};
  $: rows=workspaceTree({...state,graphs:state.graphs.filter(graph=>{const root=graph.ownerId?state.graphs.find(item=>item.id===graph.ownerId):graph;return !designationFilter||(designationFilter==='__none'?!root?.flow.designation:root?.flow.designation===designationFilter);})},search,!!designationFilter).filter(row=>!designationFilter||row.kind==='graph'||row.count>0);
  $: tabKey=rows.some(row=>row.key===selectedKey)?selectedKey:rows[0]?.key;
  async function focus(row){if(!row)return;dispatch('select',row);await tick();elements[row.key]?.focus();}
  async function keydown(event,row,index){
    let next;
    if(event.key==='ArrowDown')next=rows[Math.min(index+1,rows.length-1)];
    else if(event.key==='ArrowUp')next=rows[Math.max(index-1,0)];
    else if(event.key==='Home')next=rows[0];
    else if(event.key==='End')next=rows.at(-1);
    else if(event.key==='ArrowRight'&&row.expanded!==undefined){
      if(!row.expanded)dispatch('toggle',row);else if(rows[index+1]?.depth>row.depth)next=rows[index+1];
    }else if(event.key==='ArrowLeft'){
      if(row.expanded!==undefined&&row.expanded)dispatch('toggle',row);
      else next=rows.slice(0,index).reverse().find(item=>item.depth<row.depth);
    }else if(event.key==='Enter'||event.key===' '){dispatch('select',row);if(row.kind==='group')dispatch('toggle',row);else if(event.key==='Enter')dispatch('open',row);}
    else return;
    event.preventDefault();if(next)await focus(next);
  }
</script>
<label>Kennzeichnung <select aria-label="Graphen nach Kennzeichnung filtern" bind:value={designationFilter}><option value="">Alle</option><option value="__none">Ohne Kennzeichnung</option>{#each designations as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
<div class="tree" role="tree" aria-label="Workspace-Gruppen und Graphen">
  {#each rows as row,index (row.key)}
      {@const origin=row.kind==='graph'?state.graphs.find(item=>item.id===row.id):state.groups?.find(item=>item.id===row.id)}
    <div role="treeitem" aria-label={row.name} aria-level={row.depth+1} aria-selected={selectedKey===row.key} aria-expanded={row.expanded}
      tabindex={tabKey===row.key?0:-1} bind:this={elements[row.key]} class="tree-row" class:selected={selectedKey===row.key} class:active={row.kind==='graph'&&state.activeId===row.id}
      style={`padding-left:${8+row.depth*16}px`} title={row.name} on:click={()=>dispatch('select',row)} on:dblclick={()=>{if(row.kind==='graph')dispatch('open',row);}} on:keydown={event=>keydown(event,row,index)}>
      {#if row.expanded!==undefined}<button tabindex="-1" class="toggle" aria-label={`${row.name} ${row.expanded?'zuklappen':'aufklappen'}`} on:click|stopPropagation={()=>dispatch('toggle',row)}>{row.expanded?'▾':'▸'}</button>{:else}<span class="graph-icon" aria-hidden="true">◇</span>{/if}
      <span class="name">{row.name}</span>{#if origin?.ownerId}<small>Intern</small>{/if}
      {#if origin?.readOnly}<small title={`Geerbt aus ${origin.originName} · schreibgeschützt`}>🔒</small>{/if}
      {#if row.kind==='graph'}{@const designation=state.graphs.find(graph=>graph.id===row.id)?.flow.designation}{#if designation}<small class="designation" class:backend={designation===backendTriggerDesignation||designation===entityBackendTriggerDesignation} class:frontend={designation===frontendProcessDesignation} title={designation}>{flowDesignations.get(designation)?.name??designation}</small>{/if}{/if}
      {#if actionsId}<button class="actions" aria-label={`Aktionen für ${row.name}`} aria-haspopup="dialog" aria-expanded={actionsOpen} aria-controls={actionsId} title="Aktionen" on:keydown|stopPropagation on:dblclick|stopPropagation on:click|stopPropagation={event=>dispatch('actions',{row,button:event.currentTarget})}>⋮</button>{/if}
      {#if row.kind==='group'}<span class="count" aria-label={`${row.count} Graphen`}>{row.count}</span>{/if}
    </div>
  {/each}
  <div role="treeitem" aria-selected="false" aria-level="1"><button class="tree-row create-row" aria-label="+ Neuer Graph" {disabled} on:click={()=>dispatch('create','graph')}><span class="graph-icon" aria-hidden="true">+</span><span class="name">Neuer Graph</span></button></div>
  <div role="treeitem" aria-selected="false" aria-level="1"><button class="tree-row create-row" aria-label="+ Neue Gruppe" {disabled} on:click={()=>dispatch('create','group')}><span class="graph-icon" aria-hidden="true">+</span><span class="name">Neue Gruppe</span></button></div>
</div>
{#if !rows.length}<p class="empty">{search?'Keine passenden Gruppen oder Graphen.':'Noch keine Graphen oder Gruppen.'}</p>{/if}
<style>
  .designation{padding:2px 6px;border-radius:4px;line-height:1.4}
  .designation.backend{background:color-mix(in srgb,#8b5cf6 18%,var(--w-panel))}
  .designation.frontend{background:color-mix(in srgb,var(--w-brand) 18%,var(--w-panel))}

  .actions{opacity:0}.tree-row:hover .actions,.tree-row:focus-within .actions{opacity:1}
  .create-row{width:100%;font:inherit;text-align:left;background:transparent;border:0}.create-row:disabled{opacity:.5;cursor:default}.create-row:disabled:hover{background:transparent}
  .actions{flex:none;border:1px solid var(--w-border);border-radius:4px;background:var(--w-panel);color:inherit;font:inherit;font-weight:700;cursor:pointer;padding:0 7px;font-size:18px}.actions:focus-visible{outline:2px solid var(--w-brand)}
  .tree{min-width:0;padding:4px 0}.tree-row{display:flex;align-items:center;gap:5px;min-height:33px;padding:3px 8px;border-radius:4px;cursor:pointer;box-sizing:border-box;color:var(--w-text)}.tree-row:hover{background:var(--w-bg)}.tree-row.selected{background:var(--w-bg);box-shadow:inset 3px 0 var(--w-brand)}.tree-row.active .name{font-weight:600}.tree-row:focus-visible{outline:2px solid var(--w-brand);outline-offset:-2px}.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.toggle{border:0;background:transparent;color:inherit;padding:2px;width:22px;flex:none;cursor:pointer;font:inherit}.graph-icon{width:22px;flex:none;text-align:center;color:var(--w-muted)}.count{font-size:11px;color:var(--w-muted);font-variant-numeric:tabular-nums}.empty{font-size:12px;color:var(--w-muted);padding:8px}
</style>
