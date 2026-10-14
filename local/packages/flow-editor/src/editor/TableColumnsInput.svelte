<script>
  import {createEventDispatcher} from 'svelte';
  export let value='[]';
  export let type;
  export let disabled=false;
  const dispatch=createEventDispatcher();
  let columns=[],error='';
  $: fields=type.kind==='object'?Object.keys(type.fields):[];
  $: {try{columns=JSON.parse(value);if(!Array.isArray(columns))throw new Error();error='';}catch{columns=[];error='Ungültige Spaltenkonfiguration.';}}
  function send(next){dispatch('value',JSON.stringify(next));}
  function update(index,key,value){send(columns.map((column,i)=>i===index?{...column,[key]:value}:column));}
  function move(index,delta){const next=[...columns];[next[index],next[index+delta]]=[next[index+delta],next[index]];send(next);}
</script>
<div class="columns">
  {#if error}<small role="alert">{error}</small>{/if}
  {#if !columns.length}<small>Alle Felder des Zeilentyps werden angezeigt.</small><button {disabled} on:click={()=>send(fields.map(field=>({field})))}>Spalten konfigurieren</button>{/if}
  {#each columns as column,index}<fieldset {disabled}>
    <label>Feld<select aria-label={`Spalte ${index+1}: Feld`} value={column.field} on:change={event=>update(index,'field',event.target.value)}>{#if !fields.includes(column.field)}<option value={column.field}>{column.field} (nicht im Zeilentyp)</option>{/if}{#each fields.filter(field=>field===column.field||!columns.some(c=>c.field===field)) as field}<option value={field}>{field}</option>{/each}</select></label>
    <label>Beschriftung<input aria-label={`Spalte ${index+1}: Beschriftung`} value={column.label??''} placeholder={column.field} on:input={event=>update(index,'label',event.target.value)}/></label>
    <label>Breite<input type="number" min="60" max="1200" aria-label={`Spalte ${index+1}: Breite`} value={column.width??160} on:change={event=>update(index,'width',Number(event.target.value))}/></label>
    <label><input type="checkbox" checked={column.readonly??false} on:change={event=>update(index,'readonly',event.target.checked)}/>Schreibgeschützt</label>
    <label><input type="checkbox" checked={column.required??false} on:change={event=>update(index,'required',event.target.checked)}/>Pflichtfeld</label>
    <div><button disabled={disabled||index===0} aria-label={`Spalte ${index+1} nach oben`} on:click={()=>move(index,-1)}>↑</button><button disabled={disabled||index===columns.length-1} aria-label={`Spalte ${index+1} nach unten`} on:click={()=>move(index,1)}>↓</button><button on:click={()=>send(columns.filter((_,i)=>i!==index))}>Entfernen</button></div>
  </fieldset>{/each}
  {#if fields.some(field=>!columns.some(c=>c.field===field))}<button {disabled} on:click={()=>send([...columns,{field:fields.find(field=>!columns.some(c=>c.field===field))}])}>+ Spalte</button>{/if}
  {#if columns.length}<button {disabled} on:click={()=>send([])}>Alle Felder automatisch</button>{/if}
  <small>Ein verbundener Spalten-Input überschreibt diese Einstellungen.</small>
</div>
<style>.columns{display:flex;flex-direction:column;gap:6px}fieldset{min-width:0;border:1px solid var(--f-border,#ccc);padding:6px}label{display:flex;align-items:center;gap:5px;font-size:12px;margin-bottom:4px}input:not([type=checkbox]),select{width:100%;min-width:0}button,input,select{font:inherit;padding:4px;border:1px solid var(--f-border,#ccc);border-radius:4px;color:inherit;background:var(--f-panel,white)}small{font-size:11px;color:var(--f-muted,#666)}</style>
