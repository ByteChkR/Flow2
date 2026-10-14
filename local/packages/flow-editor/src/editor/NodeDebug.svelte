<script>
  import { nodeStatusLabels,durationLabel } from './debug.js';
  export let debug=undefined;
  export let errors=[];
  export let environment;
  export let now;
  $: messages=errors.length?errors:debug?.status==='failed'?[debug.message||'Die Node konnte nicht ausgeführt werden.']:[];
  $: status=debug?.status??'idle';
  $: elapsed=debug?.durationMs??(debug?.startedAt===undefined?undefined:now-debug.startedAt);
</script>
<div class="debug" data-status={status} aria-label="Node-Ausführung">
  <div class="summary"><span class="status"><i aria-hidden="true">{status==='running'?'◉':status==='completed'?'✓':status==='failed'?'!':status==='cancelled'?'■':'○'}</i>{status==='idle'?'Noch kein Lauf':nodeStatusLabels[status]}</span><span class="duration">Dauer {elapsed===undefined?'—':durationLabel(elapsed)}</span></div>
  <div class="details"><span>{(debug?.environment??environment)==='server'?'Backend':'Browser'}</span><span>Start {debug?.timestamp?new Date(debug.timestamp).toLocaleTimeString('de-DE'):'—'}</span></div>
  {#if debug?.profile}<p>Implementierung {durationLabel(debug.profile.implementationMs)} · Verwaltung {durationLabel(debug.profile.overheadMs)}</p>{/if}
  {#if messages.length}
    <div class="failure" role="alert">
      <strong><span aria-hidden="true">!</span> {errors.length?'Node prüfen':'Ausführung fehlgeschlagen'}</strong>
      {#each messages as message}<p>{message}</p>{/each}
    </div>
  {:else if debug?.message}<p>{debug.message}</p>{/if}
</div>
<style>
  .debug{padding:10px 12px;border-top:1px solid var(--f-border);font-size:11px;background:color-mix(in srgb,var(--node-accent,var(--f-brand)) 6%,var(--f-panel));border-radius:0 0 6px 6px}.summary{display:flex;gap:8px;justify-content:space-between;align-items:center}.status{display:flex;gap:6px;align-items:center;font-weight:600}.status i{font-style:normal}.duration{font-variant-numeric:tabular-nums;white-space:nowrap}.details{display:flex;justify-content:space-between;gap:6px;color:var(--f-muted);font-size:10px;margin-top:5px}p{margin:8px 0 0;overflow-wrap:anywhere;max-height:110px;overflow:auto;white-space:pre-wrap}[data-status=running] .status{color:var(--f-brand)}[data-status=completed] .status{color:var(--f-success,#15803d)}[data-status=failed] .status{color:var(--f-danger,#dc2626)}[data-status=cancelled] .status{color:var(--f-warning,#b45309)}[data-status=idle],[data-status=queued],[data-status=skipped]{color:var(--f-muted)}[data-status=running] .status i{animation:pulse 1s ease-in-out infinite}@keyframes pulse{50%{opacity:.35}}@media(prefers-reduced-motion:reduce){[data-status=running] .status i{animation:none}}
  .failure{margin:10px -12px -10px;padding:12px;border-top:2px solid #dc2626;background:color-mix(in srgb,#dc2626 14%,var(--f-panel));border-radius:0 0 6px 6px;color:var(--f-text);font-size:12px}
  .failure strong{display:flex;align-items:center;gap:7px;font-weight:700}.failure strong span{display:inline-flex;align-items:center;justify-content:center;flex:none;width:19px;height:19px;border-radius:50%;background:#b91c1c;color:white}.failure p{max-height:none;overflow:visible;line-height:1.55}
</style>
