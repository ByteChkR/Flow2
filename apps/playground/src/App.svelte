<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import GraphEditor from './GraphEditor.svelte';
  import type { ExecutionTrace, ExecutionSnapshot, Inspection } from '@adam-flow/runtime-browser';
  import { createWorkspace, examples } from './client.js';
  import type { ContactDto } from './client.js';

  let selected = $state('contact');
  let flowJson = $state(examples[0]!.json);
  let contactId = $state('');
  let displayed = $state<ContactDto>();
  let catalog = $state<Awaited<ReturnType<ReturnType<typeof createWorkspace>['load']>>>();
  let inspection = $state<Inspection>();
  let loading = $state(false), running = $state(false);
  let loadError = $state(''), runError = $state('');
  let events = $state<ExecutionTrace[]>([]);
  let snapshot = $state<ExecutionSnapshot>();
  let controller = $state<AbortController>();
  const workspace = createWorkspace(() => contactId, value => { displayed = value; });
  const statusLabels: Record<string,string> = {created:'Angelegt',running:'Läuft',waiting_for_browser:'Wartet auf Browser',waiting:'Wartet auf Browser',completed:'Abgeschlossen',failed:'Fehlgeschlagen',bound:'Gebunden',transferred:'Übertragen',ready:'Bereitgestellt'};
  const kindLabels: Record<string,string> = {session:'Session',execution:'Ausführung',segment:'Segment',node:'Node',boundary:'JSON-Übergabe'};

  function validate() { inspection = workspace.inspect(flowJson); }
  function changed() { inspection = undefined;resetResult(); }
  function resetResult() { events=[]; snapshot=undefined; displayed=undefined; runError=''; }
  function loadExample() { flowJson=examples.find(example=>example.id===selected)!.json;resetResult();validate(); }
  async function importFile(event: Event) {
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];if(!file) return;
    try { const content=await file.text();if(running) return;flowJson=content;resetResult();validate(); } catch(error) { runError=String(error); }
    input.value='';
  }
  async function reload() {
    loading=true;catalog=undefined;loadError='';inspection=undefined;resetResult();
    try {catalog=await workspace.load();validate();} catch(error) {loadError=String(error);} finally {loading=false;}
  }
  async function run() {
    resetResult();validate();
    if(!inspection?.plan || inspection.diagnostics.length) return;
    running=true;controller=new AbortController();
    try {
      const result=await workspace.run(flowJson,{signal:controller.signal,onProgress:value=>{snapshot=value;},onTrace:event=>{events.push(event);}});
      if(result.error) runError=`${result.error.code} · ${result.error.nodeId ?? 'Session'}: ${result.error.message}`;
    } catch(error) {runError=controller.signal.aborted?'Ausführung abgebrochen. Die Browser-Session wurde zum Schließen freigegeben.':String(error);}
    finally {running=false;controller=undefined;}
  }
  onMount(()=>{void reload();});onDestroy(()=>controller?.abort());
</script>

<svelte:head><title>Adam Flow · Playground</title><meta name="description" content="Flows validieren, ausführen und Schritt für Schritt nachvollziehen" /></svelte:head>
<main>
  <header><span class="brand">ADAM / FLOW</span><span class="badge">Proof of Concept · Editor</span></header>
  <div class="intro"><p class="eyebrow">PLAYGROUND</p><h1>Flows gestalten. Schritte verstehen.</h1><p>Definition prüfen, Contact-ID eingeben und die Ausführung zwischen Browser und Server nachvollziehen.</p></div>
  <details class="card catalog">
    <summary>Node-Katalog · {catalog ? `${catalog.serverCount} Server / ${catalog.browserCount} Browser` : loading ? 'Wird geladen …' : 'Nicht verfügbar'}</summary>
    <button class="secondary" onclick={reload} disabled={loading||running}>Katalog neu laden</button>
    {#if catalog}<ul>{#each catalog.catalog.nodes as node}<li><strong>{node.metadata?.label ?? node.type}</strong><small>{node.type}@{node.version} · {node.metadata?.category ?? 'Weitere'}</small><span>{node.environments.join(' · ')}</span><small>Eingänge: {Object.keys(node.inputs).join(', ')||'–'} · Ausgänge: {Object.keys(node.outputs).join(', ')||'–'}</small></li>{/each}</ul>{/if}
  </details>
  {#if loadError}<div class="error" role="alert">Katalog nicht verfügbar: {loadError} <button onclick={reload}>Erneut laden</button></div>{/if}
  {#if catalog}<GraphEditor json={flowJson} catalog={catalog.catalog} disabled={running||loading} connect={(flow,source,target)=>workspace.connect(flow,source,target)} onchange={flow=>{flowJson=JSON.stringify(flow,null,2);resetResult();validate();}} />{/if}
  <div class="layout">
    <section class="card definition" aria-labelledby="definition-title">
      <h2 id="definition-title">Flow-Definition</h2>
      <div class="examples"><label for="example">Versioniertes Beispiel</label><select id="example" bind:value={selected} disabled={running}><option value="contact">Contact · interaktiv · v1</option><option value="backend">Contact · Backend · v1</option></select><button class="secondary" onclick={loadExample} disabled={running}>Beispiel laden</button></div>
      <label class="file">JSON-Datei öffnen<input type="file" accept=".json,application/json" onchange={importFile} disabled={running} /></label>
      <details><summary>Flow-JSON bearbeiten</summary><label for="flow-json">Flow-JSON</label>
      <textarea id="flow-json" bind:value={flowJson} oninput={changed} disabled={running} spellcheck="false"></textarea></details>
      <label for="contact-id">Browser-Contact-ID</label><input id="contact-id" bind:value={contactId} oninput={resetResult} disabled={running} />
      <p class="hint">Optionaler Testwert für interaktive Flows. Leer lassen, um die Kontakt-ID aus der Node-Konfiguration zu verwenden.</p>
      <div class="actions"><button class="secondary" onclick={validate} disabled={!catalog||running}>Flow prüfen</button><button onclick={run} disabled={!catalog||running}>Flow starten</button>{#if running}<button class="secondary" onclick={()=>controller?.abort()}>Abbrechen</button>{/if}</div>
      {#if inspection}
        {#if inspection.diagnostics.length}<div class="error" role="alert"><strong>{inspection.diagnostics.length} Validierungsfehler</strong><ul>{#each inspection.diagnostics as diagnostic}<li><strong>{diagnostic.code}</strong>: {diagnostic.message}
          {#if diagnostic.node}<dl><dt>Node</dt><dd>{diagnostic.node}</dd>{#if diagnostic.port}<dt>Port</dt><dd>{diagnostic.port}</dd>{/if}<dt>Typ</dt><dd>{diagnostic.type}</dd><dt>Environment</dt><dd>{diagnostic.environment}</dd></dl>{/if}
          <code>{diagnostic.path}</code></li>{/each}</ul></div>
        {:else if inspection.plan}<p class="valid" role="status">{inspection.flow?.id} · v{inspection.flow?.version} · {inspection.flow?.mode} — gültig · {inspection.plan.nodes.length} Nodes · {inspection.plan.segments.length} {inspection.plan.segments.length===1?'Segment':'Segmente'} · {inspection.plan.connections.filter(edge=>edge.boundary).length} JSON-Grenzen</p>{/if}
      {/if}
      {#if inspection?.preview}<details class="generated"><summary>Generiertes JavaScript</summary><pre>{inspection.preview}</pre></details>{/if}
    </section>
    <section class="card execution" aria-labelledby="execution-title">
      <h2 id="execution-title">Ausführung</h2>
      <div class="result" aria-live="polite">
        <strong>{running ? statusLabels[snapshot?.state ?? 'running'] : runError ? 'Fehlgeschlagen / abgebrochen' : snapshot ? statusLabels[snapshot.state] : 'Bereit zum Start'}</strong>
        {#if snapshot}<small>Execution {snapshot.executionId}</small><span>{snapshot.completedSegments.length} {snapshot.completedSegments.length===1?'Segment':'Segmente'} abgeschlossen</span>{/if}
        {#if displayed}<div class="contact"><strong>{displayed.name}</strong><span>{displayed.id}</span>{#if displayed.age!==undefined}<span>Alter: {displayed.age}</span>{/if}</div>{/if}
        {#if runError}<p class="error" role="alert">{runError}</p>{/if}
      </div>
      <h3>Ausführungsverlauf <span class="count">{events.length}</span></h3>
      {#if !events.length}<p class="empty">Nach dem Start erscheinen hier Session, Segmente, Nodes und JSON-Übergaben.</p>{:else}
        <p class="hint">Reihenfolge der Beobachtung. Laufzeiten werden in der jeweiligen Runtime gemessen.</p>
        <ol class="timeline" aria-label="Ausführungsverlauf">{#each events as event (event.id)}
          <li class:failed={event.status==='failed'} class:boundary={event.kind==='boundary'}>
            <div class="event-head"><span class="env">{event.environment==='server'?'Server':'Browser'}</span><strong>{kindLabels[event.kind]} {event.nodeId ?? event.segmentId ?? ''}</strong><span>{statusLabels[event.status] ?? event.status}</span></div>
            {#if event.message}<p>{event.message}</p>{/if}
            <small>{new Date(event.timestamp).toLocaleTimeString('de-DE')}{#if event.durationMs!=null} · {event.durationMs.toFixed(2)} ms{/if}{#if event.connectionIndex!=null} · Verbindung {event.connectionIndex}{/if}</small>
          </li>
        {/each}</ol>
      {/if}
    </section>
  </div>
  <footer>Interaktive Flows sind an diesen Browser gebunden. Verlorene Sessions beenden die Ausführung. Temporärer PoC-Testmechanismus, keine Produktionsauthentifizierung.</footer>
</main>
<style>
  :global(*){box-sizing:border-box} :global(body){margin:0;background:#f4f5f1;color:#22352d;font-family:system-ui,sans-serif} main{max-width:1400px;margin:auto;padding:28px} header{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #d8dfd9;padding-bottom:24px}.brand{font-weight:750;letter-spacing:.12em}.badge,.env{font-size:12px;background:#e8efe8;border-radius:16px;padding:4px 10px}.intro{margin:40px 0 28px;max-width:840px}.eyebrow{letter-spacing:.15em;font-size:12px;color:#537665;font-weight:700}h1{font-size:clamp(30px,4vw,46px);letter-spacing:-.035em;margin:10px 0}.intro p{line-height:1.6;color:#52645a}h2{font-size:19px;margin:0 0 20px}h3{font-size:16px;margin-top:28px}.card{background:white;border:1px solid #d8dfd9;border-radius:12px;padding:24px}.layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:24px;margin-top:24px;align-items:start}.catalog summary{font-weight:650}.catalog button{margin-top:16px}.catalog ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;list-style:none;padding:0}.catalog li{display:flex;flex-direction:column;gap:5px;font-size:13px;overflow-wrap:anywhere}label{display:block;font-size:14px;font-weight:650;margin:16px 0 8px}input,select,textarea{width:100%;padding:10px 12px;border:1px solid #bdcdc2;border-radius:6px;font:inherit;background:white;color:inherit}textarea{font-family:monospace;font-size:12px;line-height:1.55;height:330px;resize:vertical}.examples button{margin-top:10px}.file{font-weight:400}.file input{font-size:12px}.hint,small,footer{color:#627267;font-size:12px;line-height:1.5}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}button{font:inherit;font-size:14px;cursor:pointer;background:#274d3b;color:white;border:1px solid #274d3b;border-radius:6px;padding:10px 16px}button:hover{background:#37634c}.secondary{background:white;color:#274d3b}.secondary:hover{background:#e8efe8}button:disabled,input:disabled,textarea:disabled,select:disabled{opacity:.55;cursor:default}:focus-visible{outline:3px solid #82b595;outline-offset:3px}.valid{font-size:13px;color:#235537;font-weight:600}.error{background:#fff0ed;border:1px solid #efc3b8;border-radius:8px;padding:12px;color:#853f30;font-size:13px;overflow-wrap:anywhere;margin-top:12px}.error ul{padding-left:18px}.error li{margin:12px 0}.error code{font-size:11px}dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:8px 0}dt{font-weight:650}dd{margin:0}.generated{margin-top:20px;font-size:13px}summary{cursor:pointer}pre{overflow:auto;background:#f4f5f1;padding:12px;border-radius:6px;font-size:11px;line-height:1.5}.result{display:flex;flex-direction:column;gap:9px;background:#e8efe8;padding:18px;border-radius:8px;overflow-wrap:anywhere}.result>span{font-size:13px}.contact{display:flex;flex-direction:column;gap:4px;padding-top:12px;border-top:1px solid #cbd7cc}.count{font-size:12px;font-weight:400;color:#627267}.empty{font-size:14px;line-height:1.6;color:#627267}.timeline{list-style:none;padding:0 8px 0 0;margin:16px 0;max-height:720px;overflow-y:auto}.timeline li{border-left:2px solid #bdcdc2;padding:8px 0 14px 16px;margin-left:5px;position:relative}.timeline li:before{content:'';position:absolute;left:-5px;top:16px;width:8px;height:8px;border-radius:50%;background:#537665}.timeline .failed{border-left-color:#a84f3b}.timeline .failed:before{background:#a84f3b}.timeline .boundary{background:#f4f7f3}.event-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px}.event-head>span:last-child{color:#627267}.timeline p{font-size:12px;overflow-wrap:anywhere;margin:8px 0}.timeline small{font-size:11px}footer{margin-top:28px;max-width:860px}@media(max-width:850px){.layout{grid-template-columns:1fr}main{padding:18px}.card{padding:18px}header{align-items:center}.badge{font-size:10px}h1{font-size:32px}}
</style>
