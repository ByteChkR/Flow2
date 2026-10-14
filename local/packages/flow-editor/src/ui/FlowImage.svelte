<script>
  import {normalizeIcon} from '@adam-flow/runtime-browser/ui/presentation.js';
  import Svg from '../host/Svg.svelte';
  export let value='';
  export let fullSize=false;
</script>
{#if value}<span class="image" class:fullSize><Svg icon={normalizeIcon(value)} /></span>{/if}
<style>.image{display:inline-flex;width:32px;height:32px;flex:none}.image :global(img),.image :global(svg),.image :global(div){width:100%;height:100%;object-fit:contain}.image.fullSize{display:block;width:100%;height:auto}.fullSize :global(img),.fullSize :global(svg),.fullSize :global(div){width:100%;height:auto;max-height:60vh}</style>
