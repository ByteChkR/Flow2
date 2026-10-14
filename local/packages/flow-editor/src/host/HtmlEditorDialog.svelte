<script>
 import {hostComponents,hostComponentLoaders,loadHostComponent} from '@adam/editor/host.js';
 $: direct=$hostComponents.HtmlEditorDialog;
 $: loader=$hostComponentLoaders.HtmlEditorDialog;
</script>
{#if direct}<svelte:component this={direct} {...$$restProps} on:select on:value on:change on:input on:save on:close on:cancel on:complete on:navigate on:confirm><slot/></svelte:component>
{:else if loader}{#await loadHostComponent(loader)}<span role="status">Wird geladen …</span>{:then component}<svelte:component this={component} {...$$restProps} on:select on:value on:change on:input on:save on:close on:cancel on:complete on:navigate on:confirm><slot/></svelte:component>{:catch error}<p role="alert">Ansicht konnte nicht geladen werden: {String(error)}</p>{/await}{/if}
