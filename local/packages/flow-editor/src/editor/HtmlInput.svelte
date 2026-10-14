<script>
  import {createEventDispatcher} from 'svelte';
  export let value;
  export let disabled=false;
  export let label='HTML-Inhalt';
  export let editors=['monaco','tinymce'];
  const dispatch=createEventDispatcher();
  let open=false,Dialog,error='',loading=false;
  async function show(){loading=true;try{Dialog??=(await import('../host/HtmlEditorDialog.svelte')).default;open=true;error='';}catch(cause){error=String(cause.message??cause);}finally{loading=false;}}
</script>
<button type="button" disabled={loading} on:click={show}>{label} {disabled?'ansehen':'bearbeiten'} …</button>
<small>{value==null?'Kein Wert':`${String(value).length} Zeichen`}</small>
{#if error}<small role="alert">{error}</small>{/if}
{#if open&&Dialog}<svelte:component this={Dialog} value={value??''} {label} {editors} readOnly={disabled} on:close={()=>open=false} on:save={event=>{if(!disabled)dispatch('value',event.detail);open=false;}}/>{/if}
<style>button{font:inherit;padding:6px;border:1px solid var(--f-border,#ccc);border-radius:4px;background:var(--f-panel,white);color:inherit}small{display:block;color:var(--f-muted,#666)}</style>
