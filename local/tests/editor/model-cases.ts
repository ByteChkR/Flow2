import assert from 'node:assert/strict';
import {createEditorStore,documentDirty,type EditorProvider} from '@adam/editor/model.js';
const component=class {} as unknown as EditorProvider['views'][number]['component'];
export async function run(){
 const memory=new Map<string,string>();const storage={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,value);}};
 let decision:'save'|'discard'|'cancel'='cancel';
 const editor=createEditorStore({identityKey:'tenant1:user1',storage,confirm:async()=>decision});
 for(const id of ['flow','file'])editor.provider({id,label:id,views:[{id:'edit',component},{id:'diff',component}]});
 let fail=false,saves=0;
 editor.scope({id:'flows',providerId:'flow',label:'Flow workspace',save:async docs=>{saves++;if(fail)throw new Error('conflict');return docs;},reload:async()=>[{id:'graph',draft:{value:'server'}}]});
 editor.scope({id:'files',providerId:'file',label:'File',save:async docs=>docs,reload:async()=>[{id:'file',draft:{value:'server file'}}]});
 editor.document('graph','flows',{value:'graph'});editor.document('file','files',{value:'file'});
 editor.resources('flow',[{id:'graph',providerId:'flow',name:'Graph',documentId:'graph',view:'edit'}]);
 editor.resources('file',[{id:'file',providerId:'file',name:'Template',documentId:'file',view:'edit'}]);
 editor.preferencesReady();
 const edit=editor.open('file')!,diff=editor.open('file','diff')!,graph=editor.open('graph')!;
 assert.equal(editor.snapshot().tabs.length,3);
 assert.equal(editor.snapshot().tabs.filter(t=>t.resourceId==='file').length,2);
 editor.edit('file',{value:'modified'});assert.equal(editor.snapshot().documents.file!.draft && documentDirty(editor.snapshot().documents.file!),true);
 assert.equal(await editor.close([diff]),true,'Closing a second view preserves a shared draft without a prompt');
 assert.equal(await editor.close([edit]),false,'Cancel retains last document view');
 fail=true;editor.edit('graph',{value:'unsaved graph'});decision='save';assert.equal(await editor.close([graph]),false);assert.equal(editor.hasChanges(),true);assert.equal(editor.snapshot().status.flows!.error,'Error: conflict');
 const results=await editor.saveAll();assert.deepEqual(results.map(r=>r.success),[false,true]);assert.deepEqual(editor.snapshot().documents.graph!.draft,{value:'unsaved graph'});assert.equal(documentDirty(editor.snapshot().documents.file!),false);
 editor.scope({id:'flows',providerId:'flow',label:'Flow workspace',locked:true,save:async()=>{},reload:async()=>[]});
 assert.equal(editor.edit('graph',{}),false);assert.equal(editor.edit('file',{value:'editable during flow run'}),true);
 assert.equal(await editor.save('files'),true);
 editor.pin(graph);editor.toggle('group',false);
 const restored=createEditorStore({identityKey:'tenant1:user1',storage});restored.provider({id:'flow',label:'flow',views:[{id:'edit',component}]});restored.resources('flow',[{id:'graph',providerId:'flow',name:'Graph',view:'edit'}]);restored.preferencesReady();assert.equal(restored.snapshot().tabs[0]?.pinned,true);assert.equal(restored.snapshot().expanded.group,false);
 const other=createEditorStore({identityKey:'tenant2:user1',storage});assert.equal(other.snapshot().tabs.length,0);
 // A failed reload must preserve the draft even after the user chose discard.
 editor.scope({id:'flows',providerId:'flow',label:'Flow workspace',save:async()=>{},reload:async()=>{throw new Error('offline');}});decision='discard';assert.equal(await editor.reload('flows'),false);assert.deepEqual(editor.snapshot().documents.graph!.draft,{value:'unsaved graph'});
 assert.equal(await editor.close([graph]),true);assert.deepEqual(editor.snapshot().documents.graph!.draft,{value:'graph'});
 assert.ok(saves>=2);
 const orderedKey='adam.editor.v1.order';
 storage.setItem(orderedKey,JSON.stringify({version:1,tabs:[{id:'g',resourceId:'g',view:'edit',pinned:true},{id:'n',resourceId:'n',view:'edit',pinned:false}],activeId:'g',expanded:{}}));
 const ordered=createEditorStore({identityKey:'order',storage});ordered.provider({id:'n',label:'n',views:[{id:'edit',component}]});ordered.resources('n',[{id:'n',providerId:'n',name:'Note',view:'edit'}]);ordered.preferencesReady();ordered.provider({id:'g',label:'g',views:[{id:'edit',component}]});ordered.resources('g',[{id:'g',providerId:'g',name:'Graph',view:'edit'}]);
 assert.deepEqual(ordered.snapshot().tabs.map(t=>t.id),['g','n']);assert.equal(ordered.snapshot().activeId,'g');

 editor.edit('file',{text:'Leave guard'});decision='cancel';assert.equal(await editor.prepareLeave(),false);decision='save';assert.equal(await editor.prepareLeave(),true);
 const delayed=createEditorStore({identityKey:'tenant1:user1',storage});delayed.provider({id:'flow',label:'flow',views:[{id:'edit',component}]});delayed.resources('flow',[{id:'graph',providerId:'flow',name:'Graph',view:'edit'}]);delayed.preferencesReady();
 delayed.provider({id:'file',label:'file',views:[{id:'edit',component},{id:'diff',component}]});delayed.resources('file',[{id:'file',providerId:'file',name:'File',view:'edit'}]);assert.ok(delayed.snapshot().tabs.some(t=>t.resourceId==='file'),'Tabs restore when another provider loads later');

}
