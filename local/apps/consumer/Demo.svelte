<script>
 import EditorWorkspace from '@adam/editor/EditorWorkspace.svelte';
 import {createEditorStore} from '@adam/editor/model.js';
 import TextView from './TextView.svelte';
 import FlowView from './FlowView.svelte';
 const editor=createEditorStore({identityKey:'standalone-demo',storage:localStorage,confirm:async()=>window.confirm('Änderungen speichern?')?'save':'cancel'});
 const initial={note:{text:'Ein allgemeines Dokument im selben Editor wie ein Flow.'},flow:{schemaVersion:2,id:'demo',version:1,mode:'interactive',nodes:[{id:'start',type:'Standard.Flow.Start',typeVersion:1,environment:'browser',config:{}}],connections:[]}};
 let saved;try{saved=JSON.parse(localStorage.getItem('package-demo-documents'))??initial;}catch{saved=initial;}
 editor.provider({id:'demo',label:'Lokale Dokumente',views:[{id:'text',component:TextView},{id:'flow',component:FlowView}],commands:[{id:'save',label:'Speichern',placement:'workspace',run:()=>editor.save('local')}]});
 editor.scope({id:'local',label:'Lokale Dateien',providerId:'demo',save:async docs=>{for(const doc of docs)saved[doc.id]=structuredClone(doc.draft);localStorage.setItem('package-demo-documents',JSON.stringify(saved));return docs;},reload:async()=>Object.entries(saved).map(([id,draft])=>({id,draft}))});
 editor.document('note','local',saved.note);editor.document('flow','local',saved.flow);
 editor.resources('demo',[{id:'note',providerId:'demo',name:'Notiz',documentId:'note',scopeId:'local',view:'text'},{id:'flow',providerId:'demo',name:'Lokale Berechnung',documentId:'flow',scopeId:'local',view:'flow'}]);
 if(!editor.snapshot().tabs.length){editor.open('flow');editor.open('note');}
 window.demoEditor=editor;
</script>
<EditorWorkspace {editor} identityKey="standalone-demo" title="Editor · unabhängiger Paket-Host"/>
