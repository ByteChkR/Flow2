<script>
 export let panel;export let flow;
 const data=flow.data;
 $: selected=flow.read($data,panel.field)??[];
 let search='';
 function toggle(item,checked){flow.write(panel.field,panel.multiple?(checked?[...selected,item.id]:selected.filter(id=>id!==item.id)):(checked?[item.id]:[]));}
</script>
<label>Optionen suchen <input type="search" bind:value={search}/></label>
<div class="options">
 {#each panel.options.filter(item=>(item.label+' '+(item.description??'')).toLocaleLowerCase().includes(search.toLocaleLowerCase())) as item}
 <label class="option"><input type={panel.multiple?'checkbox':'radio'} name={panel.field.join('.')} checked={selected.includes(item.id)} disabled={item.disabled} on:change={event=>toggle(item,event.target.checked)}/><span>{item.label}{item.required&&panel.checklist?' *':''}{#if item.description}<small>{item.description}</small>{/if}</span></label>
 {/each}
</div>
{#if selected.length}<button on:click={()=>flow.write(panel.field,[])}>Auswahl zurücksetzen</button>{/if}
<style>.options{border:1px solid #aaa;max-height:50vh;overflow:auto;margin:8px 0}.option{display:flex;gap:10px;padding:8px;border-bottom:1px solid #ddd}.option:last-child{border-bottom:0}small{display:block;color:#666}input[type=search]{width:100%;padding:6px}button{font:inherit;padding:6px}</style>
