<script>
 import {onDestroy} from 'svelte';
 import {readFiles} from '@adam-flow/runtime-browser/ui/step-values.js';
 export let panel;export let flow;
 const data=flow.data;let busy=false,error='',generation=0;
 const controller=new AbortController();onDestroy(()=>{generation++;controller.abort();});
 $: files=flow.read($data,panel.field)??[];
 async function select(event){
  const current=++generation,chosen=[...event.target.files],previous=files;flow.write(panel.field,undefined);event.target.value='';busy=true;error='';
  try{const next=await readFiles(chosen,panel.accept,panel.maxFiles,panel.maxBytes,controller.signal);if(current===generation)flow.write(panel.field,next);}
  catch(cause){if(current===generation){error=cause.message;flow.write(panel.field,previous);}}
  finally{if(current===generation)busy=false;}
 }
</script>
<label>Dateien auswählen <input type="file" accept={panel.accept} multiple={panel.maxFiles>1} disabled={busy} on:change={select}/></label>
<p>Maximal {panel.maxFiles} Datei(en), jeweils {Math.round(panel.maxBytes/1024)} KiB.</p>
{#if busy}<p role="status">Dateien werden eingelesen …</p>{/if}
{#if error}<p role="alert">{error}</p>{/if}
<ul>{#each files as file,index}<li>{file.name} ({file.size} Bytes) <button disabled={busy} on:click={()=>flow.write(panel.field,files.filter((_,i)=>i!==index))}>Entfernen</button></li>{/each}</ul>
<style>[role=alert]{color:#b91c1c}li{padding:5px}button{font:inherit}</style>
