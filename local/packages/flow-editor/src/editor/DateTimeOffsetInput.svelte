<script>
  import {createEventDispatcher} from 'svelte';
  import {isScalarValue,parseScalar} from '@adam-flow/core/flow-core/index.js';
  import {dateParts,dateValue} from './date-value.js';
  export let id;
  export let value;
  export let disabled=false;
  export let validateValue=true;
  export let label='Wert';
  let seen,parts=dateParts(value),iso='';
  const dispatch=createEventDispatcher();
  $: if(value!==seen){seen=value;iso=typeof value==='string'?value:'';parts=dateParts(value);}
  $: invalid=validateValue&&!isScalarValue('core.DateTimeOffset',value);
  function update(part,text){
    parts={...parts,[part]:text};
    iso=dateValue(parts);seen=iso;dispatch('value',iso);
  }
  function updateIso(text){
    iso=text;parts=dateParts(text);
    try{seen=parseScalar('core.DateTimeOffset',text);}catch{seen=text;}
    dispatch('value',seen);
  }
</script>

<div class="date-value">
  <input {id} type="date" value={parts.date} min="0001-01-01" max="9999-12-31" {disabled} aria-label={`${label}: Datum`} aria-invalid={invalid}
    on:input={event=>update('date',event.target.value)} />
  <div class="parts">
    <label><span>Uhrzeit</span><input type="text" value={parts.time} {disabled} aria-label={`${label}: Uhrzeit`} placeholder="12:30:00.1234567" title="Uhrzeit mit bis zu sieben Nachkommastellen" on:input={event=>update('time',event.target.value)} /></label>
    <label><span>UTC-Offset</span><input type="text" value={parts.offset} {disabled} aria-label={`${label}: UTC-Offset`} placeholder="+02:00" on:input={event=>update('offset',event.target.value)} /></label>
  </div>
  <details><summary>ISO-Eingabe</summary><input type="text" value={iso} {disabled} aria-label={`${label}: ISO-Datum`} title={iso} on:input={event=>updateIso(event.target.value)} /></details>
  {#if invalid}<small role="status">Datum, Uhrzeit oder UTC-Offset ungültig.</small>{/if}
</div>

<style>
  .date-value{min-width:0;width:100%;font-size:11px;}
  input{box-sizing:border-box;width:100%;min-width:0;background:var(--f-panel,#fff);color:var(--f-text,#1f2937);border:1px solid var(--f-border,#d1d5db);border-radius:4px;padding:5px 6px;font:inherit;}
  .parts{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:6px;margin-top:6px;}
  label{display:flex;flex-direction:column;gap:3px;}
  span,summary{color:var(--f-muted,#6b7280);font-size:10px;}
  details{margin-top:6px;}summary{cursor:pointer;}details input{margin-top:4px;}
  input:focus-visible{outline:2px solid var(--f-brand,#2563eb);outline-offset:1px;}
  input[aria-invalid=true]{border-color:#dc2626;}
  small{display:block;color:#dc2626;font-size:10px;line-height:1.3;margin-top:4px;}
</style>
