<script>
 import {onMount,onDestroy} from 'svelte';
 import LoadingAnimation from '../host/LoadingAnimation.svelte';
 export let progress;
 let dialog,now=Date.now(),timer;
 const labels={queued:'Ausstehend',checking:'Wird geprüft',cached:'Prüfergebnis wiederverwendet',valid:'Gültig',invalid:'Fehler gefunden'};
 $: elapsed=Math.max(0,Math.floor((now-Date.parse(progress.startedAt))/1000));
 $: responseAge=progress.receivedAt?Math.max(0,Math.floor((now-progress.receivedAt)/1000)):null;
 $: unchanged=progress.changedAt&&progress.sampledAt?Math.max(0,Math.floor((Date.parse(progress.sampledAt)-Date.parse(progress.changedAt))/1000)+(responseAge??0)):0;
 $: completed=progress.graphs.filter(g=>['valid','invalid','cached'].includes(g.state)).length;
 onMount(()=>{dialog.showModal();timer=setInterval(()=>now=Date.now(),250);});
 onDestroy(()=>clearInterval(timer));
</script>
<dialog bind:this={dialog} aria-label="Validierungsfortschritt" on:cancel|preventDefault>
 <header><LoadingAnimation width={36} height={36}/><div><h2>Flows werden geprüft</h2><span>Seit {Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')} Minuten</span></div></header>
 <p role="status">{progress.phase}</p>
 {#if responseAge!==null}
  <p class="heartbeat">Letzte Backend-Antwort vor {responseAge} s · {progress.finishedAt?'Prüfauftrag beendet; Ergebnis wird übertragen':responseAge<6&&!progress.connectionWarning?'Backend erreichbar · Prüfauftrag noch offen':'Backend-Erreichbarkeit momentan unklar'}</p>
  {#if unchanged>=15&&!progress.finishedAt}<p class="stalled" role="status">Seit {unchanged} s kein neuer Prüffortschritt. Der aktuelle Schritt kann noch arbeiten oder warten; die Erreichbarkeit allein bestätigt keinen Fortschritt.</p>{/if}
 {/if}
 {#if progress.graphs.length}<div class="counts">{completed} von {progress.graphs.length} Graphen abgeschlossen</div><progress max={progress.graphs.length} value={completed} aria-label="Abgeschlossene Graphen"/>{/if}
 {#if progress.detail}<p class="detail">Abhängigkeit: {progress.detail.replace(/ · (checking|cached|valid|invalid)$/,(_,state)=>' · '+labels[state])}</p>{/if}
 {#if progress.connectionWarning}<p>Fortschritt momentan nicht erreichbar. Die Antwort der Validierung wird weiterhin abgewartet.</p>{/if}
 <ul>{#each progress.graphs as graph (graph.id)}<li class:checking={graph.state==='checking'} class:invalid={graph.state==='invalid'}><div><strong>{graph.name}</strong>{#if graph.name!==graph.id}<small>{graph.id}</small>{/if}</div><span>{labels[graph.state]??graph.state}</span></li>{/each}</ul>
 <footer>Nach Abschluss wird dieses Fenster automatisch geschlossen.</footer>
</dialog>
<style>
 dialog{width:740px;max-width:90vw;max-height:85vh;box-sizing:border-box;border:1px solid var(--w-border,#ccc);border-radius:8px;background:var(--w-panel,#fff);color:var(--w-text,inherit);padding:22px}dialog::backdrop{background:#0006}header{display:flex;align-items:center;gap:14px}h2{font-size:18px;margin:0 0 5px}header span,small,footer,.counts,.detail,.heartbeat{font-size:12px;opacity:.75}progress{width:100%;height:9px;accent-color:var(--w-accent,#16866e)}ul{padding:0;list-style:none;max-height:45vh;overflow:auto}li{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:10px;border-bottom:1px solid var(--w-border,#ddd)}li>div{min-width:0}strong,small{display:block;overflow-wrap:anywhere}li>span{font-size:12px;flex-shrink:0}.checking{background:#16866e18}.invalid{color:#c24132}footer{margin-top:16px}.detail{overflow-wrap:anywhere}.stalled{padding:10px;border-left:3px solid #c18b24;background:#c18b2414;font-size:13px;line-height:1.5}
</style>
