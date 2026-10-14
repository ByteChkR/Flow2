<script>
 import {categoryGroups,matchesCategories} from './categories.js';
 import {deduplicate,diagnosticDetails} from './messages.js';
 export let messages=[];export let navigate;export let canNavigate=()=>true;export let label='Meldungen';
 let open=false,seen='',filters={error:true,warning:true,info:true},copyStatus='';
 let excludedCategories=new Set();
 function toggleCategory(key,enabled){const next=new Set(excludedCategories);if(enabled)next.delete(key);else next.add(key);excludedCategories=next;}
 const labels={error:'Fehler',warning:'Warnungen',info:'Informationen'};
 $: items=deduplicate(messages);
 $: signature=JSON.stringify(items.filter(m=>m.severity==='error').map(m=>m.id));
 $: if(signature!==seen){if(items.some(m=>m.severity==='error'))open=true;seen=signature;}
 $: groups=categoryGroups(items);
 $: visible=items.filter(m=>filters[m.severity]&&matchesCategories(m,groups,excludedCategories));
 $: counts=Object.fromEntries(Object.keys(labels).map(level=>[level,items.filter(m=>m.severity===level).length]));
 async function copy(message){try{await navigator.clipboard.writeText(diagnosticDetails(message));copyStatus='Details kopiert.';}catch{copyStatus='Kopieren nicht möglich. Markiere und kopiere die angezeigten Details.';}}
</script>
{#if items.length}<section class="messages" aria-label={label}>
 <div role={counts.error?'alert':'status'} aria-live="polite" class="summary"><button aria-expanded={open} on:click={()=>open=!open}>{label}: {counts.error} Fehler · {counts.warning} Warnungen · {counts.info} Informationen</button></div>
 {#if open}<div class="filters">{#each Object.entries(labels) as [level,text]}<button type="button" class="filter-pill" aria-pressed={filters[level]} on:click={()=>filters={...filters,[level]:!filters[level]}}>{text} ({counts[level]})</button>{/each}</div>
 <div class="category-filters">{#each groups as group (group.id)}<fieldset><legend>{group.label}</legend>{#each group.values as value (value.key)}<button type="button" class="filter-pill" aria-pressed={!excludedCategories.has(value.key)} on:click={()=>toggleCategory(value.key,excludedCategories.has(value.key))}>{value.label} ({value.count})</button>{/each}</fieldset>{/each}</div>
 <ul>{#each visible as message,index (message.id)}<li data-severity={message.severity}>
 {#if message.groupLabel&&message.groupLabel!==visible[index-1]?.groupLabel}<h3>{message.groupLabel}</h3>{/if}
 <strong>{message.severity==='error'?'Fehler':message.severity==='warning'?'Warnung':'Information'}: {message.title}</strong>
 {#if message.location}<div class="location">{message.location}</div>{/if}
 <p>{message.description}</p>{#if message.cause}<p class="cause">Ursache: <span>{message.cause}</span></p>{/if}{#if message.hint}<p>{message.hint}</p>{/if}
 {#if navigate&&message.target&&canNavigate(message.target)}<button on:click={()=>navigate(message.target)}>Zur Ursache</button>{/if}
 <details><summary>Technische Details</summary><pre>{diagnosticDetails(message)}</pre><button on:click={()=>copy(message)}>Details kopieren</button></details>
 </li>{:else}<li>Keine Meldungen für die gewählten Filter.</li>{/each}</ul><span role="status">{copyStatus}</span>{/if}
</section>{/if}
<style>
.messages{border:1px solid var(--w-border,#bbb);border-radius:6px;background:var(--w-panel,#fff);color:var(--w-text,#222);font:14px system-ui;max-height:45vh;overflow:auto;text-align:left;min-width:0;flex-shrink:0}.summary,.filters{padding:8px 12px}.filters{display:flex;gap:6px;flex-wrap:wrap}.category-filters{padding:0 12px;display:grid;gap:6px}fieldset{border:1px solid var(--w-border,#bbb);border-radius:4px;display:flex;flex-wrap:wrap;gap:6px;min-width:0}legend{font-weight:600}ul{list-style:none;margin:0;padding:0 12px 12px}li{padding:10px;border-left:4px solid var(--w-info,var(--f-brand,#2563eb));border-top:1px solid var(--w-border,#ddd);margin-top:8px}li[data-severity=error]{border-left-color:var(--w-danger,var(--f-danger,#dc2626))}li[data-severity=warning]{border-left-color:var(--w-warning,var(--f-warning,#b45309))}p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere}.location{font-weight:600;margin:4px 0}.cause{font-size:12px}button{font:inherit;cursor:pointer;padding:5px 8px;border:1px solid var(--w-border,#bbb);border-radius:4px;background:transparent;color:inherit}details{margin-top:8px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}button:focus-visible,summary:focus-visible{outline:2px solid var(--w-info,var(--f-brand,#2563eb));outline-offset:2px}

button.filter-pill{border-radius:999px;padding:5px 12px;line-height:1.4;font-weight:500;background:var(--w-panel,#fff);color:var(--w-muted,#666);border-color:var(--w-border,#bbb)}
button.filter-pill[aria-pressed=true]{background:color-mix(in srgb,var(--w-info,var(--f-brand,#2563eb)) 16%,var(--w-panel,#fff));color:var(--w-text,#222);border-color:var(--w-info,var(--f-brand,#2563eb))}
button.filter-pill:hover{border-color:var(--w-info,var(--f-brand,#2563eb));box-shadow:0 0 0 1px var(--w-info,var(--f-brand,#2563eb))}
</style>
