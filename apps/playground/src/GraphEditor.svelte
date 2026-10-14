<script lang="ts">
  import { parseContract, configDefaults } from '@adam-flow/flow-core';
  import type { Catalog, Flow, PortAddress, TypeRef, NodeDefinition, JsonValue } from '@adam-flow/flow-core';
  import { removeNode } from '@adam-flow/runtime-browser';
  let { json, catalog, disabled=false, onchange, connect }: {
    json:string;catalog:Catalog;disabled?:boolean;onchange:(flow:Flow)=>void;
    connect:(flow:Flow,source:PortAddress,target:PortAddress)=>Flow;
  } = $props();
  const draft = $derived.by(()=> {try {const flow=parseContract('flow',json);return new Set(flow.nodes.map(node=>node.id)).size===flow.nodes.length?flow:undefined;} catch {return undefined;} });
  let selected = $state('');
  let pending = $state<PortAddress>();
  let message = $state('');
  let config = $state('{}');
  let undo = $state<string[]>([]), redo = $state<string[]>([]);
  $effect(()=>{config=JSON.stringify(node?.config ?? {},null,2);});
  let choice = $state('0:server');
  let zoom = $state(0.85);
  let positions = $state<Record<string,{x:number;y:number}>>({});
  let drag: {id:string;x:number;y:number;startX:number;startY:number} | undefined;
  const node = $derived(draft?.nodes.find(item=>item.id===selected));
  const choices = $derived(catalog.nodes.flatMap((definition,index)=>definition.environments.map(environment=>({definition,environment,key:`${index}:${environment}`}))));
  const selectedChoice = $derived(choices.find(item=>item.key===choice) ?? choices[0]!);
  const width = $derived(Math.max(1000,...(draft?.nodes.map((item,index)=>point(item.id,index).x+260) ?? [])));
  const height = $derived(Math.max(410,...(draft?.nodes.map((item,index)=>point(item.id,index).y+nodeHeight(item)) ?? [])));
  const definition = (item:Flow['nodes'][number])=>catalog.nodes.find(d=>d.type===item.type && d.version===item.typeVersion);
  const selectedDefinition = $derived(node ? definition(node) : undefined);
  function ports(d:NodeDefinition|undefined,direction:'inputs'|'outputs') {
    return Object.entries(d?.[direction] ?? {}).sort(([a],[b])=>(d?.metadata?.[direction]?.[a]?.order ?? 0)-(d?.metadata?.[direction]?.[b]?.order ?? 0));
  }
  function setField(key:string,value:JsonValue) {
    if(disabled||!node)return;
    const next=structuredClone(draft!);next.nodes.find(item=>item.id===selected)!.config={...node.config,[key]:value};update(next);
  }
  function typeLabel(type:TypeRef):string {
    if(type.kind==='entity'||type.kind==='entityRef') return `${type.kind}<${type.name}>`;
    if(type.kind==='optional') return `${typeLabel(type.inner)}?`;
    if(type.kind==='array') return `${typeLabel(type.items)}[]`;
    return type.kind==='object'?'DTO / object':type.kind;
  }
  function nodeHeight(item:Flow['nodes'][number]) {const d=definition(item);return 98+Math.max(Object.keys(d?.inputs ?? {}).length,Object.keys(d?.outputs ?? {}).length)*42;}
  function point(id:string,index:number) {return Object.hasOwn(positions,id)?positions[id]!:{x:30+index*260,y:80};}
  function endpoint(address:PortAddress,output:boolean) {
    const index=draft!.nodes.findIndex(item=>item.id===address.nodeId);if(index<0) return undefined;
    const item=draft!.nodes[index]!,d=definition(item),p=point(item.id,index);
    const port=ports(d,output?'outputs':'inputs').findIndex(([name])=>name===address.port);if(port<0)return undefined;
    return {x:p.x+(output?220:0),y:p.y+94+port*42};
  }
  function path(edge:Flow['connections'][number]) {
    const a=endpoint(edge.source,true),b=endpoint(edge.target,false);if(!a||!b)return '';
    const bend=Math.max(55,Math.abs(b.x-a.x)/2);
    return `M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${b.x-bend} ${b.y}, ${b.x} ${b.y}`;
  }
  function choose(id:string) {selected=id;config=JSON.stringify(draft?.nodes.find(item=>item.id===id)?.config ?? {},null,2);}
  function update(value:Flow) {if(disabled)return;if(draft)undo=[...undo.slice(-49),json];redo=[];onchange(value);message='';}
  function history(back:boolean) {
    if(disabled)return;const stack=back?undo:redo,value=stack.at(-1);if(!value)return;
    if(back){undo=undo.slice(0,-1);redo=[...redo,json];}else{redo=redo.slice(0,-1);undo=[...undo,json];}
    onchange(parseContract('flow',value));pending=undefined;message='';
  }
  function add(fresh=false) {
    if(disabled)return;
    const {definition:d,environment}=selectedChoice;
    const next:Flow=fresh?{schemaVersion:1,id:'new-flow',version:1,mode:environment==='browser'?'interactive':'backend',nodes:[],connections:[]}:structuredClone(draft!);
    if(next.mode==='backend'&&environment==='browser'){message='Für Browser-Nodes zuerst den Flow-Modus auf interaktiv ändern.';return;}
    const base=d.type.split('.').at(-1)!.replace(/[^A-Za-z0-9_]/g,'_');let id=`node_${base}`,n=2;
    while(next.nodes.some(item=>item.id===id))id=`node_${base}_${n++}`;
    next.nodes.push({id,type:d.type,typeVersion:d.version,environment,config:configDefaults(d.config)});
    if(fresh){positions={};pending=undefined;}
    update(next);selected=id;config='{}';
  }
  function input(address:PortAddress) {
    if(disabled)return;
    if(!pending){message='Zuerst einen Ausgang, dann einen Eingang anklicken.';return;}
    try {update(connect(draft!,pending,address));pending=undefined;} catch(error){message=error instanceof Error?error.message:String(error);}
  }
  function saveConfig() {
    if(disabled||!node)return;
    try {
      const value:unknown=JSON.parse(config);
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Die Konfiguration muss ein JSON-Objekt sein.');
      const next=structuredClone(draft!);next.nodes.find(item=>item.id===selected)!.config=value as Flow['nodes'][number]['config'];
      parseContract('flow',JSON.stringify(next));update(next);
    } catch(error){message=error instanceof Error?error.message:String(error);}
  }
  function start(event:PointerEvent,id:string,index:number) {
    if(disabled||event.button!==0)return;choose(id);
    const p=point(id,index);drag={id,x:p.x,y:p.y,startX:event.clientX,startY:event.clientY};
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent) {
    if(!drag||disabled)return;
    positions={...positions,[drag.id]:{x:Math.max(10,drag.x+(event.clientX-drag.startX)/zoom),y:Math.max(10,drag.y+(event.clientY-drag.startY)/zoom)}};
  }
  function keyboard(event:KeyboardEvent,id:string,index:number) {
    const offsets:Record<string,[number,number]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
    const offset=offsets[event.key];if(disabled||!offset)return;event.preventDefault();
    const p=point(id,index);positions={...positions,[id]:{x:Math.max(10,p.x+offset[0]),y:Math.max(10,p.y+offset[1])}};
  }
  function download() {
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');
    a.href=url;a.download=`${draft?.id ?? 'flow'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
</script>

<section class="editor" aria-label="Grafischer Flow-Editor">
  <div class="heading"><div><p>VISUELLER EDITOR</p><h2>Nodes verbinden. Abläufe gestalten.</h2></div><button onclick={download}>JSON exportieren ↓</button></div>
  <div class="toolbar">
    <label>Node-Typ<select bind:value={choice} disabled={disabled}>{#each choices as item}<option value={item.key}>{item.definition.metadata?.category ?? 'Weitere'} / {item.definition.metadata?.label ?? item.definition.type} · v{item.definition.version} · {item.environment}</option>{/each}</select></label>
    <button onclick={()=>add()} disabled={disabled||!draft}>+ Node hinzufügen</button>
    <button onclick={()=>add(true)} disabled={disabled}>Neuer Flow</button>
    <button onclick={()=>history(true)} disabled={disabled||!draft||!undo.length}>Rückgängig</button><button onclick={()=>history(false)} disabled={disabled||!draft||!redo.length}>Wiederholen</button>
    <label>Ansicht<select bind:value={zoom}><option value={0.65}>65 %</option><option value={0.85}>85 %</option><option value={1}>100 %</option></select></label>
    <button onclick={()=>{positions={};}} disabled={disabled}>Anordnen</button>
  </div>
  {#if draft}
    <div class="metadata"><label>Flow-ID<input value={draft.id} disabled={disabled} onchange={event=>{const id=event.currentTarget.value;if(!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)){message='Flow-ID: Buchstabe oder Unterstrich, danach Buchstaben, Ziffern, Punkt oder Bindestrich.';event.currentTarget.value=draft.id;return;}update({...draft,id});}} /></label><label>Modus<select value={draft.mode} disabled={disabled} onchange={event=>update({...draft,mode:event.currentTarget.value as Flow['mode']})}><option value="interactive">Interaktiv</option><option value="backend">Backend</option></select></label><span>{draft.nodes.length} Nodes · {draft.connections.length} Verbindungen</span></div>
    <div class="workbench">
      <div class="viewport" aria-label="Zeichenfläche">
        <div style:width={`${width*zoom}px`} style:height={`${height*zoom}px`}>
          <div class="canvas" style:width={`${width}px`} style:height={`${height}px`} style:transform={`scale(${zoom})`}>
            <svg width={width} height={height} aria-hidden="true"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#557766" /></marker></defs>{#each draft.connections as edge}<path class:boundary={!!edge.codec} d={path(edge)} marker-end="url(#arrow)" />{/each}</svg>
            {#each draft.nodes as item,index (item.id)}
              {@const d=definition(item)}{@const p=point(item.id,index)}
              <article class="node" class:active={selected===item.id} class:server={item.environment==='server'} style:left={`${p.x}px`} style:top={`${p.y}px`} style:min-height={`${nodeHeight(item)}px`}>
                <button class="node-head" aria-label={`Node ${item.id} auswählen und verschieben`} disabled={disabled} onpointerdown={event=>start(event,item.id,index)} onpointermove={move} onpointerup={()=>{drag=undefined;}} onpointercancel={()=>{drag=undefined;}} onclick={()=>choose(item.id)} onkeydown={event=>keyboard(event,item.id,index)}><span>{item.environment==='server'?'SERVER':'BROWSER'} · v{item.typeVersion}</span><strong title={d?.metadata?.description}>{d?.metadata?.label ?? item.id}</strong><small>{item.id} · {item.type}</small></button>
                <div class="ports"><div>{#each ports(d,'inputs') as [name,type]}<button class="port input" disabled={disabled} aria-label={`Eingang ${item.id}.${name}`} title={`${name} · ${typeLabel(type)}${d?.metadata?.inputs?.[name]?.description ? ' — '+d.metadata.inputs[name]!.description : ''}`} onclick={()=>input({nodeId:item.id,port:name})}><i></i><span>{d?.metadata?.inputs?.[name]?.label ?? name}<small>{typeLabel(type)}</small></span></button>{/each}</div><div>{#each ports(d,'outputs') as [name,type]}<button class="port output" class:pending={pending?.nodeId===item.id&&pending.port===name} disabled={disabled} aria-label={`Ausgang ${item.id}.${name}`} title={`${name} · ${typeLabel(type)}${d?.metadata?.outputs?.[name]?.description ? ' — '+d.metadata.outputs[name]!.description : ''}`} onclick={()=>{pending={nodeId:item.id,port:name};message='';}}><span>{d?.metadata?.outputs?.[name]?.label ?? name}<small>{typeLabel(type)}</small></span><i></i></button>{/each}</div></div>
                {#if !d}<small>Node-Typ nicht im Katalog</small>{/if}
              </article>
            {/each}
          </div>
        </div>
      </div>
      <aside>
        <h3>{node ? selectedDefinition?.metadata?.label ?? node.id : 'Node auswählen'}</h3>
        {#if node}<p>{node.id} · {node.type} · {node.environment}</p>
        {#if selectedDefinition?.metadata?.description}<p>{selectedDefinition.metadata.description}</p>{/if}
        {#each Object.entries(selectedDefinition?.config ?? {}).sort(([,a],[,b])=>(a.order ?? 0)-(b.order ?? 0)) as [key,field]}
          <label for={`config-${key}`}>{field.label ?? key}</label>
          {#if field.type==='boolean'}
            <input id={`config-${key}`} type="checkbox" checked={Boolean(node.config[key] ?? field.default)} disabled={disabled} onchange={event=>setField(key,event.currentTarget.checked)} />
          {:else if field.type==='string'&&field.options}
            <select id={`config-${key}`} value={String(node.config[key] ?? field.default)} disabled={disabled} onchange={event=>setField(key,event.currentTarget.value)}>{#each field.options as option}<option value={option}>{option}</option>{/each}</select>
          {:else if field.type==='number'}
            <input id={`config-${key}`} type="number" step="any" value={Number(node.config[key] ?? field.default)} disabled={disabled} oninput={event=>{const value=event.currentTarget.valueAsNumber;if(Number.isFinite(value))setField(key,value);else message='Bitte eine gültige Zahl eingeben.';}} onblur={event=>{if(!Number.isFinite(event.currentTarget.valueAsNumber))event.currentTarget.value=String(node.config[key] ?? field.default);}} />
          {:else}
            <input id={`config-${key}`} type="text" value={String(node.config[key] ?? field.default)} disabled={disabled} oninput={event=>setField(key,event.currentTarget.value)} />
          {/if}
          {#if field.description}<p class="field-hint">{field.description}</p>{/if}
        {/each}
        <details class="raw-config"><summary>Konfiguration als JSON</summary><label for="node-config">Konfiguration (JSON)</label><textarea id="node-config" bind:value={config} disabled={disabled} spellcheck="false"></textarea><button onclick={saveConfig} disabled={disabled}>Konfiguration übernehmen</button></details><button class="danger" disabled={disabled||draft.nodes.length===1} title="Ein Flow benötigt mindestens eine Node." onclick={()=>{update(removeNode(draft,node.id));selected='';pending=undefined;}}>Node entfernen</button>{:else}<p>Kopf einer Node anklicken, um ihre Konfiguration zu bearbeiten. Zum Verschieben ziehen oder die Pfeiltasten benutzen.</p>{/if}
        <p class="legend"><span></span> Lokal <span class="boundary"></span> JSON / Codec</p>
      </aside>
    </div>
    <div class="notice" role="status">{#if message}{message}{:else if pending}Ausgang {pending.nodeId}.{pending.port} gewählt. Jetzt einen Eingang anklicken.{:else}Verbindung anlegen: Ausgang anklicken → Eingang anklicken. Die Zeichenfläche ist scrollbar.{/if}{#if pending}<button onclick={()=>{pending=undefined;message='';}}>Abbrechen</button>{/if}</div>
    <details><summary>Verbindungen bearbeiten ({draft.connections.length})</summary><ul>{#each draft.connections as edge,index}<li><span><strong>{edge.source.nodeId}.{edge.source.port} → {edge.target.nodeId}.{edge.target.port}</strong><small>{edge.codec?`${edge.codec.typeId} · Codec v${edge.codec.version} · JSON`:'Lokal'}</small></span><button disabled={disabled} aria-label={`Verbindung ${edge.source.nodeId}.${edge.source.port} nach ${edge.target.nodeId}.${edge.target.port} entfernen`} onclick={()=>update({...draft,connections:draft.connections.filter((_,i)=>i!==index)})}>Entfernen</button></li>{/each}</ul></details>
  {:else}<p class="notice">Die JSON-Definition ist noch nicht darstellbar. Bitte unten das Schema und eindeutige Node-IDs prüfen oder einen neuen Flow anlegen.</p>{/if}
  <p class="footnote">Positionen gelten für diese Ansicht. Der JSON-Export speichert den ausführbaren Flow ohne Layout. Ein neuer Flow ersetzt die aktuelle Definition.</p>
</section>
<style>
  .editor{margin-top:24px;background:white;border:1px solid #d8dfd9;border-radius:12px;overflow:hidden}.heading{display:flex;align-items:center;justify-content:space-between;padding:24px;gap:16px}.heading p{font-size:11px;letter-spacing:.15em;color:#537665;margin:0 0 7px}.heading h2{font-size:22px;margin:0}.toolbar,.metadata{display:flex;align-items:end;flex-wrap:wrap;gap:10px;padding:12px 24px;background:#f6f8f4;border-top:1px solid #d8dfd9}.metadata{background:white;padding-top:14px;padding-bottom:14px}.metadata span{font-size:12px;color:#63776b;align-self:center;margin-left:auto}label{font-size:12px;display:block;color:#42614f}input,select,textarea{display:block;border:1px solid #bdcdc2;border-radius:5px;padding:8px;margin-top:5px;font:inherit;background:white;color:#22352d;max-width:100%}button{font:inherit;font-size:12px;background:white;color:#274d3b;border:1px solid #bdcdc2;border-radius:5px;padding:9px 12px;cursor:pointer}button:hover{background:#e8efe8}button:disabled,input:disabled,select:disabled,textarea:disabled{opacity:.5;cursor:default}:focus-visible{outline:3px solid #82b595;outline-offset:2px}.workbench{display:grid;grid-template-columns:minmax(0,1fr) 260px;border-block:1px solid #d8dfd9}.viewport{overflow:auto;max-height:650px;min-height:350px;background-color:#f4f6f2;background-image:radial-gradient(#cbd7cc 1px,transparent 1px);background-size:20px 20px}.canvas{position:relative;transform-origin:top left}svg{position:absolute;inset:0;pointer-events:none}svg>path{fill:none;stroke:#557766;stroke-width:2.5}svg>path.boundary{stroke:#527bb0;stroke-dasharray:7 5}.node{position:absolute;width:220px;border:1px solid #9ab5a3;border-radius:9px;background:white;box-shadow:0 3px 10px #24372d0d}.node.active{outline:3px solid #70a98a;outline-offset:3px}.node-head{width:100%;height:74px;text-align:left;padding:10px 14px;background:#e9f3ed;border:0;border-bottom:1px solid #d8dfd9;border-radius:8px 8px 0 0;cursor:grab;touch-action:none;display:flex;flex-direction:column;gap:3px;overflow:hidden}.server .node-head{background:#eaf0f8}.node-head:active{cursor:grabbing}.node-head span{font-size:9px;letter-spacing:.09em}.node-head strong{font-size:14px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;width:100%}.node-head small{font-size:10px}.ports{display:grid;grid-template-columns:1fr 1fr}.port{display:flex;align-items:center;width:100%;height:42px;font-size:11px;border:0;padding:4px 0;gap:7px;position:relative;background:transparent}.port i{width:9px;height:9px;flex-shrink:0;border:2px solid #557766;background:white;border-radius:50%}.input{justify-content:flex-start;text-align:left;margin-left:-5px}.output{justify-content:flex-end;text-align:right;margin-left:5px}.port span{min-width:0;overflow:hidden;text-overflow:ellipsis}.port small{display:block;font-size:9px;white-space:nowrap;color:#64776d}.port.pending{background:#d7efdf}.port.pending i{background:#274d3b}aside{padding:18px;border-left:1px solid #d8dfd9;font-size:12px;overflow-wrap:anywhere}aside h3{font-size:15px;margin:0 0 10px}aside p{line-height:1.6;color:#63776b}textarea{width:100%;height:140px;font-family:monospace;resize:vertical}aside button{margin-top:10px;width:100%}.raw-config{padding:16px 0}.field-hint{font-size:11px}aside input:not([type=checkbox]),aside select{width:100%}.danger{color:#9c4431}.legend{display:flex;align-items:center;gap:7px;margin-top:24px;font-size:10px}.legend span{width:22px;border-top:2px solid #557766}.legend .boundary{border-top:2px dashed #527bb0}.notice{font-size:12px;line-height:1.6;padding:14px 24px;background:#eef4ee;color:#2c523d;overflow-wrap:anywhere}.notice button{margin-left:12px}details{padding:16px 24px;font-size:12px}summary{cursor:pointer}ul{list-style:none;padding:0}li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #e5ebe5}li span{overflow-wrap:anywhere}li small{display:block;color:#63776b;margin-top:4px}.footnote{font-size:11px;color:#63776b;padding:0 24px 12px}@media(max-width:850px){.workbench{grid-template-columns:1fr}aside{border-left:0;border-top:1px solid #d8dfd9}.heading{align-items:start}.heading h2{font-size:18px}.toolbar select{max-width:250px}}
</style>
