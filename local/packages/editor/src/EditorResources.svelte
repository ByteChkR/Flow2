<script>
 import {resourceColor} from './resource-colors.js';
 import ResourceActions from './ResourceActions.svelte';
 import ResourceTree from './ResourceTree.svelte';
 export let editor;
 let openProvider;
 let searches={};
 $: providers=$editor.providers;
 // undefined initializes the first available tree; null deliberately collapses all trees.
 $: if(providers.length&&(openProvider===undefined||(openProvider!==null&&!providers.some(p=>p.id===openProvider))))openProvider=providers[0].id;
 function toggle(id){openProvider=openProvider===id?null:id;}
</script>
<div class="resource-sections">
 {#each providers as provider (provider.id)}
 <section style={`--resource-accent:${resourceColor(provider.id)}`} class:expanded={openProvider===provider.id}>
  <div class="section-heading"><h2><button class="section-toggle" aria-expanded={openProvider===provider.id} aria-controls={`resources-${provider.id}`} on:click={()=>toggle(provider.id)}><span aria-hidden="true">{openProvider===provider.id?'▾':'▸'}</span>{provider.label}</button></h2><div class="heading-actions"><ResourceActions {editor} {provider}/></div></div>
  {#if openProvider===provider.id}
   <div class="section-content" id={`resources-${provider.id}`}>
    <div class="search"><input type="search" aria-label={`${provider.label}: Ressourcen suchen`} placeholder="Ressourcen suchen …" value={searches[provider.id]??''} on:input={event=>searches={...searches,[provider.id]:event.target.value}}/><small>Klick oder Enter öffnet die Ressource.</small></div>
    {#each provider.panels?.filter(p=>p.placement==='tree')??[] as panel (panel.id)}<svelte:component this={panel.component} {...panel.props} {editor}/>{/each}
    <div class="tree-scroll"><ResourceTree {editor} providerId={provider.id} label={provider.label} search={searches[provider.id]??''}/></div>
   </div>
  {/if}
 </section>
 {/each}
</div>
<style>
.resource-sections{--resource-padding-x:12px;--resource-padding-y:8px;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}section{display:flex;flex-direction:column;flex:none;min-height:0;border-bottom:1px solid var(--w-border)}section.expanded{flex:1}.section-content{background:color-mix(in srgb,var(--resource-accent) 5%,var(--w-panel))}.section-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;flex:none;background:color-mix(in srgb,var(--resource-accent) 14%,var(--w-panel))}h2{margin:0;min-width:0;font-size:13px}.heading-actions{display:flex;align-items:center}.section-toggle{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:10px var(--resource-padding-x);font:inherit;font-weight:600;text-align:left;border:0;border-radius:0;background:color-mix(in srgb,var(--resource-accent) 14%,var(--w-panel));box-shadow:inset 3px 0 var(--resource-accent);color:inherit;cursor:pointer}.section-toggle:hover{background:color-mix(in srgb,var(--resource-accent) 22%,var(--w-panel))}.section-toggle:focus-visible{outline:2px solid var(--w-brand);outline-offset:-2px}.section-toggle span{width:12px}.section-content{display:flex;flex-direction:column;flex:1;min-height:0;overflow:auto}.search{padding:var(--resource-padding-y) var(--resource-padding-x);flex:none}.search input{box-sizing:border-box;width:100%;font:inherit;color:inherit;padding:6px 9px;border:1px solid var(--w-border);border-radius:4px;background:var(--w-panel)}small{display:block;margin-top:5px;font-size:11px;color:var(--w-muted)}.tree-scroll{flex:1;min-height:80px;overflow:auto;padding:0 4px}
/* Tree tools share spacing and form layout across all providers. */
:global(.resource-tools){box-sizing:border-box;flex:none;display:flex;flex-direction:column;gap:6px;margin:0;padding:var(--resource-padding-y,8px) var(--resource-padding-x,12px);font-size:12px}
:global(.resource-tools label){display:flex;flex-direction:column;align-items:stretch;gap:4px;margin:0}
:global(.resource-tools select){box-sizing:border-box;display:block;width:100%;min-width:0;margin:0;padding:6px 9px;font:inherit;color:inherit;background:var(--w-panel,white);border:1px solid var(--w-border,#ddd);border-radius:4px}
:global(.resource-tools p),:global(.resource-tools small){margin:0;padding:0}
</style>
