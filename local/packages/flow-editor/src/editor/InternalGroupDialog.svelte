<script>
 import {onMount} from 'svelte';
 export let name='';export let onSave;export let onClose;
 let dialog,error='';
 function save(){try{onSave(name);onClose();}catch(cause){error=String(cause);}}
 onMount(()=>dialog.showModal());
</script>
<dialog bind:this={dialog} aria-label="Untergraph-Gruppe" on:cancel|preventDefault={onClose}><form on:submit|preventDefault={save}><h2>Untergraph-Gruppe</h2><label>Name<input aria-label="Name der Untergraph-Gruppe" bind:value={name} required maxlength="100"/></label>{#if error}<p role="alert">{error}</p>{/if}<footer><button type="button" on:click={onClose}>Abbrechen</button><button type="submit">Speichern</button></footer></form></dialog>
<style>dialog{width:380px;max-width:90vw;border:1px solid var(--w-border);border-radius:8px;background:var(--w-panel);color:inherit;padding:20px}dialog::backdrop{background:#0006}h2{font-size:18px}label{display:flex;flex-direction:column;gap:6px}input,button{font:inherit;color:inherit;background:var(--w-panel);border:1px solid var(--w-border);padding:7px;border-radius:4px}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}[role=alert]{color:#b91c1c}</style>
