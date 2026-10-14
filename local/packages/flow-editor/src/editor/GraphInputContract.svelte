<script>
 import {typeLabel} from './value-model.js';
 export let issue='';export let name;export let signature;export let value='';export let graphs=[];export let graphNames={};export let inline=false;export let disabled=false;export let canCreate=false;
 export let onSelect;export let onCreate;export let onOpen;export let onRemove;
</script>
<section class="graph-input" aria-label={`${name}: Graph-Eingang`}>
 <strong>{name}{inline?' · Inline':''}</strong>
 <label>Graph<select aria-label={`${name}: Subgraph auswählen`} {disabled} {value} on:change={event=>{onSelect(event.target.value);event.target.value=value;}}><option value="">Graph auswählen …</option>{#if inline}<option value={value}>Inline-Graph</option>{/if}{#each graphs as graph}<option value={graph.id}>{graphNames[graph.id]??graph.id}</option>{/each}</select></label>
 <div class="actions">{#if canCreate&&!inline}<button {disabled} on:click={onCreate}>Inline erstellen</button>{/if}{#if value}<button on:click={onOpen}>Öffnen</button><button {disabled} on:click={onRemove}>Trennen</button>{/if}</div>
 {#if issue}<p role="alert">{issue}</p>{/if}
 <details><summary>Erwartete Schnittstelle</summary>{#each [['inputs','Eingaben'],['outputs','Ergebnisse']] as [direction,label]}<strong>{label}</strong>{#if !signature[direction].length}<small>Keine</small>{/if}{#each signature[direction] as parameter}<div>{parameter.name}: <small>{typeLabel(parameter.type)}</small></div>{/each}{/each}<small>Ablauf: Eingang {signature.control.input?'ja':'nein'} · Ausgang {signature.control.output?'ja':'nein'}</small></details>
</section>
<style>p[role=alert]{color:#b91c1c;margin:0;white-space:normal;overflow-wrap:anywhere}.graph-input{border-top:1px solid var(--w-border,#ddd);padding:8px;display:flex;flex-direction:column;gap:7px;font-size:12px}.actions{display:flex;gap:5px;flex-wrap:wrap}label{display:flex;flex-direction:column;gap:4px}select,button{font:inherit;max-width:100%;padding:4px;color:inherit;background:var(--w-panel,#fff);border:1px solid var(--w-border,#ccc);border-radius:4px}details strong,details small{display:block}details strong{margin-top:5px}</style>
