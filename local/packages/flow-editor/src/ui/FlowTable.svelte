<script>
  import ValueInput from '../editor/ValueInput.svelte';
  import {cellText,cellError,resolveColumns,tableView} from '@adam-flow/runtime-browser/ui/table-model.js';
  export let panel;
  export let flow;
  const data=flow.data;
  const rowType=flow.type(panel.field).items;
  const columns=resolveColumns(rowType,panel.columns);
  let filters={},sortField='',direction=1,page=1,pageSize=panel.pageSize;
  $: rows=flow.read($data,panel.field)??[];
  $: selected=flow.read($data,panel.selectionField)??[];
  $: view=tableView(rows,rowType,filters,sortField,direction);
  $: pages=Math.max(1,Math.ceil(view.length/pageSize));
  $: if(page>pages)page=pages;
  $: visible=view.slice((page-1)*pageSize,page*pageSize);
  function sort(field){if(sortField===field)direction=-direction;else {sortField=field;direction=1;}page=1;}
  function filter(field,value){filters={...filters,[field]:value};page=1;}
  function select(index,checked){flow.write(panel.selectionField,panel.selection==='single'?(checked?[index]:[]):checked?[...new Set([...selected,index])]:selected.filter(i=>i!==index));}
  function selectVisible(checked){const indices=visible.map(item=>item.index);flow.write(panel.selectionField,checked?[...new Set([...selected,...indices])]:selected.filter(i=>!indices.includes(i)));}
  function change(index,field,value){const next=rows.map((row,i)=>{if(i!==index)return row;const copy={...row};if(value===undefined)delete copy[field];else copy[field]=value;return copy;});flow.write(panel.field,next);}
</script>
<div class="flow-table">
  <div class="table-tools"><span>{view.length} von {rows.length} Zeilen{panel.selection!=='none'?` · ${selected.length} ausgewählt`:''}</span>{#if panel.selection!=='none'&&selected.length}<button on:click={()=>flow.write(panel.selectionField,[])}>Auswahl aufheben</button>{/if}<button on:click={()=>{filters={};sortField='';page=1;}}>Ansicht zurücksetzen</button></div>
  <!-- Scrollable table region must be keyboard-focusable. -->
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <div class="scroll" tabindex="0" role="region" aria-label="Prozesstabelle">
    <table>
      <thead><tr>
        {#if panel.selection!=='none'}<th class="selection">{#if panel.selection==='multiple'}<input type="checkbox" aria-label="Sichtbare Zeilen auswählen" disabled={!visible.length} checked={visible.length>0&&visible.every(item=>selected.includes(item.index))} on:change={event=>selectVisible(event.target.checked)}/>{:else}Auswahl{/if}</th>{/if}
        {#each columns as column}<th style:min-width={`${column.width??160}px`} aria-sort={sortField===column.field?(direction===1?'ascending':'descending'):'none'}><button on:click={()=>sort(column.field)}>{column.label??column.field}{sortField===column.field?(direction===1?' ↑':' ↓'):''}</button>{#if column.required}<span title="Pflichtfeld"> *</span>{/if}</th>{/each}
      </tr><tr>{#if panel.selection!=='none'}<th></th>{/if}{#each columns as column}<th><input aria-label={`${column.label??column.field} filtern`} value={filters[column.field]??''} placeholder="Filtern …" on:input={event=>filter(column.field,event.target.value)}/></th>{/each}</tr></thead>
      <tbody>{#each visible as {row,index} (index)}<tr class:selected={selected.includes(index)}>
        {#if panel.selection!=='none'}<td class="selection"><input type="checkbox" aria-label={`Zeile ${index+1} auswählen`} checked={selected.includes(index)} on:change={event=>select(index,event.target.checked)}/></td>{/if}
        {#each columns as column}<td>
          {#if panel.editable&&!column.readonly}
            <ValueInput type={rowType.fields[column.field]} value={row[column.field]} label={`Zeile ${index+1}: ${column.label??column.field}`} on:value={event=>change(index,column.field,event.detail.value)}/>
            {@const error=cellError(rowType.fields[column.field],row[column.field],column.required)}
            {#if error}<small class="error">{error}</small>{/if}
          {:else}<span class="cell-text">{cellText(row[column.field])}</span>{/if}
        </td>{/each}
      </tr>{:else}<tr><td colspan={Math.max(1,columns.length+(panel.selection!=='none'?1:0))}>Keine Zeilen vorhanden.</td></tr>{/each}</tbody>
    </table>
  </div>
  <div class="pagination"><label>Zeilen pro Seite <select bind:value={pageSize} on:change={()=>page=1}>{#each [...new Set([10,25,50,100,panel.pageSize])].sort((a,b)=>a-b) as size}<option value={size}>{size}</option>{/each}</select></label><button disabled={page===1} on:click={()=>page--}>Vorherige Seite</button><span>Seite {page} von {pages}</span><button disabled={page===pages} on:click={()=>page++}>Nächste Seite</button></div>
</div>
<style>.flow-table{display:flex;flex-direction:column;gap:8px;min-width:0}.scroll{overflow:auto;max-height:60vh;border:1px solid #b8bdc5}.table-tools,.pagination{display:flex;gap:10px;align-items:center;flex-wrap:wrap}table{border-collapse:separate;border-spacing:0;width:100%;font-size:13px}thead{position:sticky;top:0;z-index:1;background:#f2f4f6}th,td{padding:4px 6px;text-align:left;vertical-align:top;border-right:1px solid #c9cdd3;border-bottom:1px solid #c9cdd3}th:last-child,td:last-child{border-right:0}tbody tr:last-child td{border-bottom:0}.selected{background:#ddf4ed}.selection{min-width:52px;width:52px;text-align:center}th input{width:100%;min-width:80px;box-sizing:border-box}.selection input{width:auto;min-width:0}.cell-text{white-space:pre-wrap;overflow-wrap:anywhere}button,input,select{font:inherit;color:inherit;background:white;border:1px solid #c9cdd3;border-radius:4px;padding:4px 7px}button:disabled{opacity:.5}th button{border:0;background:transparent;font-weight:600;padding:0;text-align:left}.error{display:block;color:#b91c1c}label{display:flex;gap:6px;align-items:center}</style>
