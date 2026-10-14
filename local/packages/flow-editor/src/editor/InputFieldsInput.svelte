<script>
 import {createEventDispatcher} from 'svelte';
 import {baseType} from '@adam-flow/runtime-browser/ui/input-fields.js';
 export let value='[]';export let type;export let disabled=false;
 const dispatch=createEventDispatcher();let fields=[],error='';
 $: names=type.kind==='object'?Object.keys(type.fields):[];
 $: {try{fields=JSON.parse(value);if(!Array.isArray(fields))throw new Error();error='';}catch{fields=[];error='Ungültige Feldkonfiguration.';}}
 function send(next){dispatch('value',JSON.stringify(next));}
 function update(index,key,value){send(fields.map((field,i)=>{if(i!==index)return field;const next={...field};if(value===undefined)delete next[key];else next[key]=value;if(key==='editor'){if(value==='dropdown')next.options??=[];else delete next.options;}return next;}));}
 function option(index,optionIndex,key,value){update(index,'options',fields[index].options.map((item,i)=>i===optionIndex?{...item,[key]:value}:item));}
</script>
<div class="fields">
 {#if error}<small role="alert">{error}</small>{/if}
 {#if !fields.length}<small>Beschriftungen und Pflichtfelder werden aus dem Datenvertrag abgeleitet.</small>{/if}
 {#each fields as field,index}{@const fieldType=type.fields[field.field]}{@const base=fieldType?baseType(fieldType):null}
 <details><summary>{field.label||field.field}</summary><fieldset {disabled}>
  <label>Feld<select aria-label={`Feld ${index+1}: Feld`} value={field.field} on:change={event=>update(index,'field',event.target.value)}>{#if !names.includes(field.field)}<option>{field.field}</option>{/if}{#each names.filter(name=>name===field.field||!fields.some(f=>f.field===name)) as name}<option>{name}</option>{/each}</select></label>
  <label>Beschriftung<input aria-label={`Feld ${index+1}: Beschriftung`} value={field.label??''} placeholder={field.field} on:input={event=>update(index,'label',event.target.value||undefined)}/></label>
  <label>Hilfetext<textarea aria-label={`Feld ${index+1}: Hilfetext`} value={field.helpText??''} on:input={event=>update(index,'helpText',event.target.value||undefined)}></textarea></label>
  <label><input type="checkbox" checked={field.required??!['optional','nullable'].includes(fieldType?.kind)} on:change={event=>update(index,'required',event.target.checked)}/>Pflichtfeld</label>
  <label>Editor<select aria-label={`Feld ${index+1}: Editor`} value={field.editor??'value'} on:change={event=>update(index,'editor',event.target.value)}><option value="value">Typisierte Eingabe</option>{#if base&&['string','number','boolean','scalar'].includes(base.kind)}<option value="dropdown">Dropdown</option>{/if}{#if base?.kind==='string'}<option value="html">HTML (Monaco / TinyMCE)</option>{/if}</select></label>
  {#if base?.kind==='number'||base?.kind==='scalar'&&['core.Integer','core.Decimal','core.TimeSpan','core.DateTimeOffset'].includes(base.name)}
   {#each [['min','Minimum'],['max','Maximum']] as [key,label]}<label>{label}<input aria-label={`Feld ${index+1}: ${label}`} value={field[key]??''} on:input={event=>update(index,key,event.target.value||undefined)}/></label>{/each}
  {/if}
  {#if ['string','array'].includes(base?.kind)}
   {#each [['minLength','Minimale Länge'],['maxLength','Maximale Länge']] as [key,label]}<label>{label}<input type="number" min="0" step="1" aria-label={`Feld ${index+1}: ${label}`} value={field[key]??''} on:input={event=>update(index,key,event.target.value===''?undefined:Number(event.target.value))}/></label>{/each}
  {/if}
  {#if field.editor==='dropdown'}
   {#each field.options??[] as item,i}<div class="option"><label>Wert<input aria-label={`Feld ${index+1}: Option ${i+1} Wert`} value={item.value} on:input={event=>option(index,i,'value',event.target.value)}/></label><label>Beschriftung<input aria-label={`Feld ${index+1}: Option ${i+1} Beschriftung`} value={item.label} on:input={event=>option(index,i,'label',event.target.value)}/></label><button on:click={()=>update(index,'options',field.options.filter((_,n)=>n!==i))}>Option entfernen</button></div>{/each}
   <button on:click={()=>update(index,'options',[...(field.options??[]),{value:'',label:''}])}>+ Option</button>
  {/if}
  <button on:click={()=>send(fields.filter((_,i)=>i!==index))}>Feld auf Standard zurücksetzen</button>
 </fieldset></details>{/each}
 {#if names.some(name=>!fields.some(f=>f.field===name))}<button {disabled} on:click={()=>send([...fields,{field:names.find(name=>!fields.some(f=>f.field===name))}])}>+ Feld konfigurieren</button>{/if}
 <small>Ein verbundener Eingang „Feldkonfiguration“ überschreibt diese Einstellungen. Nicht konfigurierte Felder behalten ihre Standarddarstellung.</small>
</div>
<style>.fields{display:flex;flex-direction:column;gap:6px}details{border:1px solid var(--f-border,#ccc);padding:5px}fieldset{border:0;padding:4px;min-width:0}label{display:flex;gap:5px;align-items:center;margin-bottom:5px;font-size:12px}input:not([type=checkbox]),select,textarea{width:100%;min-width:0}button,input,select,textarea{font:inherit;padding:4px;border:1px solid var(--f-border,#ccc);border-radius:4px;background:var(--f-panel,white);color:inherit}.option{border:1px solid var(--f-border,#ccc);padding:5px;margin-bottom:5px}small{font-size:11px;color:var(--f-muted,#666)}</style>
