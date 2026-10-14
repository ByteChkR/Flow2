<script>
 import {createEventDispatcher} from 'svelte';

 export let value='';export let disabled=false;export let contracts=[];
 const dispatch=createEventDispatcher();let open=false;let Dialog;let loading=false;let error='';
 async function edit(){loading=true;error='';try{Dialog??=(await import('../host/PageConfigDialog.svelte')).default;open=true;}catch(cause){error=String(cause.message??cause);}finally{loading=false;}}
 $: summary=describe(value);
 function describe(text){try{const page=JSON.parse(text);return `${page.name||'Ohne Namen'} · ${page.content?.panels?.length??0} Panels`;}catch{return 'Ungültige Page-Config';}}
 function save(event){dispatch('value',event.detail);open=false;}
</script>
<button type="button" disabled={disabled||loading} on:click={edit}>{loading?'Editor wird geladen …':'Seite bearbeiten …'}</button><small>{summary}</small>
{#if error}<small role="alert">{error}</small>{/if}
{#if open&&Dialog}<svelte:component this={Dialog} {value} {contracts} on:save={save} on:close={()=>open=false}/>{/if}
<style>button{width:100%;font:inherit;padding:7px;border:1px solid var(--f-border,#ccc);border-radius:4px;color:inherit;background:var(--f-panel,white)}small{display:block;margin-top:4px;color:#666}</style>
