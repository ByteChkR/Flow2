<script>
  import {dictionaryShape} from '@adam-flow/core/flow-core/dictionaries.js';
  import {createEventDispatcher} from 'svelte';
  import ScalarInput from './ScalarInput.svelte';
  import {initialValue,replaceField,typeLabel} from './value-model.js';
  import {flowInterface,sameGraphSignature} from '@adam-flow/core/flow-core/index.js';
  export let type;
  export let value=undefined;
  export let disabled=false;
  export let validateValue=true;
  export let label='Wert';
  export let graphs=[];
  export let graphNames={};
  export let catalog;
  const dispatch=createEventDispatcher();
  // CustomEvent turns an undefined detail into null; wrap values to preserve absence.
  function send(next){if(!disabled)dispatch('value',{value:next});}
  function field(key,next){send(replaceField(value,key,next));}
</script>

<div class="value-input">
{#if type.kind==='optional'}
  <label class="toggle"><input type="checkbox" checked={value!==undefined} {disabled} aria-label={`${label}: Wert vorhanden`} on:change={event=>send(event.target.checked?initialValue(type.inner):undefined)} /> Wert vorhanden</label>
  {#if value!==undefined}<svelte:self {validateValue} type={type.inner} {value} {disabled} {label} {graphs} {graphNames} {catalog} on:value={event=>send(event.detail.value)} />{/if}
{:else if type.kind==='nullable'}
  <label class="toggle"><input type="checkbox" checked={value===null} {disabled} aria-label={`${label}: null`} on:change={event=>send(event.target.checked?null:initialValue(type.inner))} /> null</label>
  {#if value!==null}<svelte:self {validateValue} type={type.inner} {value} {disabled} {label} {graphs} {graphNames} {catalog} on:value={event=>send(event.detail.value)} />{/if}
{:else if type.kind==='scalar'&&type.name!=='core.Bool'}
  <ScalarInput {validateValue} scalar={type.name} {value} {disabled} {label} on:value={event=>send(event.detail)} />
{:else if type.kind==='boolean'||(type.kind==='scalar'&&type.name==='core.Bool')}
  <select {disabled} aria-label={label} value={value===undefined?'':String(value)} on:change={event=>send(event.target.value==='true')}><option value="" disabled>Wert wählen</option><option value="true">true</option><option value="false">false</option></select>
{:else if type.kind==='number'}
  <input type="number" step="any" {disabled} aria-label={label} value={value??''} placeholder="Wert erforderlich" on:input={event=>send(event.target.value===''?undefined:event.target.valueAsNumber)} />
{:else if type.kind==='string'}
  <input type="text" {disabled} aria-label={label} value={value??''} placeholder="Wert eingeben" on:input={event=>send(event.target.value)} />
  {#if value===undefined}<button type="button" {disabled} on:click={()=>send('')}>Leeren String setzen</button>{/if}
{:else if type.kind==='object'}
  <div class="record">
    {#each Object.entries(type.fields) as [key,childType]}
      <div class="field"><span>{key} <small>{typeLabel(childType)}</small></span><svelte:self {validateValue} type={childType} value={value?.[key]} {disabled} label={`${label}.${key}`} {graphs} {graphNames} {catalog} on:value={event=>field(key,event.detail.value)} /></div>
    {/each}
    {#if value===undefined}<button type="button" {disabled} on:click={()=>send({})}>Objekt anlegen</button>{/if}
  </div>
{:else if type.kind==='dictionary'}
  <svelte:self {validateValue} type={dictionaryShape(type.items)} {value} {disabled} {label} {graphs} {graphNames} {catalog} on:value={event=>send(event.detail.value)} />
{:else if type.kind==='array'}
  {#if Array.isArray(value)}
    <div class="items">{#each value as item,index}<div class="item"><div class="item-heading"><span>#{index+1}</span><button type="button" {disabled} aria-label={`${label}: Eintrag ${index+1} entfernen`} on:click={()=>send(value.filter((_,i)=>i!==index))}>×</button></div><svelte:self {validateValue} type={type.items} value={item} {disabled} label={`${label}[${index}]`} {graphs} {graphNames} {catalog} on:value={event=>send(value.map((old,i)=>i===index?event.detail.value:old))} /></div>{/each}</div>
    <button type="button" {disabled} on:click={()=>send([...value,initialValue(type.items)])}>＋ Eintrag</button>
  {:else}<button type="button" {disabled} on:click={()=>send([])}>Liste anlegen</button>{/if}
{:else if type.kind==='graph'}
  <select {disabled} aria-label={label} value={value?.graphId??''} on:change={event=>{const graph=graphs.find(item=>item.id===event.target.value);if(graph)send({graphId:graph.id,revision:graph.version});}}><option value="" disabled>Graph wählen</option>{#each graphs.filter(graph=>catalog&&sameGraphSignature(flowInterface(graph,catalog),type.signature)) as graph}<option value={graph.id}>{graphNames[graph.id]||graph.id}</option>{/each}</select>
{:else if type.kind==='entityRef'}
  <small>{type.name}</small><input type="text" {disabled} aria-label={`${label}: ID`} value={value?.id??''} placeholder="Entity-ID" on:input={event=>send({type:type.name,id:event.target.value})} />
{:else if type.kind==='null'}
  <button type="button" {disabled} on:click={()=>send(null)}>{value===null?'null gesetzt':'null setzen'}</button>
{:else}<small>Native Werte werden innerhalb des Backends bereitgestellt.</small>{/if}
</div>

<style>
  .value-input{min-width:0;display:flex;flex-direction:column;gap:5px;font-size:12px;}
  input,select,button{box-sizing:border-box;min-width:0;max-width:100%;font:inherit;color:var(--f-text,#1f2937);background:var(--f-panel,#fff);border:1px solid var(--f-border,#d1d5db);border-radius:4px;padding:5px 7px;}
  input,select{width:100%;}input[type=checkbox]{width:auto;}
  button{cursor:pointer;}button:disabled{cursor:default;opacity:.5;}
  .toggle{display:flex;align-items:center;gap:6px;}
  .record,.items{display:flex;flex-direction:column;gap:8px;}
  .field,.item{border-left:2px solid var(--f-border,#d1d5db);padding-left:8px;min-width:0;}
  .field>span{display:block;margin-bottom:4px;overflow-wrap:anywhere;}
  small,.item-heading{font-size:10px;color:var(--f-muted,#6b7280);}
  .item-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;}.item-heading button{padding:0 5px;}
</style>
