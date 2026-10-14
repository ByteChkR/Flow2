<script>
 import {typeLabel} from './value-model.js';
 import {exactPortMatch} from './inline-graphs.js';
 export let expected;export let actual;export let graphName;export let port;
 function rows(direction){
  const wanted=expected[direction],provided=actual[direction];
  return [...wanted.map(parameter=>({name:parameter.name,expected:parameter,actual:provided.find(p=>p.name===parameter.name)})),...provided.filter(p=>!wanted.some(e=>e.name===p.name)).map(parameter=>({name:parameter.name,actual:parameter}))];
 }
 function status(row,direction){
  if(!row.expected)return direction==='inputs'?'Zusätzliche Eingabe':'Zusätzliche Ausgabe';
  if(!row.actual)return direction==='inputs'?'Eingabe fehlt':'Ausgabe fehlt';
  return exactPortMatch(row.expected,row.actual)?'Passt':'Typ weicht ab';
 }
</script>
<p><strong>{graphName}</strong> passt nicht zum Graph-Eingang <strong>{port}</strong>.</p>
{#each [['inputs','Eingaben'],['outputs','Ausgaben']] as [direction,label]}
 <section aria-label={label}>
  <h3>{label}</h3>
  {#if !rows(direction).length}<p class="empty">Keine erwartet oder vorhanden.</p>{:else}
   <div class="table-scroll"><table><thead><tr><th>Parameter</th><th>Erwartet</th><th>Gewählter Graph</th><th>Abweichung</th></tr></thead><tbody>
    {#each rows(direction) as row}
     {@const result=status(row,direction)}
     <tr class:mismatch={result!=='Passt'}><th scope="row"><code>{row.name}</code></th><td>{row.expected?typeLabel(row.expected.type):'—'}</td><td>{row.actual?typeLabel(row.actual.type):'—'}</td><td><span class:matching={result==='Passt'}>{result}</span>{#if result==='Typ weicht ab'}<details><summary>Typdetails</summary><strong>Erwartet</strong><pre>{JSON.stringify(row.expected.type,null,2)}</pre><strong>Gewählter Graph</strong><pre>{JSON.stringify(row.actual.type,null,2)}</pre></details>{/if}</td></tr>
    {/each}
   </tbody></table></div>
  {/if}
 </section>
{/each}
<section aria-label="Kontrollfluss"><h3>Kontrollfluss</h3><div class="table-scroll"><table><thead><tr><th>Anschluss</th><th>Erwartet</th><th>Gewählter Graph</th><th>Abweichung</th></tr></thead><tbody>{#each [['input','Ablauf-Eingang'],['output','Ablauf-Ausgang']] as [key,label]}<tr class:mismatch={expected.control[key]!==actual.control[key]}><th scope="row">{label}</th><td>{expected.control[key]?'Ja':'Nein'}</td><td>{actual.control[key]?'Ja':'Nein'}</td><td>{expected.control[key]===actual.control[key]?'Passt':expected.control[key]?'Anschluss fehlt':'Zusätzlicher Anschluss'}</td></tr>{/each}</tbody></table></div></section>
<div class="explanation"><strong>Mit einem Inline-Wrapper fortfahren</strong><p>Der Wrapper erhält die erwartete Schnittstelle und ruft den gewählten Graphen auf. Nur exakt gleiche Namen und Typen werden automatisch verbunden. Fehlende Verbindungen musst du anschließend im Editor ergänzen. Parameter werden nicht umbenannt.</p></div>
<style>
 p{margin:0 0 16px;line-height:1.5;overflow-wrap:anywhere}h3{font-size:14px;margin:18px 0 8px}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}th,td{padding:9px 10px;border-bottom:1px solid var(--w-border,#ddd);vertical-align:top;overflow-wrap:anywhere}thead{background:var(--w-background,#f4f5f7)}thead th{font-weight:500}tr.mismatch{background:#eaa32312}tr.mismatch td:last-child{color:var(--w-warning,#965b00);font-weight:600}.matching,.empty{opacity:.65}.empty{font-size:13px}code{font:inherit}details{font-weight:400;margin-top:5px;color:inherit}summary{cursor:pointer}pre{font-size:11px;white-space:pre-wrap;max-width:300px}.explanation{margin-top:20px;padding:14px;border:1px solid var(--w-border,#ddd);border-radius:6px;background:var(--w-background,#f4f5f7);font-size:13px}.explanation p{margin:6px 0 0}
</style>
