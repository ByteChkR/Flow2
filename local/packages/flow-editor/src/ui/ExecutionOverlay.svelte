<script>
  import MessagePanel from '@adam/editor/diagnostics/MessagePanel.svelte';
  import {errorMessages} from '@adam/editor/diagnostics/messages.js';
  import LoadingLogo from '../host/LoadingLogo.svelte';
  import {displayValue} from '../editor/value-model.js';
  import {onMount,onDestroy,tick} from 'svelte';
  export let interactions;
  export let graphName='Flow';
  export let fullscreen=false;
  export let minimized=false;
  export let canMinimize=true;
  export let autoForeground=true;
  export let activeNodes=[];
  export let abort=()=>{};
  export let result=null;
  export let close=()=>{};
  export let onMinimize=()=>{};
  export let onState;
  $: onState?.({minimized,autoForeground});
  // Load the host's search/details UI only when a node actually requests it.
  const loadContent=()=>import('../host/InteractionContent.svelte');
  let content,contentTask,loadError='',panel,cancelling=false,disposed=false,seenToken;
  $: if(request&&request.token!==seenToken){seenToken=request.token;if(autoForeground)restore();}
  async function minimize(){minimized=true;await tick();onMinimize();}
  async function restore(){minimized=false;await tick();if(!disposed&&!minimized)panel?.focus();}
  onDestroy(()=>disposed=true);
  let request=null;
  // The editor reapplies overlay props for progress updates. Svelte then
  // resubscribes even to the same store and republishes its current object.
  // Only a different request should reach Page's keyed content; otherwise an
  // unchanged step remounts, reloads its record and loses unsaved edits.
  $: if(request!==$interactions)request=$interactions;
  $: restorePanelFocus(request,minimized);
  async function restorePanelFocus(_request,isMinimized){await tick();if(!isMinimized&&!minimized&&!disposed&&panel&&!panel.contains(document.activeElement))panel.focus();}
  $: if(request&&!contentTask){
    contentTask=loadContent().then(module=>content=module.default).catch(error=>{if(!disposed){loadError=String(error);interactions.cancelAll(error);}});
  }
  function cancelRun(){if(cancelling)return;cancelling=true;abort();}
  function keydown(event){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();return;}
    if(event.key!=='Tab'||request?.kind==='page')return;
    const focusable=[...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(element=>element.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(!first){event.preventDefault();panel.focus();}
    else if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  onMount(()=>{const previous=document.activeElement;panel.focus();return()=>{if(previous?.isConnected)previous.focus();};});
</script>
<svelte:window on:keydown={event=>{if(!minimized&&panel?.contains(event.target))keydown(event);}} />
<div class="backdrop" class:page={request?.kind==='page'} class:fullscreen={request?.dialogOptions?.fullscreen??fullscreen} hidden={minimized}>
  <section data-size={request?.dialogOptions?.size??'large'} class="execution-window" role={request?.kind==='page'?'region':'dialog'} aria-modal={request?.kind==='page'?undefined:'true'} aria-label={`Flow-Ausführung: ${graphName}`} tabindex="-1" bind:this={panel}>
    <header><div><small>Flow-Ausführung</small><h2>{graphName}</h2></div><div class="actions">{#if canMinimize}<button on:click={minimize}>Minimieren</button>{/if}{#if !result}<button disabled={cancelling} on:click={cancelRun}>{cancelling?'Wird abgebrochen …':'Flow abbrechen'}</button>{/if}</div></header>
    <div class="content">
      {#if result}
        <div class="completion" data-outcome={result.state} role="status" aria-live="polite">
          <h3>{result.state==='completed'?'Erfolgreich abgeschlossen':result.state==='cancelled'?'Ausführung abgebrochen':'Ausführung fehlgeschlagen'}</h3>
          <p>{result.state==='completed'?'Der Flow wurde erfolgreich ausgeführt.':result.state==='cancelled'?'Die Ausführung wurde abgebrochen.':'Der Flow wurde nicht abgeschlossen.'}</p><MessagePanel messages={result.messages??(result.error?errorMessages(result.error):result.state==='cancelled'?errorMessages({code:'cancelled'}):[])}/>
          {#if result.state==='completed'&&Object.keys(result.outputs??{}).length}<dl>{#each Object.entries(result.outputs) as [name,value]}<dt>{name}</dt><dd>{displayValue(value)}</dd>{/each}</dl>{/if}
          {#if result.state==='completed'&&result.navigationPath}<a href={result.navigationPath}>Datensatz öffnen</a>{/if}
          <button on:click={close}>Zurück</button>
        </div>
      {:else if request&&content}
        {#key request.token}

          <svelte:component this={content} {request} {interactions}/>
        {/key}
      {:else}
        <div class="waiting" role="status" aria-live="polite">
          <div aria-hidden="true"><LoadingLogo width={200} height={200}/></div>
          <h3>{cancelling?'Ausführung wird beendet …':request?'Ansicht wird geladen …':'Flow wird ausgeführt …'}</h3>
          {#each activeNodes as label}<p>{label}</p>{:else}<p>Ausführung wird vorbereitet …</p>{/each}
          {#if loadError}<MessagePanel messages={errorMessages(loadError)}/>{/if}
        </div>
      {/if}
    </div>
  </section>
</div>
<style>
  .backdrop.page{position:relative;inset:auto;background:none;padding:0;width:100%;height:100%;z-index:auto}.backdrop.page .execution-window{width:100%;height:100%;max-height:none;box-shadow:none}

  .completion{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;gap:16px;text-align:center}.completion h3{font-size:22px;margin:0}.completion p{white-space:pre-wrap;overflow-wrap:anywhere;max-width:800px}.completion[data-outcome=completed] h3{color:#15803d}.completion[data-outcome=failed] h3{color:#b91c1c}.completion dl{max-width:100%;overflow-wrap:anywhere}.completion dt{font-weight:600}.completion dd{margin:4px 0 12px}
  .backdrop:not(.fullscreen) .execution-window[data-size=small]{width:min(520px,96vw)}.backdrop:not(.fullscreen) .execution-window[data-size=medium]{width:min(900px,96vw)}
  .backdrop[hidden]{display:none}.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}

  .backdrop.fullscreen{padding:0}.fullscreen .execution-window{width:100vw;height:100vh;height:100dvh;border:0;border-radius:0}
  .backdrop{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.45);backdrop-filter:blur(3px)}
  .execution-window{width:min(1400px,96vw);height:90vh;height:90dvh;display:flex;flex-direction:column;background:rgb(var(--color-background,243,244,246));color:rgb(var(--color-primary,31,41,55));border:1px solid rgb(var(--color-secondary-300,209,213,219));border-radius:10px;box-shadow:0 24px 70px #0005;overflow:hidden}
  header{padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;background:rgb(var(--color-background-400,255,255,255));border-bottom:1px solid rgb(var(--color-secondary-300,209,213,219))}h2{font-size:18px;font-weight:600;margin:0}small{color:rgb(var(--color-secondary,107,114,128))}h3{font-size:14px;font-weight:600;margin:0 0 16px}.content{padding:20px;overflow:auto;flex:1;min-height:0}.waiting{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px}.waiting h3,.waiting p{margin:0}.waiting p{overflow-wrap:anywhere}button{font:inherit;padding:8px 12px;background:rgb(var(--color-background-400,255,255,255));color:inherit;border:1px solid rgb(var(--color-secondary-300,209,213,219));border-radius:5px;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible{outline:2px solid rgb(var(--color-brand,37,99,235));outline-offset:2px}@media(max-width:640px){.backdrop{padding:8px}.execution-window{height:96dvh;width:100%}.content{padding:10px}}
  /* Dialogs follow their content until the viewport limit; pages and fullscreen keep filling their host. */
  .backdrop:not(.page):not(.fullscreen) .execution-window{height:auto;max-height:min(90vh,calc(100vh - 48px));max-height:min(90dvh,calc(100dvh - 48px))}
  .backdrop:not(.page):not(.fullscreen) .content{flex:0 1 auto}
  header{flex-shrink:0}
  @media(max-width:640px){.backdrop:not(.page):not(.fullscreen) .execution-window{max-height:min(96vh,calc(100vh - 16px));max-height:min(96dvh,calc(100dvh - 16px))}}
</style>
