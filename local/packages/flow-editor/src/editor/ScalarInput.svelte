<script>
  import DateTimeOffsetInput from './DateTimeOffsetInput.svelte';
  import TimeSpanInput from './TimeSpanInput.svelte';
  import {createEventDispatcher} from 'svelte';
  import {parseScalar} from '@adam-flow/core/flow-core/index.js';
  export let id=undefined;
  export let scalar;
  export let value;
  export let disabled=false;
  export let validateValue=true;
  export let label='Wert';
  let focused=false,raw='',error='';
  const dispatch=createEventDispatcher();
  const hints={
    'core.Decimal':'Exakte Dezimalzahl, z. B. 123.45',
    'core.Integer':'Ganzzahl von −2147483648 bis 2147483647',
    'core.DateTimeOffset':'ISO-Datum mit Offset, z. B. 2026-10-10T12:30:00.1234567+02:00',
    'core.TimeSpan':'Dauer in Ticks (100 ns), auch negativ',
    'core.Guid':'Guid, z. B. 01234567-89ab-cdef-0123-456789abcdef',
  };
  $: if(!focused)raw=value===null||value===undefined?'':String(value);
  $: if(!validateValue)error='';else {
    try{parseScalar(scalar,scalar==='core.Bool'?value:scalar==='core.Integer'&&raw.trim()!==''?Number(raw):raw);error='';}
    catch{error=hints[scalar]||'Ungültiger Wert';}
  }
  function change(event){
    raw=event.target.value;
    let next=scalar==='core.Bool'?event.target.checked:scalar==='core.Integer'&&raw.trim()!==''?Number(raw):raw;
    try{next=parseScalar(scalar,next);}catch{next=raw;}
    dispatch('value',next);
  }
</script>

{#if scalar==='core.DateTimeOffset'}
  <DateTimeOffsetInput {validateValue} {id} {value} {disabled} {label} on:value={event=>dispatch('value',event.detail)} />
{:else if scalar==='core.TimeSpan'}
  <TimeSpanInput {validateValue} {id} {value} {disabled} {label} on:value={event=>dispatch('value',event.detail)} />
{:else if scalar==='core.Bool'}
  <input {id} type="checkbox" checked={value===true} {disabled} aria-label={label} on:change={change} />
{:else}
  <input {id} type="text" value={raw} {disabled} aria-label={label} aria-invalid={!!error} title={`${value ?? ''} · ${hints[scalar]}`} placeholder={hints[scalar]}
    inputmode={scalar==='core.Integer'?'numeric':scalar==='core.Decimal'?'decimal':undefined}
    on:focus={()=>focused=true} on:blur={()=>focused=false} on:input={change} />
  {#if error}<small role="status">{error}</small>{/if}
{/if}

<style>
  input{box-sizing:border-box;width:100%;min-width:0;background:var(--f-panel,#fff);color:var(--f-text,#1f2937);border:1px solid var(--f-border,#d1d5db);border-radius:4px;padding:4px 6px;font:inherit;}
  input[type=checkbox]{width:auto;}
  input[aria-invalid=true]{border-color:var(--color-danger,#db6060);}
  small{display:block;color:var(--color-danger,#db6060);font-size:10px;line-height:1.3;margin-top:3px;white-space:normal;}
</style>
