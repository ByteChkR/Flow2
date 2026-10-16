<script>
 import {createEventDispatcher} from 'svelte';
 export let active=false;
 const dispatch=createEventDispatcher();
</script>
<button class="rail-button" aria-label="Node-Bibliothek" title="Node-Bibliothek" aria-pressed={active} on:click={()=>dispatch('open')}>▦</button>
<style>.rail-button{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:1px solid var(--w-border);border-radius:5px;background:var(--w-panel);color:inherit;font:inherit;font-size:18px;cursor:pointer}.rail-button[aria-pressed=true]{border-color:var(--w-brand);background:color-mix(in srgb,var(--w-brand) 14%,var(--w-panel))}.rail-button:hover{border-color:var(--w-brand)}.rail-button:focus-visible{outline:2px solid var(--w-brand);outline-offset:2px}</style>
