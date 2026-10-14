<script>
 import {selectionBounds} from './canvas-selection.js';
 export let start;export let end;
 $: bounds=selectionBounds(start,end);
</script>
<div class="selection-rectangle" aria-hidden="true" style={`left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px`}></div>
<style>.selection-rectangle{position:absolute;z-index:20;pointer-events:none;border:1px solid var(--f-brand);background:color-mix(in srgb,var(--f-brand) 15%,transparent);box-sizing:border-box}</style>
