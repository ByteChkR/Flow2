<script>
 export let iconComponent;
 export let editor;
 export let commands=[];
 export let context={};
 let buttons={};
 export function focus(id){buttons[id]?.focus();}
</script>
{#each commands.filter(command=>command.visible?.(context)!==false) as command (command.id)}
 <button bind:this={buttons[command.id]} class:icon-button={!!command.icon&&!!iconComponent} aria-label={command.label} title={command.label} disabled={command.enabled?.(context)===false} on:click={()=>editor.execute(command,context)}>{#if command.icon&&iconComponent}<svelte:component this={iconComponent} icon={command.icon}/>{:else}{command.label}{/if}</button>
{/each}
<style>button{font:inherit;color:inherit;border:1px solid var(--w-border);border-radius:5px;background:var(--w-panel);padding:6px 9px;cursor:pointer}button:hover{border-color:var(--w-brand)}button:disabled{opacity:.5;cursor:default}.icon-button{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:7px}.icon-button :global(svg){width:18px;height:18px}button:focus-visible{outline:2px solid var(--w-brand)}</style>
