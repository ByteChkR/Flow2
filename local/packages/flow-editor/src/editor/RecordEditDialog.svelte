<script>
 import {onMount} from 'svelte';
 import '@adam-flow/editor/host.js';
 import {flowDesignations} from '@adam-flow/core/flow-core/designations.js';
 import {groupPath,graphUsages} from './graph-workspace.js';
 import {recordDraft} from './record-edit.js';
 export let onOpenGraph;export let state;export let request;export let catalog;export let onSave;export let onClose;export let blocked=false;
 let dialog,error='';let draft=recordDraft(state,request,catalog);
 const source=request.kind==='graph'?state.graphs.find(g=>g.id===request.id):state.groups?.find(g=>g.id===request.id);
 const internal=!!request.ownerId||!!source?.ownerId;
 const readonly=request.mode==='edit'&&source?.readOnly;
 const title=`${request.kind==='group'?'Gruppe':'Graph'} ${request.mode==='create'?'anlegen':request.mode==='copy'?'kopieren':'bearbeiten'}`;
 function save(){try{onSave(draft);onClose();}catch(cause){error=String(cause);}}
 onMount(()=>dialog.showModal());
</script>
<dialog bind:this={dialog} aria-label={title} on:cancel|preventDefault={onClose}>
 <form on:submit|preventDefault={save}>
 <h2>{title}</h2>
 <fieldset disabled={blocked||readonly}>
 {#if request.kind==='group'}<label>Name<input aria-label="Gruppenname" bind:value={draft.name} maxlength="100" required/></label>
 {:else}<label>Technischer Name<input bind:value={draft.technicalName} maxlength="100" required/></label><label>Display Name<input bind:value={draft.name} maxlength="200" required/></label><label>Beschreibung<textarea rows="3" bind:value={draft.description}></textarea></label>{/if}
 {#if !internal}<label>{request.kind==='group'?'Übergeordnete Gruppe':'Gruppe'}<select aria-label={request.kind==='group'?'Übergeordnete Gruppe':'Gruppe'} bind:value={draft.groupId}><option value="">Workspace</option>{#each state.groups??[] as group}<option value={group.id} disabled={group.readOnly||group.id===request.id}>{groupPath(state,group.id)}</option>{/each}</select></label>{:else}<p>Interner Flow · Hauptflow bleibt unverändert.</p>{/if}
 {#if request.kind==='graph'}
 <details><summary>Kompatibilität</summary><label class="check"><input type="checkbox" bind:checked={draft.hybrid}/> Hybrid Graph</label><label>Kennzeichnung<select aria-label="Flow-Kennzeichnung" bind:value={draft.designation} disabled={internal}><option value="">Ohne Kennzeichnung</option>{#if draft.designation&&!flowDesignations.get(draft.designation)}<option value={draft.designation}>Unbekannt: {draft.designation}</option>{/if}{#each flowDesignations.list() as item}<option value={item.id}>{item.name}</option>{/each}</select></label></details>
 <details><summary>Kontrollfluss</summary><label class="check"><input type="checkbox" bind:checked={draft.controlInput}/> Kontroll Eingang</label><label class="check"><input type="checkbox" bind:checked={draft.controlOutput}/> Kontroll Ausgang</label></details>
 {/if}
 </fieldset>
 {#if request.kind==='graph'&&request.mode==='edit'}<section aria-label="Verwendet in"><strong>Verwendet in</strong>{#each graphUsages(state,request.id) as graph}<button type="button" on:click={()=>onOpenGraph?.(graph.id)}>{graph.name} ↗</button>{:else}<p>Wird von keinem anderen Graphen verwendet.</p>{/each}</section>{/if}
 {#if error}<p role="alert">{error}</p>{/if}
 <footer><span></span><button type="button" on:click={onClose}>Abbrechen</button><button type="submit" disabled={blocked||readonly}>Speichern</button></footer>
 </form>
</dialog>
<style>
 dialog{width:500px;max-width:calc(100vw - 32px);max-height:85vh;overflow:auto;border:1px solid var(--w-border,var(--f-border,#ccc));border-radius:8px;background:var(--w-panel,var(--f-panel,white));color:inherit;padding:22px;font:inherit}dialog::backdrop{background:#0006}h2{font-size:18px;margin:0 0 16px}fieldset{border:0;margin:0;padding:0}label{display:flex;flex-direction:column;gap:5px;margin:12px 0}input,select,textarea,button{font:inherit;color:inherit;background:var(--w-panel,var(--f-panel,white));border:1px solid var(--w-border,var(--f-border,#ccc));border-radius:4px;padding:7px;min-width:0}.check{flex-direction:row;align-items:center}details{padding:10px 0;border-top:1px solid #8884}summary,button{cursor:pointer}footer{display:flex;gap:8px;margin-top:18px}footer span{flex:1}[role=alert]{color:#dc2626}button:disabled{opacity:.5}
</style>
