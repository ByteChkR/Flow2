<script>
  import {createEventDispatcher} from 'svelte';
  export let binding;
  export let targets=[];
  export let disabled=false;
  const dispatch=createEventDispatcher();
  // JSON persistence can reorder properties without changing the target's identity.
  const key=target=>JSON.stringify([target.context,target.entity??null,target.collection??null]);
  function change(event){
    const target=targets.find(item=>key(item)===event.target.value);
    if(target)dispatch('change',structuredClone(target));
  }
</script>
<label class="ef-target">EF-Ziel<select {disabled} value={key(binding)} on:change={change}>
  {#each targets as target}<option value={key(target)}>{target.collection??target.entity??target.context}</option>{/each}
</select></label>
<style>
  .ef-target{display:flex;flex-direction:column;gap:4px;padding:10px 12px 12px;font-size:12px}
  select{width:100%;min-width:0;box-sizing:border-box;font:inherit;color:inherit;background:var(--f-bg);border:1px solid var(--f-border);border-radius:4px;padding:3px 5px;font-size:11px}
  select:focus-visible{outline:2px solid var(--f-brand);outline-offset:2px}
</style>
