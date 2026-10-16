<script>
  import {createEventDispatcher} from 'svelte';
  import {summarizePerformance,performanceDuration as duration,percentile} from './performance.js';
  export let statistics;
  export let graphName='Flow';
  export let profiling=false;
  export let events=[];
  export let running=false;
  export let history=[];
  export let names={};
  export let embedded=false;
  const dispatch=createEventDispatcher();
  $: report=summarizePerformance(events);
  $: hotNodes=[...report.rows].sort((a,b)=>(b.selfMs+b.overheadMs)-(a.selfMs+a.overheadMs)).slice(0,12);
  $: maxNodeTime=Math.max(0.001,...hotNodes.map(row=>row.selfMs+row.overheadMs));
  $: totals=report.rows.reduce((sum,row)=>({self:sum.self+row.selfMs,overhead:sum.overhead+row.overheadMs}),{self:0,overhead:0});
  $: completed=history.filter(run=>run.state==='completed');
  $: times=completed.map(run=>run.durationMs);
  const phases={preflight:'Browser: Vorbereitung',preparation:'Backend: Vorbereitung',runtime:'Browser: Runtime erstellen',http:'HTTP inkl. Serverarbeit',signalr:'SignalR inkl. Serverarbeit',run:'Gesamter Lauf',dispatch:'Backend: Segment-Dispatch'};
  function label(event){return names[`${event.graphId}/${event.nodeId}`]??event.nodeId;}
  function download(){
    const url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),graphName,statistics,history,events},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='flow2-statistics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
</script>
<section class="performance" class:embedded aria-label="Flow-Statistics">
  <header><strong>Statistics</strong><span>{graphName} · {running?'Live':'Aktueller Graph'}</span><button disabled={!statistics&&!events.length} on:click={download}>JSON exportieren</button>{#if !embedded}<button aria-label="Statistics schließen" on:click={()=>dispatch('close')}>×</button>{/if}</header>
  <div class="content">
    {#if statistics}
    <section aria-label="Statische Graph-Statistik">
      <h3>Graph-Struktur <small>Version {statistics.version} · Definition des ausgewählten Graphen</small></h3>
      <div class="metrics">
        <div><b>{statistics.nodeCount}</b><span>Nodes</span></div><div><b>{statistics.connectionCount}</b><span>Verbindungen</span></div>
        <div><b>{statistics.planned?statistics.segments.length:'—'}</b><span>Geplante Segmente</span></div><div><b>{statistics.boundaries??'—'}</b><span>Runtime-Grenzverbindungen</span></div>
        <div><b>{statistics.subgraphs}</b><span>Referenzierte Subgraphen</span></div><div><b>{statistics.skipped??'—'}</b><span>Nicht eingeplante Nodes</span></div>
      </div>
      <p>{statistics.dataConnections} Datenverbindungen · {statistics.controlConnections} Kontrollverbindungen. Subgraphen werden rekursiv einmal gezählt; Nodes und Segmente beziehen sich auf den ausgewählten Graphen.</p>
      {#if statistics.planned}
        <h4>Node-Verteilung im Ausführungsplan</h4>{#if statistics.mode==='hybrid'}<p class="note">Hybrid-Graph: Runtime-Zuordnung gemäß der aktuellen Ausführungseinstellung bzw. dem ausgewählten Aufruf.</p>{/if}
        <div class="composition" role="img" aria-label={`${statistics.browserNodes} Browser-Nodes, ${statistics.serverNodes} Backend-Nodes`}>
          <span class="browser-part" style={`flex:${statistics.browserNodes||0}`} title={`${statistics.browserNodes} Browser-Nodes`}></span><span class="server-part" style={`flex:${statistics.serverNodes||0}`} title={`${statistics.serverNodes} Backend-Nodes`}></span>
        </div><p class="legend"><span>● Browser: {statistics.browserNodes}</span><span class="server-label">● Backend: {statistics.serverNodes}</span></p>
        <details open><summary>Segmentplan</summary><div class="segment-grid">{#each statistics.segments as segment}<article class:server={segment.environment==='server'}><strong>{segment.id}</strong><span>{segment.environment==='server'?'Backend':'Browser'} · {segment.nodeIds.length} Nodes</span><small>Abhängig von: {segment.dependencies.join(', ')||'keinem Segment'}</small><div class="segment-size" style={`width:${100*segment.nodeIds.length/Math.max(1,statistics.plannedNodes)}%`}></div></article>{/each}</div></details>
      {:else}<p class="note">Kein gültiger Ausführungsplan verfügbar. Segmentzahlen und Runtime-Verteilung werden erst nach erfolgreicher Prüfung angezeigt.</p>{#each statistics.diagnostics as diagnostic}<p>{diagnostic.message}</p>{/each}{/if}
      {#if statistics.dynamicCalls}<p class="note">{statistics.dynamicCalls} dynamische Aufruf-/Steuerungsstellen in den bekannten Graphen. Ihre Zielgraphen und Wiederholungen stehen erst zur Laufzeit fest.</p>{/if}
      {#if statistics.missing.length}<p class="note">Fehlende Subgraphen: {statistics.missing.join(', ')}</p>{/if}
    </section>
    {/if}
    <h3>Laufzeitdaten</h3>
    {#if !events.length}<p>{profiling?'Profiling ist aktiv. Den Flow ausführen, um Messwerte zu sammeln.':'In den Ausführungsoptionen „Profiling“ aktivieren und den Flow ausführen.'} Die statischen Daten sind ohne Profiling verfügbar.</p>{:else}
      <p><b>{report.runMs===null?(running?'Läuft …':'Keine Gesamtlaufzeit für diese Ansicht'):duration(report.runMs)}</b> · {report.runMs>0?(report.count*1000/report.runMs).toLocaleString('de-DE',{maximumFractionDigits:2}):'—'} Node-Aufrufe/s (inkl. Warten) · {report.count} Node-Aufrufe · {report.failed} fehlgeschlagen · {report.segments.length} gemessene Segmente</p>
      <p>Plan-Cache: {report.cacheHits} Treffer / {report.cacheMisses} Misses · Boundary-Nutzdaten: {report.outputBytes.toLocaleString('de-DE')} Bytes gesendet / {report.inputBytes.toLocaleString('de-DE')} Bytes gelesen</p>
      <p>Segment-Scheduling: {duration(report.scheduleMs)} · Eingangsverarbeitung: {duration(report.decodeMs)} · Ausgangskodierung: {duration(report.encodeMs)}</p>
      <div class="metrics runtime-metrics"><div><b>{duration(totals.self)}</b><span>Self · Summe Eigenzeit</span></div><div><b>{duration(totals.self+totals.overhead)}</b><span>Self + System · Eigenzeit + Node-Verwaltung</span></div><div><b>{duration(totals.overhead)}</b><span>Node-Verwaltung</span></div></div>
      <p class="note">Diese Summen sind keine Graphlaufzeit. Subgraph- und UI-Wartezeiten sind aus Self herausgerechnet; sonstige I/O-Zeit bleibt enthalten.</p>
      {#if hotNodes.length}<h4>Nodes mit der höchsten Self + System-Zeit</h4><p class="legend"><span>● Eigenzeit</span><span class="system-label">● Node-Verwaltung</span></p>
      <div class="hot-nodes">{#each hotNodes as row}<div class="hot-node"><span title={label(row)}>{label(row)} · {row.environment==='server'?'Backend':'Browser'}</span><div class="hot-track" role="img" aria-label={`${label(row)}: Eigenzeit ${duration(row.selfMs)}, Verwaltung ${duration(row.overheadMs)}`}><i style={`width:${100*row.selfMs/maxNodeTime}%`}></i><i class="system-part" style={`width:${100*row.overheadMs/maxNodeTime}%`}></i></div><b>{duration(row.selfMs+row.overheadMs)}</b></div>{/each}</div>{/if}
      <details open><summary>Vorbereitung und Transport</summary>
        <table><thead><tr><th>Phase</th><th>Dauer</th><th>Details</th></tr></thead><tbody>{#each report.profiled.filter(event=>phases[event.status]) as event}<tr><td>{phases[event.status]}</td><td>{duration(event.durationMs??0)}</td><td>{event.message??''}{#if event.profile?.queueMs!=null} · Sperre abwarten: {duration(event.profile.queueMs)}{/if}{#if event.profile?.resultLockMs!=null} · Ergebnissperre: {duration(event.profile.resultLockMs)}{/if}</td></tr>{/each}</tbody></table>
      </details>
      <details open><summary>Nodes – nach Verwaltungszeit sortiert</summary>
        <table><thead><tr><th>Node / Runtime</th><th>Aufrufe</th><th>Listenelemente</th><th>Subgraph-Aufrufe</th><th>Implementierung¹</th><th>Eigenzeit³</th><th>Subgraphen</th><th>Verwaltung</th><th>UI-Warten²</th><th>p50 / p95 gesamt</th></tr></thead><tbody>{#each report.rows as row}<tr><td title={`${row.graphId} / ${row.nodeId}`}>{label(row)}<small>{row.environment==='server'?'Backend':'Browser'}</small></td><td>{row.count}{row.failed?` (${row.failed} Fehler)`:''}</td><td>{row.inputItems===null?'—':row.inputItems.toLocaleString('de-DE')}</td><td>{row.childCalls}</td><td>{duration(row.implementationMs)}</td><td>{duration(row.selfMs)}</td><td>{duration(row.childMs)}</td><td>{duration(row.overheadMs)}</td><td>{duration(row.waitMs)}</td><td>{duration(percentile(row.durations,.5))} / {duration(percentile(row.durations,.95))}</td></tr>{/each}</tbody></table>
      </details>
      <details><summary>Zeitverlauf innerhalb der Segmente</summary>
        <p>Jedes Segment hat seinen eigenen Zeitursprung. Blau: Implementierung, orange: übrige Node-Zeit. Maximal 200 Aufrufe sichtbar; der Export enthält alle Messwerte.</p>
        {#each report.segments as segment}
          {@const samples=report.samples.filter(event=>event.invocationId===segment.invocationId&&event.segmentId===segment.segmentId&&event.environment===segment.environment)}
          <h4>{segment.environment} · {segment.graphId} · {segment.segmentId} · {duration(segment.durationMs??0)}</h4>
          {#each samples.slice(0,200) as sample}
            <div class="timeline"><span title={label(sample)}>{label(sample)}</span><div class="track"><div class="bar" title={`${duration(sample.profile.offsetMs??0)} → ${duration((sample.profile.offsetMs??0)+(sample.durationMs??0))}`} style={`margin-left:${100*(sample.profile.offsetMs??0)/Math.max(segment.durationMs??1,0.001)}%;width:${100*(sample.durationMs??0)/Math.max(segment.durationMs??1,0.001)}%`}><i style={`width:${100*(sample.profile.implementationMs??0)/Math.max(sample.durationMs??1,0.001)}%`}></i></div></div></div>
          {/each}
        {/each}
      </details>
      <details><summary>Vergleich der letzten {history.length} Läufe mit identischem Graph und Inputs</summary>
        <p>{completed.length} erfolgreich · {history.length-completed.length} fehlgeschlagen/abgebrochen · p50 {duration(percentile(times,.5))} · p95 {duration(percentile(times,.95))}</p>
        <p>Sequentieller Durchsatz: {times.length&&times.reduce((a,b)=>a+b,0)>0?(1000*times.length/times.reduce((a,b)=>a+b,0)).toLocaleString('de-DE',{maximumFractionDigits:2}):'—'} Flows/s. Aus gemessenen Laufzeiten, ohne Pausen zwischen Starts; kein Lasttest. Einschließlich UI-/I/O-Wartezeit.</p>
        <table><thead><tr><th>Lauf</th><th>Status</th><th>Dauer</th><th>Cache Treffer / Misses</th></tr></thead><tbody>{#each history as run,index}<tr><td>{index+1}</td><td>{run.state}</td><td>{duration(run.durationMs)}</td><td>{run.cacheHits} / {run.cacheMisses}</td></tr>{/each}</tbody></table>
      </details>
      <p class="note">¹ Verstrichene Zeit, inklusive I/O und aufgerufener Subgraphen, keine CPU-Zeit. Verwaltung = Node-Gesamtzeit minus Implementierung. Summen über Nodes, Segmente und HTTP können sich überlappen und dürfen nicht zur Graphlaufzeit addiert werden.</p>
      <p class="note">³ Implementierung abzüglich gemessener Subgraph-Aufrufe und UI-Wartezeit. Überlappende Subgraph-Aufrufe werden einmal gezählt. Andere I/O-Wartezeiten bleiben enthalten.</p>
      <p class="note">² Teil der Implementierungszeit: Warten auf die UI-Interaktion einschließlich Dialog-Warteschlange. Andere I/O-Wartezeiten werden derzeit nicht separat erfasst. Profiling und bestehende Debug-Ereignisse verursachen selbst Aufwand. Abgebrochene Segmente können unvollständige Messwerte haben.</p>
    {/if}
  </div>
</section>
<style>
.performance{position:absolute;z-index:4;right:16px;bottom:52px;width:min(1050px,calc(100% - 32px));max-height:calc(100% - 80px);display:flex;flex-direction:column;background:var(--f-panel);color:var(--f-text);border:1px solid var(--f-border);border-radius:8px;box-shadow:0 6px 24px #0002;font-size:12px;touch-action:auto}.performance.embedded{position:relative;inset:auto;width:auto;max-height:none;border:0;border-radius:0;box-shadow:none}header{display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid var(--f-border)}header span{flex:1;color:var(--f-muted)}button{font:inherit;background:transparent;color:inherit;border:1px solid var(--f-border);border-radius:4px;padding:4px 8px;cursor:pointer}.content{overflow:auto;padding:12px;overscroll-behavior:contain}p{line-height:1.5;margin:8px 0}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;margin:8px 0}th,td{text-align:left;padding:6px;border-bottom:1px solid var(--f-border)}th{font-size:11px}small{display:block;color:var(--f-muted)}details{margin-top:14px}summary{cursor:pointer;font-weight:600}.note{color:var(--f-muted);font-size:11px}.timeline{display:flex;gap:8px;align-items:center;height:22px}.timeline>span{width:180px;flex:none;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.track{flex:1;background:color-mix(in srgb,var(--f-brand) 8%,var(--f-panel));height:12px}.bar{background:#df8a22;min-width:1px;height:12px}.bar i{display:block;background:#2581ca;height:12px}h4{font-size:11px;margin:10px 0}

h3{font-size:14px;margin:8px 0}h3 small{font-weight:400;margin-top:4px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin:12px 0}.metrics>div{padding:12px;border:1px solid var(--f-border);border-radius:8px;background:color-mix(in srgb,var(--f-brand) 5%,var(--f-panel))}.metrics b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.metrics span{display:block;color:var(--f-muted);margin-top:4px}.composition{display:flex;height:16px;border-radius:8px;overflow:hidden;background:var(--f-border)}.browser-part,.segment-size{background:#2581ca}.server-part,.server .segment-size{background:#8b5cf6}.legend{display:flex;gap:16px;color:#2581ca}.server-label{color:#8b5cf6}.system-label{color:#df8a22}.segment-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:8px}.segment-grid article{padding:10px;border:1px solid var(--f-border);border-left:3px solid #2581ca;border-radius:6px;overflow-wrap:anywhere}.segment-grid article.server{border-left-color:#8b5cf6}.segment-grid span{display:block;margin:4px 0}.segment-size{height:5px;border-radius:3px;margin-top:8px;min-width:2px}.hot-node{display:grid;grid-template-columns:minmax(100px,220px) minmax(60px,1fr) 85px;align-items:center;gap:8px;padding:5px 0}.hot-node>span{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.hot-node>b{text-align:right;font-variant-numeric:tabular-nums}.hot-track{height:14px;display:flex;background:color-mix(in srgb,var(--f-brand) 5%,var(--f-panel));border-radius:3px;overflow:hidden}.hot-track i{height:100%;background:#2581ca}.hot-track .system-part{background:#df8a22}
</style>
