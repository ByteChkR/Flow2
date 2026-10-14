<script>
 import GraphEditor from '@adam-flow/editor/editor/GraphEditor.svelte';
 import {createStandardRegistry} from '@adam-flow/runtime-browser/registry.js';
 import {FlowWorkspace} from '@adam-flow/runtime-browser/runtime-browser/workspace.js';
 export let editor; export let resource; export let document; export let active;
 const workspace=new FlowWorkspace(createStandardRegistry,()=>{throw new Error('Demo läuft vollständig lokal.');});
 const catalog=workspace.loadLocal();
</script>
<GraphEditor {workspace} {catalog} {active} graphName="Lokale Berechnung" flow={document.draft}
 on:graphchange={event=>editor.edit(resource.documentId,event.detail)}/>
