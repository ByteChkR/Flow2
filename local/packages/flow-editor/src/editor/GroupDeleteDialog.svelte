<script>
 import {onMount} from 'svelte';
 export let name='Gruppe';
 export let description='Beim Auflösen bleibt der Inhalt erhalten. Beim Löschen werden auch enthaltene Untergruppen und deren Inhalt entfernt.';
 export let onChoose;
 export let onClose;
 let dialog,error='';
 function choose(contents){try{onChoose(contents);onClose();}catch(cause){error=String(cause);}}
 onMount(()=>dialog.showModal());
</script>
<dialog bind:this={dialog} aria-label="Gruppe entfernen" on:cancel|preventDefault={onClose}>
 <h2>„{name}“ entfernen</h2>
 <p>{description}</p>
 {#if error}<p role="alert">{error}</p>{/if}
 <footer><button on:click={onClose}>Abbrechen</button><button on:click={()=>choose(false)}>Nur Gruppe auflösen</button><button class="danger" on:click={()=>choose(true)}>Gruppe samt Inhalt löschen</button></footer>
</dialog>
<style>
 dialog{width:560px;max-width:calc(100vw - 32px);max-height:85vh;overflow:auto;padding:22px;border:1px solid var(--w-border,var(--f-border,#ccc));border-radius:8px;background:var(--w-panel,var(--f-panel,white));color:inherit;font:inherit}dialog::backdrop{background:#0006}h2{font-size:18px;margin:0 0 14px}p{line-height:1.5}footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:20px}button{font:inherit;cursor:pointer;padding:8px 10px;border:1px solid var(--w-border,var(--f-border,#ccc));border-radius:4px;background:var(--w-panel,var(--f-panel,white));color:inherit}.danger,[role=alert]{color:#dc2626}.danger{border-color:#dc2626}
</style>
