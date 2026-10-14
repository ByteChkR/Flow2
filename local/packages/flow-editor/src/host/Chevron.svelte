<script>
 import {hostComponents} from "@adam/editor/host.js";
</script>
<svelte:component this={$hostComponents.Chevron} {...$$restProps} on:select on:value on:change on:input on:save on:close on:cancel on:complete on:navigate on:confirm><slot/></svelte:component>
