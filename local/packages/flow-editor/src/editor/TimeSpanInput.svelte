<script>
  import {createEventDispatcher} from 'svelte';
  import {parseScalar} from '@adam-flow/core/flow-core/index.js';
  import {formatDuration,parseDuration} from './duration-value.js';
  export let id=undefined;
  export let value;
  export let disabled=false;
  export let validateValue=true;
  export let label='Dauer';
  let seen,raw='',error='';
  const dispatch=createEventDispatcher();
  $: if(value!==seen){
    seen=value;
    try{raw=formatDuration(value);error='';}catch{raw='';error='Dauer erforderlich.';}
  }
  function update(text,ticks=false){
    let next;
    try{next=ticks?parseScalar('core.TimeSpan',text):parseDuration(text);error='';}
    catch{next=ticks?text:`duration:${text}`;error='Gültige Dauer innerhalb des TimeSpan-Wertebereichs eingeben.';}
    if(ticks){try{raw=formatDuration(next);}catch{raw='';}}
    else raw=text;
    seen=next;dispatch('value',next);
  }
</script>

<div class="duration">
  <input {id} type="text" value={raw} {disabled} aria-label={label} aria-invalid={validateValue&&!!error} placeholder="-2.03:04:05.1234567" on:input={event=>update(event.target.value)} />
  <span>[-][Tage.]hh:mm:ss[.fffffff]</span>
  <details><summary>Ticks (100 ns)</summary><input type="text" value={value??''} {disabled} aria-label={`${label}: Ticks`} on:input={event=>update(event.target.value,true)} /></details>
  {#if validateValue&&error}<small role="status">{error}</small>{/if}
</div>

<style>
  .duration{min-width:0;width:100%;font-size:11px;}
  input{box-sizing:border-box;width:100%;min-width:0;background:var(--f-panel,#fff);color:var(--f-text,#1f2937);border:1px solid var(--f-border,#d1d5db);border-radius:4px;padding:5px 6px;font:inherit;}
  span,summary{color:var(--f-muted,#6b7280);font-size:10px;}
  details{margin-top:4px;}summary{cursor:pointer;}details input{margin-top:4px;}
  input[aria-invalid=true]{border-color:#dc2626;}
  small{display:block;color:#dc2626;font-size:10px;margin-top:4px;}
</style>
