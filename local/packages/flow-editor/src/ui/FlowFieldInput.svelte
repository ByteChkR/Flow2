<script>
 import {createEventDispatcher} from 'svelte';
 import ValueInput from '../editor/ValueInput.svelte';
 import HtmlInput from '../editor/HtmlInput.svelte';
 import {initialValue} from '../editor/value-model.js';
 import {inputFieldError,parseFieldValue} from '@adam-flow/runtime-browser/ui/input-fields.js';
 export let type;export let value;export let options={};export let disabled=false;export let showErrors=true;
 const dispatch=createEventDispatcher();
 $: label=options.label??'Wert';
 $: error=showErrors?inputFieldError(type,value,options):'';
 function send(value){if(!disabled)dispatch('value',{value});}
 $: custom=options.editor==='html'||options.editor==='dropdown';
 $: index=options.editor==='dropdown'?(options.options??[]).findIndex(option=>Object.is(parseFieldValue(type,option.value),value)):-1;
</script>
{#if custom&&type.kind==='optional'}
 <label><input type="checkbox" {disabled} checked={value!==undefined} aria-label={`${label}: Wert vorhanden`} on:change={event=>send(event.target.checked?initialValue(type.inner):undefined)}/>Wert vorhanden</label>
 {#if value!==undefined}<svelte:self type={type.inner} {value} {options} {disabled} showErrors={false} on:value={event=>send(event.detail.value)}/>{/if}
{:else if custom&&type.kind==='nullable'}
 <label><input type="checkbox" {disabled} checked={value===null} aria-label={`${label}: null`} on:change={event=>send(event.target.checked?null:initialValue(type.inner))}/>null</label>
 {#if value!==null}<svelte:self type={type.inner} {value} {options} {disabled} showErrors={false} on:value={event=>send(event.detail.value)}/>{/if}
{:else if options.editor==='html'}
 <HtmlInput {value} {disabled} {label} on:value={event=>send(event.detail)}/>
{:else if options.editor==='dropdown'}
 <select {disabled} aria-label={label} aria-invalid={!!error} value={index} on:change={event=>send(parseFieldValue(type,options.options[Number(event.target.value)].value))}>
  <option value={-1} disabled>{value===undefined?'Bitte wählen':`${String(value)} (nicht verfügbar)`}</option>
  {#each options.options??[] as option,i}<option value={i}>{option.label}</option>{/each}
 </select>
{:else}<ValueInput {type} {value} {disabled} {label} on:value={event=>send(event.detail.value)}/>{/if}
{#if error}<small role="status" class="error">{error}</small>{/if}
<style>select{width:100%;font:inherit;padding:6px;border:1px solid #aaa;border-radius:4px}.error{display:block;color:#b91c1c}label{display:flex;gap:6px;align-items:center}select[aria-invalid=true]{border-color:#b91c1c}</style>
