<script>
 import {onMount,createEventDispatcher} from 'svelte';
 import {loadTemplateOptions} from './template-options.js';
 export let value='';export let port;export let entity='';export let entityDynamic=false;
 export let disabled=false;export let active=false;
 export let loadOptions=loadTemplateOptions;
 const dispatch=createEventDispatcher();
 let data={templates:[],groups:[]},loading=true,error='',search='',editId='',disposed=false;
 async function load(){loading=true;error='';try{const result=await loadOptions();if(!disposed)data=result;}catch(cause){if(!disposed)error=`Vorlagen konnten nicht geladen werden: ${cause.message??cause}`;}finally{if(!disposed)loading=false;}}
 onMount(()=>{void load();return ()=>{disposed=true;};});
 $: group=port==='groupName';
 $: templates=data.templates.filter(t=>port!=='name'||!entity||t.Entity===entity);
 $: choices=group?data.groups:templates;
 $: selected=group?choices.find(g=>g.Name===value):port==='templateId'?choices.find(t=>t.Id.toLowerCase()===String(value??'').toLowerCase()):choices.find(t=>t.Name===value&&t.Entity===entity);
 $: shown=choices.filter(t=>t===selected||`${t.Name} ${t.Entity??''} ${t.Type??''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 $: members=group&&selected?data.templates.filter(t=>t.VorlagenGruppeId===selected.Id):[];
 $: if(!members.some(t=>t.Id===editId))editId=members.length===1?members[0].Id:'';
 $: editTarget=active?(group?editId:port==='name'&&entityDynamic?'':selected?.Id):'';
 function choose(id){const item=choices.find(t=>t.Id===id);if(!item){dispatch('value',{value:''});return;}dispatch('value',{value:group||port==='name'?item.Name:item.Id,...(!group&&port==='name'?{entity:item.Entity}: {})});}
</script>
<div class="template-input">
 <input type="search" aria-label={group?'Vorlagengruppen suchen':'Vorlagen suchen'} placeholder={group?'Gruppen suchen …':'Vorlagen suchen …'} bind:value={search} disabled={disabled||loading}/>
 <select aria-label={group?'Vorlagengruppe auswählen':'Vorlage auswählen'} value={selected?.Id??''} disabled={disabled||loading||!!error} on:change={event=>choose(event.target.value)}>
  <option value="">{loading?'Wird geladen …':value&&!selected?`Gespeicherter Wert: ${value}`:group?'Gruppe auswählen …':'Vorlage auswählen …'}</option>
  {#each shown as item}<option value={item.Id}>{item.Name}{!group?` · ${item.Entity||'Datenmodell'} · ${item.Type??''}`:''}</option>{/each}
 </select>
 {#if error}<small role="alert">{error}</small><button type="button" on:click={load}>Erneut laden</button>{/if}
 {#if group&&selected&&active}<label>Vorlage bearbeiten<select aria-label="Vorlage der Gruppe bearbeiten" bind:value={editId}><option value="">Vorlage auswählen …</option>{#each members as item}<option value={item.Id}>{item.Name}{item.StandardVorlage?' · Standard':''}</option>{/each}</select></label><small>Die konkrete Vorlage wird zur Laufzeit ausgewählt.</small>{/if}
 {#if editTarget}<a href={`/template/editor/${encodeURIComponent(editTarget)}`} target="_blank" rel="noopener noreferrer">Vorlage bearbeiten ↗</a>{:else if active&&port==='name'&&entityDynamic}<small>Die Entity ist verbunden. Die konkrete Vorlage steht erst zur Laufzeit fest.</small>{/if}
</div>
<style>.template-input{display:flex;flex-direction:column;gap:5px;min-width:0}input,select,button{width:100%;min-width:0;box-sizing:border-box;font:inherit;color:inherit;background:var(--f-panel,#fff);border:1px solid var(--f-border,#ccc);border-radius:4px;padding:5px}label{display:flex;flex-direction:column;gap:4px;font-size:12px}small{font-size:11px;line-height:1.4;overflow-wrap:anywhere}a{font-size:12px;color:var(--f-link,#075985);text-decoration:underline;align-self:flex-start}[role=alert]{color:#b42318}</style>
