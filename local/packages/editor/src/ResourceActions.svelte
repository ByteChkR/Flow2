<script>
 import {tick} from 'svelte';
 import EditorCommands from './EditorCommands.svelte';
 export let editor;
 export let provider;
 let menu,position={x:0,y:0};
 $: scopes=$editor.scopes.filter(scope=>scope.providerId===provider.id);
 $: commands=provider.commands?.filter(command=>command.placement==='resource-header')??[];
 async function open(event){
  const rect=event.currentTarget.getBoundingClientRect();
  position={x:Math.max(8,Math.min(rect.left,window.innerWidth-280)),y:Math.max(8,Math.min(rect.bottom+4,window.innerHeight-240))};
  await tick();
  menu.showPopover();
 }
</script>
<button class="more" aria-label={`Weitere Aktionen: ${provider.label}`} title="Weitere Aktionen" aria-haspopup="dialog" on:click={open}><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
<div class="flow2-context-menu" popover="auto" bind:this={menu} style={`left:${position.x}px;top:${position.y}px;--menu-top:${position.y}px`} role="dialog" aria-label={`Weitere Aktionen: ${provider.label}`}>
 <strong>{provider.label}</strong>
 {#each scopes as scope (scope.id)}
  <small>{scope.label} · {$editor.status[scope.id]?.busy==='save'?'Speichert …':$editor.status[scope.id]?.busy==='reload'?'Lädt …':editor.scopeDirty(scope.id)?'Ungespeicherte Änderungen':'Gespeichert'}</small>
  <button disabled={!editor.scopeDirty(scope.id)||!editor.writableScope(scope.id)} on:click={()=>{menu.hidePopover();editor.save(scope.id);}}>{scopes.length===1?'Speichern':`${scope.label} speichern`}</button>
  <button disabled={!editor.canReload(scope.id)} on:click={()=>{menu.hidePopover();editor.reload(scope.id);}}>{scopes.length===1?'Neu laden':`${scope.label} neu laden`}</button>
 {/each}
 {#if commands.length}<div class="provider-actions" on:click={event=>{if(event.target.closest('button:not(:disabled)'))menu.hidePopover();}}><EditorCommands {editor} {commands}/></div>{/if}
</div>
<style>
 .more{display:flex;align-items:center;justify-content:center;flex:none;width:30px;height:28px;margin-right:8px;padding:5px;border:1px solid transparent;border-radius:4px;background:transparent;color:inherit;cursor:pointer}.more svg{width:20px;height:20px}.more:hover{background:var(--w-panel);border-color:var(--w-border)}.more:focus-visible{outline:2px solid var(--w-brand);outline-offset:1px}small{padding:5px 10px;color:var(--w-muted);font-size:11px}.provider-actions{border-top:1px solid var(--w-border);margin-top:4px;padding-top:4px}
</style>
