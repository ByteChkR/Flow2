<script>
  import {createEventDispatcher} from 'svelte';
  import {isPrimitiveInput} from '@adam-flow/core/flow-core/inline-inputs.js';
  import {initialValue} from './value-model.js';
  import TemplateInput from './TemplateInput.svelte';
  import HtmlInput from './HtmlInput.svelte';
  import ValueInput from './ValueInput.svelte';
  export let node;
  export let definition;
  export let connections=[];
  export let disabled=false;
  export let visiblePorts=null;
  const dispatch=createEventDispatcher();
  $: ports=Object.entries(definition.inputs).filter(([port,type])=>(!visiblePorts||visiblePorts.includes(port))&&isPrimitiveInput(type));
  function presentType(type){return type.kind==='optional'?presentType(type.inner):type;}
  function update(port,enabled,value){
    if(disabled)return;
    dispatch('change',{...node.inlineInputs,[port]:{enabled,...(value===undefined?{}:{value})}});
  }
  function templateSelection(port,selection){
    if(disabled)return;
    const values={...node.inlineInputs,[port]:{enabled:true,value:selection.value}};
    if(port==='name'&&typeof selection.entity==='string'&&!connections.some(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port==='entity'))values.entity={enabled:true,value:selection.entity};
    dispatch('change',values);
  }
  function toggle(port,type,enabled){
    const saved=node.inlineInputs?.[port];
    update(port,enabled,saved&&Object.hasOwn(saved,'value')?saved.value:initialValue(presentType(type)));
  }
</script>
{#if ports.length}
  <div class="inline-inputs">
    {#each ports as [port,type]}
      {@const connected=connections.some(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port===port)}
      {@const literal=node.inlineInputs?.[port]}
      {@const label=definition.metadata?.inputs?.[port]?.label||port}
      <div class="inline-input">
        <label title={connected?'Zum Verwenden des Inline-Werts zuerst die Verbindung entfernen.':'Gespeicherten konstanten Wert für diesen Eingang verwenden.'}><input type="checkbox" aria-label={`${label}: Inline-Wert verwenden`} disabled={disabled||connected} checked={!connected&&!!literal?.enabled} on:change={event=>toggle(port,type,event.target.checked)}/>{label}: Konstanter Wert</label>
        {#if node.type.startsWith('Backend.Template.')&&['name','templateId','groupName'].includes(port)}
          {@const entityDynamic=connections.some(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id&&edge.target.port==='entity')}
          <TemplateInput {port} value={literal?.value} entity={!entityDynamic&&node.inlineInputs?.entity?.enabled?node.inlineInputs.entity.value:''} {entityDynamic} active={!connected&&!!literal?.enabled} disabled={disabled||connected||!literal?.enabled} on:value={event=>templateSelection(port,event.detail)}/>
        {:else if definition.metadata?.inputs?.[port]?.editor?.kind==='html'}
          <HtmlInput value={literal?.value} disabled={disabled||connected||!literal?.enabled} {label} editors={definition.metadata.inputs[port].editor.editors} on:value={event=>update(port,true,event.detail)}/>
        {:else}<ValueInput validateValue={!connected&&!!literal?.enabled} type={presentType(type)} value={literal?.value} disabled={disabled||connected||!literal?.enabled} label={`${label}: Inline-Wert`} on:value={event=>update(port,true,event.detail.value)}/>{/if}
      </div>
    {/each}
  </div>
{/if}
<style>.inline-inputs{padding:8px;display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--f-border,#ddd)}.inline-input{display:flex;flex-direction:column;gap:5px;min-width:0}label{display:flex;align-items:center;gap:6px;font-size:12px}input[type=checkbox]{margin:0}</style>
