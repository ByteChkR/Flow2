<script>
 export let editor; export let resource; export let document;
</script>
<label>Notiz <textarea aria-label="Notiz" value={document.draft.text} on:input={event=>editor.edit(resource.documentId,{text:event.currentTarget.value})}/></label>
<style>label{display:flex;flex-direction:column;padding:20px;gap:12px}textarea{min-height:180px;font:inherit}</style>
