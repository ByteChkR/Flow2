<script>import EditorOverlayContent from './EditorOverlayContent.svelte';export let editor;export let tabId=undefined;</script>
{#each $editor.overlays.filter(overlay=>overlay.tabId===tabId) as overlay (overlay.id)}
 <EditorOverlayContent {editor} {overlay}/>
{/each}
