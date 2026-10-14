<script>
 import {onMount} from 'svelte';
 export let message;export let answer;
 let dialog;
 onMount(()=>dialog.showModal());
</script>
<dialog bind:this={dialog} aria-label="Ungespeicherte Änderungen" on:cancel|preventDefault={()=>answer('cancel')}>
 <h2>Ungespeicherte Änderungen</h2><p>{message}</p>
 <footer><button on:click={()=>answer('cancel')}>Abbrechen</button><button on:click={()=>answer('discard')}>Verwerfen</button><button on:click={()=>answer('save')}>Speichern</button></footer>
</dialog>
<style>dialog{background:var(--w-panel);color:var(--w-text);border:1px solid var(--w-border);border-radius:8px;max-width:520px;padding:20px;font:inherit}dialog::backdrop{background:#0006}h2{font-size:18px}footer{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}button{font:inherit;color:inherit;background:var(--w-panel);border:1px solid var(--w-border);border-radius:5px;padding:6px 9px}</style>
