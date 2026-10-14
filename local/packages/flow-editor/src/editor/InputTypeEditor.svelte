<script>
  import {createEventDispatcher} from 'svelte';
  export let type={kind:'string'};
  export let allowOptional=false;
  export let disabled=false;
  const dispatch=createEventDispatcher();
  $: optional=type.kind==='optional';
  $: present=optional?type.inner:type;
  $: nullable=present.kind==='nullable';
  $: base=nullable?present.inner:present;
  const choices=[['string','Text'],['core.Bool','Ja/Nein'],['core.Integer','Ganzzahl'],['core.Decimal','Dezimalzahl'],['core.Guid','Guid'],['core.DateTimeOffset','Datum/Uhrzeit'],['core.TimeSpan','Dauer'],['array','Liste'],['dictionary','Dictionary'],['object','Record'],['graph','Graph']];
  function emit(baseType,isOptional=optional,isNullable=nullable){let next=isNullable?{kind:'nullable',inner:baseType}:baseType;if(isOptional)next={kind:'optional',inner:next};dispatch('type',next);}
  function select(name){emit(name.startsWith('core.')?{kind:'scalar',name}:(name==='array'||name==='dictionary')?{kind:name,items:{kind:'string'}}:name==='object'?{kind:'object',fields:{feld:{kind:'string'}}}:name==='graph'?{kind:'graph',signature:{inputs:[],outputs:[],control:{input:false,output:false}}}:{kind:name});}
  function graphPort(direction,id,changes){
    const ports=base.signature[direction];
    if(changes.name!==undefined&&(!changes.name.trim()||ports.some(port=>port.nodeId!==id&&port.name===changes.name)))return;
    emit({...base,signature:{...base.signature,[direction]:ports.map(port=>port.nodeId===id?{...port,...changes}:port)}});
  }
  function addGraphPort(direction){const ports=base.signature[direction];let index=1;while(ports.some(port=>port.name===`value${index}`))index++;emit({...base,signature:{...base.signature,[direction]:[...ports,{name:`value${index}`,nodeId:`parameter_${crypto.randomUUID()}`,type:{kind:'string'}}]}});}
  function removeGraphPort(direction,id){emit({...base,signature:{...base.signature,[direction]:base.signature[direction].filter(port=>port.nodeId!==id)}});}
  function graphControl(direction,value){emit({...base,signature:{...base.signature,control:{...base.signature.control,[direction]:value}}});}
  function setField(key,value){emit({...base,fields:{...base.fields,[key]:value}});}
  function rename(key,name){if(!name.trim()||name!==key&&Object.hasOwn(base.fields,name))return;emit({...base,fields:Object.fromEntries(Object.entries(base.fields).map(([k,v])=>[k===key?name:k,v]))});}
  function add(){let index=1;while(Object.hasOwn(base.fields,`feld${index}`))index++;setField(`feld${index}`,{kind:'string'});}
  function remove(key){emit({...base,fields:Object.fromEntries(Object.entries(base.fields).filter(([name])=>name!==key))});}
</script>
<div class="type-editor">
  <select aria-label="Eingabetyp" {disabled} value={base.kind==='scalar'?base.name:base.kind} on:change={event=>select(event.target.value)}>{#each choices as [id,label]}<option value={id}>{label}</option>{/each}</select>
  <label><input type="checkbox" {disabled} checked={nullable} on:change={event=>emit(base,optional,event.target.checked)}/> null erlauben</label>
  {#if allowOptional}<label><input type="checkbox" {disabled} checked={optional} on:change={event=>emit(base,event.target.checked,nullable)}/> Optional</label>{/if}
  {#if base.kind==='array'||base.kind==='dictionary'}<div class="nested"><span>{base.kind==='dictionary'?'Wert (Schlüssel: Text)':'Listenelement'}</span><svelte:self type={base.items} {disabled} on:type={event=>emit({...base,items:event.detail})}/></div>{/if}
  {#if base.kind==='graph'}
    <label><input type="checkbox" {disabled} checked={base.signature.control.input} on:change={event=>graphControl('input',event.target.checked)}/> Graph: Kontroll-Eingang</label>
    <label><input type="checkbox" {disabled} checked={base.signature.control.output} on:change={event=>graphControl('output',event.target.checked)}/> Graph: Kontroll-Ausgang</label>
    {#each ['inputs','outputs'] as direction}<div class="nested"><strong>{direction==='inputs'?'Graph-Eingaben':'Graph-Ausgaben'}</strong>
      {#each base.signature[direction] as parameter (parameter.nodeId)}<div class="nested">
        <input aria-label={direction==='inputs'?'Graph-Eingabename':'Graph-Ausgabename'} {disabled} value={parameter.name} on:change={event=>graphPort(direction,parameter.nodeId,{name:event.target.value})}/>
        <button {disabled} on:click={()=>removeGraphPort(direction,parameter.nodeId)}>Parameter entfernen</button>
        <svelte:self type={parameter.type} allowOptional {disabled} on:type={event=>graphPort(direction,parameter.nodeId,{type:event.detail})}/>
      </div>{/each}
      <button {disabled} on:click={()=>addGraphPort(direction)}>{direction==='inputs'?'Graph-Eingabe hinzufügen':'Graph-Ausgabe hinzufügen'}</button>
    </div>{/each}
  {/if}
  {#if base.kind==='object'}
    {#each Object.entries(base.fields) as [name,field] (name)}<div class="nested"><input aria-label="Feldname" {disabled} value={name} on:change={event=>rename(name,event.target.value)}/><button {disabled} on:click={()=>remove(name)}>Feld entfernen</button><svelte:self type={field} allowOptional {disabled} on:type={event=>setField(name,event.detail)}/></div>{/each}
    <button {disabled} on:click={add}>Feld hinzufügen</button>
  {/if}
</div>
<style>
  .type-editor{display:flex;flex-direction:column;gap:6px;min-width:0}
  .nested{border-left:2px solid var(--f-border,#ddd);padding-left:8px}
  input,select,button{font:inherit;color:var(--f-text,var(--w-text,inherit));max-width:100%;box-sizing:border-box}
  input:not([type=checkbox]),select,button{background:var(--f-bg,var(--w-panel,#fff));border:1px solid var(--f-border,var(--w-border,#ddd));border-radius:4px;padding:5px 7px}
  input:not([type=checkbox]),select{width:100%;min-width:0}
  button{cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  input[type=checkbox]{accent-color:var(--f-brand,var(--w-brand));margin:0}
  input:focus-visible,select:focus-visible,button:focus-visible{outline:2px solid var(--f-brand,var(--w-brand));outline-offset:2px}
  label{font-size:12px}
</style>
