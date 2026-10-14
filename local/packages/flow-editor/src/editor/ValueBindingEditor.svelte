<script>
  import {createEventDispatcher} from 'svelte';
  import {inputFieldsType} from '@adam-flow/runtime-browser/ui/input-fields.js';
  import {buttonType,optionType,fileType} from '@adam-flow/runtime-browser/nodes/steps.js';
  import InputTypeEditor from './InputTypeEditor.svelte';
  export let binding;
  export let disabled=false;
  const dispatch=createEventDispatcher();
  let error='';
  function update(change){dispatch('value',{...binding,...change});}
  function advanced(source){try{const type=JSON.parse(source);if(!type||typeof type.kind!=='string')throw new Error('Typ benötigt kind.');update({type});error='';}catch(cause){error=String(cause);}}
  $: fields=binding.type.kind==='object'?Object.keys(binding.type.fields):[];
  $: basic=['dictionary','string','scalar','array','object','nullable','optional','graph'].includes(binding.type.kind);
</script>
<div class="binding">
  <strong>Werttyp T</strong>
  {#if binding.operation==='list'}<button type="button" {disabled} on:click={()=>update({type:structuredClone(buttonType)})}>Button als Elementtyp</button><button type="button" {disabled} on:click={()=>update({type:structuredClone(optionType)})}>Option als Elementtyp</button><button type="button" {disabled} on:click={()=>update({type:structuredClone(fileType)})}>Datei als Elementtyp</button><button type="button" {disabled} on:click={()=>update({type:structuredClone(inputFieldsType.items)})}>Feldkonfiguration als Elementtyp</button>{/if}
  {#if basic}<InputTypeEditor type={binding.type} allowOptional {disabled} on:type={event=>update({type:event.detail})}/>{/if}
  <details><summary>Typvertrag (JSON)</summary><textarea aria-label="Werttyp als JSON" {disabled} value={JSON.stringify(binding.type,null,2)} on:change={event=>advanced(event.target.value)}></textarea><small>Auch für Entity-, Graph- und native Sammlungstypen.</small></details>
  {#if binding.operation==='zip'}<strong>Elementtyp der rechten Liste</strong><InputTypeEditor type={binding.result??binding.type} {disabled} on:type={event=>update({result:event.detail})}/>{/if}
  {#if binding.operation==='merge'}<strong>Rechter Record-Typ</strong><InputTypeEditor type={binding.result??binding.type} {disabled} on:type={event=>update({result:event.detail})}/><small>Vorhandene rechte Felder überschreiben linke Felder; fehlende optionale Felder bleiben links erhalten. Gemeinsame Feldtypen müssen übereinstimmen.</small>{/if}
  {#if ['getProperty','removeField'].includes(binding.operation)}
    <label>Eigenschaft {#if fields.length}<select {disabled} value={binding.member} on:change={event=>update({member:event.target.value})}>{#each fields as field}<option value={field}>{field}</option>{/each}</select>{:else}<input {disabled} value={binding.member??''} on:change={event=>update({member:event.target.value})}/>{/if}</label>
  {/if}
  {#if binding.operation==='withFields'}<fieldset {disabled}><legend>Zu ersetzende Felder</legend>{#each fields as field}<label><input type="checkbox" checked={(binding.fields??fields).includes(field)} on:change={event=>update({fields:event.target.checked?[...new Set([...(binding.fields??fields),field])]:(binding.fields??fields).filter(item=>item!==field)})}/>{field}</label>{/each}</fieldset>{/if}
  {#if binding.operation==='list'}<label>Anzahl Elemente<input type="number" min="0" max="256" step="1" {disabled} value={binding.count} on:change={event=>update({count:Number(event.target.value)})}/></label>{/if}
  {#if error}<small role="alert">{error}</small>{/if}
</div>
<style>.binding{display:flex;flex-direction:column;gap:6px;padding:8px;font-size:12px}textarea{width:100%;min-height:100px;box-sizing:border-box}label{display:flex;gap:6px;align-items:center}input,select,textarea{font:inherit;min-width:0;max-width:100%}fieldset{display:flex;flex-direction:column}</style>
