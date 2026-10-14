<script>
  import {nodeTreeEntries} from './model.js';
  import { createEventDispatcher } from 'svelte';
  import Chevron from '../host/Chevron.svelte';
  export let tree;
  export let disabled=false;
  export let expanded=false;
  export let dragMime='application/x-adam-flow2-node';
  export let showEnvironment=true;
  const dispatch=createEventDispatcher();
  function drag(event,node) {
    if(disabled){event.preventDefault();return;}
    event.dataTransfer.setData(dragMime,JSON.stringify({type:node.type,version:node.version,nodeId:node.nodeId}));
    event.dataTransfer.effectAllowed='copy';
  }
</script>
{#each nodeTreeEntries(tree) as entry}
{#if entry.kind==='branch'}
  {@const branch=entry.branch}
  <details open={expanded}>
    <summary><span class="chevron"><Chevron placement="right" /></span><span>{branch.name}</span></summary>
    <div class="branch"><svelte:self tree={branch} {disabled} {expanded} {dragMime} {showEnvironment} on:add /></div>
  </details>
{:else}
  {@const node=entry.node}
  <button class="leaf" draggable={!disabled} {disabled} on:dragstart={event=>drag(event,node)} on:click={()=>dispatch('add',node)} title={`${node.metadata?.label||node.type} auf den Graphen ziehen oder zum Hinzufügen anklicken${node.metadata?.description?'\n'+node.metadata.description:''}`}>
    <span class="symbol" aria-hidden="true">{node.type==='Standard.Flow.Wait'?'◷':'#'}</span>
    <span class="label">{node.metadata?.label||node.type}{#if showEnvironment}<small>{node.environments.map(env=>env==='server'?'Backend':'Browser').join(' · ')}</small>{/if}</span>
    <span class="grip" aria-hidden="true">⠿</span>
  </button>
{/if}
{/each}
<style>
  summary{display:flex;align-items:center;gap:6px;padding:9px 4px;cursor:pointer;font-size:12px;font-weight:600;list-style:none}summary::-webkit-details-marker{display:none}.chevron{width:14px;height:14px;display:flex;align-items:center}.chevron :global(svg){width:14px;height:14px}details[open]>summary .chevron{transform:rotate(90deg)}.branch{margin-left:8px;padding-left:8px;border-left:1px solid var(--f-border)}.leaf{display:flex;align-items:center;gap:10px;width:100%;padding:10px 8px;margin:2px 0;background:transparent;color:inherit;border:1px solid transparent;border-radius:5px;cursor:grab;text-align:left;font:inherit;font-size:13px}.leaf:hover{background:var(--f-bg);border-color:var(--f-border)}.leaf:active{cursor:grabbing}.leaf:focus-visible,summary:focus-visible{outline:2px solid var(--f-brand);outline-offset:1px}.leaf:disabled{opacity:.5;cursor:default}.symbol{font-size:19px;color:var(--f-brand);width:22px;text-align:center}.label{flex:1;min-width:0}.label small{display:block;margin-top:4px;font-size:10px;color:var(--f-muted)}.grip{color:var(--f-muted)}
</style>
