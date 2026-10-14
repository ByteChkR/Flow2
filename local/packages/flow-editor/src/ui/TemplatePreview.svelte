<script>
  import {onDestroy} from 'svelte';
  import {templatePdf,templateHtml} from '@adam-flow/runtime-browser/ui/template-preview.js';
  export let data;
  export let type;
  export let betreff=null;
  let pdfUrl,error='';
  $: updatePdf(type,data);
  function updatePdf(format,content){
    if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=undefined;error='';
    if(format==='pdf')try{pdfUrl=URL.createObjectURL(new Blob([templatePdf(content)],{type:'application/pdf'}));}catch(cause){error=String(cause);}
  }
  onDestroy(()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);});
</script>
{#if betreff}<p class="subject"><strong>Betreff:</strong> {betreff}</p>{/if}
{#if error}<p role="alert">{error}</p>
{:else if type==='pdf'}
  <object data={pdfUrl} type="application/pdf" aria-label="PDF-Vorschau"><p>Die PDF-Vorschau ist in diesem Browser nicht verfügbar. Nutze den Download.</p></object>
  <a href={pdfUrl} download="vorlage.pdf">PDF herunterladen</a>
{:else if type==='sms'}<pre aria-label="SMS-Vorschau">{data}</pre>
{:else}<iframe title="E-Mail-/HTML-Vorschau" sandbox="" referrerpolicy="no-referrer" srcdoc={templateHtml(data)}></iframe>{/if}
<style>
  iframe,object{display:block;width:100%;height:60vh;min-height:280px;border:1px solid #ccc;background:white;margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;padding:16px;border:1px solid #ccc;border-radius:4px}.subject{overflow-wrap:anywhere}a{display:inline-block;margin-bottom:12px}
</style>
