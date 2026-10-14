<script>
 import {onMount,onDestroy} from 'svelte';
 export let results=[];export let graphNames={};export let onClose;export let onDraft;export let onShow;
 let dialog,settled=false;
 function finish(action){settled=true;action();}
 onMount(()=>dialog.showModal());
 onDestroy(()=>{if(!settled)onClose();});
</script>
<dialog bind:this={dialog} aria-label="Flows enthalten Validierungsfehler" on:cancel|preventDefault={()=>finish(onClose)}>
 <h2>Flows enthalten Validierungsfehler</h2>
 <p>Die betroffenen Flows können außerhalb des Editors nicht ausgeführt werden. Du kannst die Fehler beheben oder den aktuellen Stand ausdrücklich als Entwurf speichern.</p>
 <ul>{#each results as result}<li><button on:click={()=>finish(()=>onShow(result))}><strong>{graphNames[result.graphId]??result.graphId}</strong>{#if result.labels.length} · {result.labels.join(' → ')}{/if}<span>{result.message}</span><small>Fehler im Graphen anzeigen</small></button></li>{/each}</ul>
 <footer><button on:click={()=>finish(onClose)}>Abbrechen</button><button class="draft" on:click={()=>finish(onDraft)}>Trotz Fehlern als Entwurf speichern</button></footer>
</dialog>
<style>dialog{width:760px;max-width:90vw;max-height:85vh;border:1px solid var(--w-border);border-radius:8px;background:var(--w-panel);color:inherit;padding:20px}dialog::backdrop{background:#0006}h2{font-size:18px;margin-top:0}p{line-height:1.5}ul{list-style:none;padding:0;max-height:45vh;overflow:auto}li{margin:8px 0}li button{text-align:left;width:100%}span{display:block;margin:6px 0;color:#b42318}small{text-decoration:underline}button{font:inherit;color:inherit;background:var(--w-panel);border:1px solid var(--w-border);padding:8px 12px;border-radius:4px;cursor:pointer}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.draft{border-color:#b45309}</style>
