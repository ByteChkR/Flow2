<script>
  import {createEventDispatcher} from 'svelte';
  import {configStore} from '@adam-flow/editor/host.js';
  export let id;
  export let value='';
  export let disabled=false;
  const dispatch=createEventDispatcher();
  $: entries=[...($configStore?.catalogs??[])].sort((a,b)=>a.name.localeCompare(b.name));
</script>
<input {id} {disabled} {value} list={`${id}-catalogs`} aria-label="Katalog suchen" placeholder="Katalog suchen …" on:input={event=>dispatch('value',event.target.value)}/>
<datalist id={`${id}-catalogs`}>{#each entries as entry}<option value={entry.name}/>{/each}</datalist>
<style>input{width:100%;min-width:0;font:inherit;color:inherit;background:var(--f-panel,#fff);border:1px solid var(--f-border,#d1d5db);border-radius:4px;padding:4px 6px;box-sizing:border-box}</style>
