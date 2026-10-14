<script>
 import CommentMarkdown from './CommentMarkdown.svelte';
 import {createEventDispatcher,tick} from 'svelte';
 export let groups=[];export let comments=[];export let disabled=false;export let selectedComments=[];export let selectedGroups=[];
 const dispatch=createEventDispatcher();
 let textFields={},editing=null;
 async function beginEditing(id){if(disabled)return;editing=id;await tick();textFields[id]?.focus();}
 function fontWheel(event){
  if(disabled||!event.shiftKey||event.ctrlKey||event.metaKey)return;
  const comment=comments.find(item=>textFields[item.id]===document.activeElement);
  if(!comment)return;
  const delta=event.deltaY||event.deltaX;if(!delta)return;
  event.preventDefault();event.stopPropagation();
  edit('comment',comment.id,'fontSize',Math.max(8,Math.min(48,(comment.fontSize??13)+(delta<0?1:-1))));
 }
 function start(event,kind,id){dispatch('start',{event,kind,id});}
 function key(event,kind,id){dispatch('key',{event,kind,id});}
 function edit(kind,id,field,value){dispatch('edit',{kind,id,field,value});}
 function remove(kind,id){dispatch('remove',{kind,id});}
</script>
<svelte:window on:wheel|capture|nonpassive={fontWheel}/>
{#each groups as group (group.id)}
 <section data-selectable-group={group.id} class:selected={selectedGroups.includes(group.id)} class="node-group" aria-label={`Gruppe ${group.name}`} style={`left:${group.x}px;top:${group.y}px;width:${group.width}px;height:${group.height}px;--group-color:${group.color};background:${group.color}22`}>
  <div class="group-heading"><button class="group-drag" {disabled} aria-label={`Gruppe ${group.name} verschieben`} title="Gruppe mit Inhalt verschieben · Pfeiltasten für Feinschritte" on:pointerdown={event=>start(event,'group',group.id)} on:keydown={event=>key(event,'group',group.id)}>⠿</button><input aria-label="Gruppenname" value={group.name} {disabled} on:input={event=>edit('group',group.id,'name',event.target.value)}/><input type="color" aria-label={`Farbe der Gruppe ${group.name}`} value={group.color} {disabled} on:input={event=>edit('group',group.id,'color',event.target.value)}/><button {disabled} aria-label={`Gruppe ${group.name} entfernen`} title="Gruppe auflösen oder samt Inhalt löschen" on:click={()=>remove('group',group.id)}>×</button></div>
  <span class="group-count">{group.nodeIds.length} Nodes · {group.commentIds.length} Kommentare</span>
  <button class="resize" {disabled} aria-label={`Gruppe ${group.name} vergrößern oder verkleinern`} title="Größe ziehen oder mit Pfeiltasten ändern" on:pointerdown={event=>start(event,'resize',group.id)} on:keydown={event=>key(event,'resize',group.id)}>◢</button>
 </section>
{/each}
{#each comments as comment (comment.id)}
 <article data-selectable-comment={comment.id} class:selected={selectedComments.includes(comment.id)} class="comment-card" aria-label="Kommentar" style={`left:${comment.x}px;top:${comment.y}px;width:${comment.width??260}px;height:${comment.height??160}px`}>
  <div class="comment-heading"><button {disabled} class="comment-drag" aria-label="Kommentar verschieben" on:pointerdown={event=>start(event,'comment',comment.id)} on:keydown={event=>key(event,'comment',comment.id)}>⠿ Kommentar</button><button {disabled} aria-label="Kommentar entfernen" on:click={()=>remove('comment',comment.id)}>×</button></div>
  {#if editing===comment.id||!comment.text}
  <textarea on:focus={()=>editing=comment.id} on:blur={()=>editing=null} bind:this={textFields[comment.id]} style={`font-size:${comment.fontSize??13}px`} title="Shift + Mausrad ändert die Schriftgröße bei fokussiertem Textfeld" aria-label="Kommentartext" placeholder="Kommentar schreiben …" value={comment.text} {disabled} on:input={event=>edit('comment',comment.id,'text',event.target.value)}></textarea>
  {:else}
   <div class="comment-preview" style={`font-size:${comment.fontSize??13}px`} role="button" tabindex={disabled?-1:0} aria-disabled={disabled} aria-label="Kommentar bearbeiten" title="Kommentar bearbeiten" on:click={()=>beginEditing(comment.id)} on:keydown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();beginEditing(comment.id);}}}><CommentMarkdown text={comment.text}/></div>
  {/if}
  <button class="resize" {disabled} aria-label="Kommentar vergrößern oder verkleinern" title="Größe ziehen oder mit Pfeiltasten ändern" on:pointerdown={event=>start(event,'resizeComment',comment.id)} on:keydown={event=>key(event,'resizeComment',comment.id)}>◢</button>
 </article>
{/each}
<style>
 .node-group.selected,.comment-card.selected{outline:2px solid var(--f-brand);outline-offset:2px}
 button,input,textarea{box-sizing:border-box;font:inherit;color:inherit;min-width:0}button{cursor:pointer;border:1px solid var(--f-border);border-radius:4px;background:var(--f-panel);padding:4px 8px}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--f-brand);outline-offset:-2px}
 .node-group{position:absolute;border:2px solid var(--group-color);border-radius:10px;box-sizing:border-box;pointer-events:none}.group-heading{height:40px;display:flex;align-items:center;gap:6px;padding:4px;background:var(--f-panel);border-radius:8px 8px 0 0;pointer-events:auto;overflow:hidden}.group-heading input{width:100%;background:transparent;border:0;color:var(--f-text)}.group-heading input[type=color]{width:30px;height:26px;padding:0;flex:none}.group-heading button{padding:2px 6px;flex:none}.group-drag,.comment-drag{cursor:grab;touch-action:none}.group-count{position:absolute;bottom:8px;left:10px;color:var(--f-text);font-size:11px}.resize{position:absolute;bottom:0;right:0;padding:3px 7px;pointer-events:auto;cursor:nwse-resize;touch-action:none;background:var(--f-panel)}
 .comment-preview{flex:1;min-height:0;padding:12px 12px 24px;overflow:auto;overflow-wrap:anywhere;line-height:1.5;cursor:text}.comment-preview:focus-visible{outline:2px solid var(--f-brand);outline-offset:-2px}
 .comment-card{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;background:#fef3c7;color:#422006;border:1px solid #d6a642;border-radius:7px;box-shadow:0 3px 10px #0001}.comment-heading{display:flex;align-items:center;border-bottom:1px solid #d6a642;flex:none}.comment-heading button{background:transparent;border:0;color:inherit}.comment-drag{flex:1;text-align:left;font-weight:600}.comment-card textarea{display:block;width:100%;flex:1;min-height:0;padding:12px 12px 24px;resize:none;border:0;background:transparent;color:inherit;line-height:1.5;border-radius:0 0 7px 7px}.comment-card .resize{background:#fef3c7;border:0;color:inherit}
</style>
