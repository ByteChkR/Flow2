<script>
 import NodeTree from './NodeTree.svelte';
 export let catalog;export let loading=false;export let tree;export let treeForSearch;export let disabled=false;export let onAdd;export let onDownload;
 let search='';
 $: filteredTree=treeForSearch?.(search)??tree;
 function add(event){onAdd?.(event.detail);}
</script>
<section class="node-toolbox-panel" aria-label="Node-Bibliothek"><div class="library-heading"><h2>Nodes</h2><span>{catalog?.catalog.nodes.filter(node=>!node.control?.start).length||0}</span></div>
 <button class="tree-download" disabled={loading||!catalog} title="Vollständigen Node-Baum mit Gruppen, technischen Namen und Laufzeiten als Text herunterladen" on:click={onDownload}>Node-Baum herunterladen</button>
 <input class="search" aria-label="Nodes suchen" type="search" placeholder="Nodes suchen …" bind:value={search}/>
 <div class="tree">{#if loading}<p class="muted" role="status">Nodes werden geladen …</p>{:else if !catalog}<p class="muted">Node-Katalog ist nicht verfügbar.</p>{:else}<NodeTree tree={filteredTree} expanded={!!search.trim()} {disabled} on:add={add}/>{/if}</div>
 <p class="library-help">Node auf den Graphen ziehen<br />oder zum Hinzufügen anklicken.<br />Gruppen: Node-Kopf hinein- oder herausziehen.<br />Shift+Ziehen auf der Fläche: Rechteckauswahl.<br />Strg/Shift-Klick: Mehrfachauswahl.<br />Strg+C / Strg+V: Kopieren / Einfügen.<br />Strg+A: Nodes, Kommentare und Gruppen auswählen.</p>
</section>
<style>
 .node-toolbox-panel{height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--f-panel,var(--w-panel));color:var(--f-text,var(--w-text));font:13px system-ui}.library-heading{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px}.library-heading h2{margin:0;font-size:14px}.library-heading span{font-size:11px;color:var(--f-muted,var(--w-muted));background:var(--f-bg,var(--w-bg));padding:2px 7px;border-radius:4px}.tree-download{margin:0 14px 8px;font:inherit;padding:6px 8px;border:1px solid var(--f-border,var(--w-border));border-radius:4px;background:var(--f-panel,var(--w-panel));color:inherit;cursor:pointer}.tree-download:disabled{opacity:.5;cursor:default}.search{margin:0 14px 10px;padding:8px 10px;background:var(--f-bg,var(--w-bg));color:inherit;border:1px solid var(--f-border,var(--w-border));border-radius:5px;font:inherit;font-size:12px}.tree{flex:1;min-height:0;overflow:auto;padding:0 10px}.muted{padding:8px;color:var(--f-muted,var(--w-muted));font-size:12px}.library-help{padding:12px 14px;margin:0;font-size:11px;line-height:1.6;color:var(--f-muted,var(--w-muted));border-top:1px solid var(--f-border,var(--w-border))}
</style>
