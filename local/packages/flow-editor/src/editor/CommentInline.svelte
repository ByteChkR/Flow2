<script>
 export let tokens=[];
</script>
{#each tokens as token}{#if token.kind==='strong'}<strong><svelte:self tokens={token.children}/></strong>{:else if token.kind==='em'}<em><svelte:self tokens={token.children}/></em>{:else if token.kind==='del'}<del><svelte:self tokens={token.children}/></del>{:else if token.kind==='code'}<code>{token.text}</code>{:else}{token.text}{/if}{/each}
