<script>
  import {afterUpdate,createEventDispatcher} from 'svelte';
  export let entries=[];
  export let running=false;
  export let executionId;
  export let embedded=false;
  const dispatch=createEventDispatcher();
  let list,follow=true,lastCount=0;
  const levels={info:'Info',warning:'Warnung',error:'Fehler'};
  afterUpdate(()=>{
    if(entries.length!==lastCount&&follow&&list)list.scrollTop=list.scrollHeight;
    lastCount=entries.length;
  });
</script>
<section class="log-overlay" class:embedded aria-label="Flow-Logs">
  <header><strong>Logs <span>{entries.length}</span></strong><small>{running?'Live':'Letzter Lauf'}{executionId?` · ${executionId.slice(0,8)}`:''}</small>{#if !embedded}<button aria-label="Logs schließen" title="Logs schließen" on:click={()=>dispatch('close')}>×</button>{/if}</header>
  <!-- The scrollable log is focusable so keyboard users can read older entries. -->
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <div class="entries" bind:this={list} role="log" aria-label="Laufprotokoll" aria-live="polite" aria-relevant="additions" tabindex="0" on:scroll={()=>follow=list.scrollHeight-list.scrollTop-list.clientHeight<30}>
    {#each entries as entry (entry.id)}
      <article data-level={entry.level}>
        <div class="meta"><time datetime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString('de-DE',{hour12:false})}</time><b>{levels[entry.level]||entry.level}</b><span class="origin" data-environment={entry.environment}>{entry.environment==='server'?'Backend':'Frontend'}</span><span class="node-label" title={entry.nodeId}>{entry.label}</span></div>
        <p>{entry.message}</p>
      </article>
    {:else}<p class="empty">{running?'Noch keine Logeinträge.':'Keine Logeinträge in diesem Lauf.'}</p>{/each}
  </div>
  <footer><span>Print und Node-Fehler · zeitlich sortiert</span><button disabled={!entries.length} on:click={()=>{follow=true;dispatch('clear');}}>Leeren</button></footer>
</section>
<style>
  .log-overlay{position:absolute;z-index:3;right:16px;bottom:52px;width:min(460px,calc(100% - 32px));max-height:calc(100% - 80px);display:flex;flex-direction:column;background:var(--f-panel);color:var(--f-text);border:1px solid var(--f-border);border-radius:8px;box-shadow:0 6px 24px #0002;overflow:hidden;font-size:12px;touch-action:auto}.log-overlay.embedded{position:relative;inset:auto;width:auto;max-height:none;border:0;border-radius:0;box-shadow:none}
  header{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--f-border)}header strong{font-size:13px}header strong span{font-weight:400;color:var(--f-muted);margin-left:4px}header small{color:var(--f-muted);flex:1;font-size:10px}button{font:inherit;color:inherit;background:transparent;border:1px solid var(--f-border);border-radius:4px;cursor:pointer;padding:2px 8px}button:disabled{opacity:.5;cursor:default}button:focus-visible,.entries:focus-visible{outline:2px solid var(--f-brand);outline-offset:-2px}
  .entries{height:200px;overflow:auto;overscroll-behavior:contain;min-height:60px}article{padding:8px 12px;border-bottom:1px solid var(--f-border);border-left:3px solid transparent}article[data-level=error]{border-left-color:#dc2626;background:color-mix(in srgb,#dc2626 8%,var(--f-panel))}article[data-level=warning]{border-left-color:#b45309;background:color-mix(in srgb,#f59e0b 8%,var(--f-panel))}.meta{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--f-muted)}time{font-variant-numeric:tabular-nums}.meta b{color:var(--f-text)}[data-level=error] .meta b{color:#dc2626}.origin{padding:1px 4px;border-radius:3px;background:color-mix(in srgb,var(--f-brand) 12%,var(--f-panel));color:var(--f-text)}.origin[data-environment=server]{background:color-mix(in srgb,#8b5cf6 18%,var(--f-panel))}.node-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}p{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}.empty{padding:14px;color:var(--f-muted)}footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 12px;color:var(--f-muted);font-size:10px;border-top:1px solid var(--f-border)}
</style>
