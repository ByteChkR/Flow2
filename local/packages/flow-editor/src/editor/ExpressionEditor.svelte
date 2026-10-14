<script>
  import GroupDeleteDialog from './GroupDeleteDialog.svelte';
  import {groupDeletion} from './layout.js';
 import ContextMenuStyles from './ContextMenuStyles.svelte';
  import {createEventDispatcher,onMount,onDestroy,tick} from 'svelte';
  import {TypeRegistry} from '@adam-flow/core/flow-core/types.js';
  import {stringExpressions,isStringExpression} from '@adam-flow/core/flow-core/string-expressions.js';
  import {expressionLabels,expressionInputs,analyzeExpression,expressionFields,removeExpressionNode} from './expression-model.js';
  import {typeLabel,initialValue} from './value-model.js';
  import {bezierPath,graphPoint,zoomAt,nodeTree,orientPorts} from './model.js';
  import NodeTree from './NodeTree.svelte';
  import {rememberNodes,rememberedNodes} from './clipboard.js';
  import {copyExpressionNodes,readExpressionNodes,pasteExpressionNodes,expressionClipboardMime} from './expression-clipboard.js';
  import Annotations from './Annotations.svelte';
  import SelectionRectangle from './SelectionRectangle.svelte';
  import {enclosedItems} from './canvas-selection.js';
  import {emptyLayout,assignGroups,transformAnnotation,moveSelection} from './layout.js';
  import ScalarInput from './ScalarInput.svelte';
  export let graph;
  export let layout=emptyLayout();
  let comments=structuredClone(layout.comments),groups=structuredClone(layout.groups);
  export let types;
  export let title='Bedingung';
  export let predicate=true;
  export let scalarResult=false;
  const dispatch=createEventDispatcher();
  let draft=structuredClone(graph),positions=Object.fromEntries(graph.nodes.map((node,index)=>[node.id,layout.positions[node.id]??{x:40+(index%3)*300,y:40+Math.floor(index/3)*270}]));
  let panel,canvas,drag,pending,error='',connectionError='',fieldNames={},search='',selected=[],notice='';
  let offset={x:0,y:0},zoom=1;
  const category=operation=>isStringExpression(operation)?(operation==='coalesce'?'Logik':'Text'):['external','parameter','property','optionalProperty','constant','record'].includes(operation)?'Daten':['and','or','xor','not','isNull','ternary'].includes(operation)?'Logik':['groupKey','groupElements','count','sum','min','max'].includes(operation)?'Gruppen und Aggregate':'Vergleiche';
  const palette=Object.entries(expressionLabels).map(([operation,label])=>({type:operation,version:1,environments:[],inputs:{},outputs:{},metadata:{label,category:category(operation),description:isStringExpression(operation)?stringExpressions[operation].description:undefined}}));
  $: tree=nodeTree(palette,search);
  const scalarNames=['core.Bool','core.Integer','core.Decimal','core.DateTimeOffset','core.TimeSpan','core.Guid'];
  let inferred=new Map(),validationTimer,validationPending=true;
  $: registry=new TypeRegistry(types);
  $: scheduleValidation(draft,types,registry,predicate,scalarResult);
  onDestroy(()=>clearTimeout(validationTimer));
  function scheduleValidation(value,typeDocument,typeRegistry,isPredicate,isScalar){
    clearTimeout(validationTimer);validationPending=true;
    validationTimer=setTimeout(()=>{
      const result=analyzeExpression(value,typeDocument,typeRegistry,isPredicate,isScalar);
      inferred=result.inferred;error=result.error;validationPending=false;
    },180);
  }
  $: edges=connections(draft,positions);
  $: preview=drag?.kind==='connection'&&drag.dragging?(drag.port.direction==='outputs'?bezierPath(portPoint(drag.port,draft,positions),drag.point):bezierPath(drag.point,portPoint(drag.port,draft,positions))):'';
  function portPoint(port,graph,layout){
    const node=graph.nodes.find(node=>node.id===port.nodeId),point=layout[port.nodeId];
    return {x:point.x+(port.direction==='outputs'?240:0),y:point.y+103+(port.direction==='inputs'?expressionInputs(node.operation,node.inputs).indexOf(port.port)*28:0)};
  }
  function connections(graph,layout){return graph.nodes.flatMap(node=>Object.entries(node.inputs).flatMap(([port,id])=>{
    if(!layout[id]||!layout[node.id])return [];
    const source=portPoint({nodeId:id,direction:'outputs'},graph,layout),target=portPoint({nodeId:node.id,port,direction:'inputs'},graph,layout);
    return [{id:`${node.id}/${port}`,nodeId:node.id,port,path:bezierPath(source,target),midpoint:{x:(source.x+target.x)/2,y:(source.y+target.y)/2}}];
  }));}
  function local(event){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function cancelGesture(){if(drag?.kind==='selection'&&canvas?.hasPointerCapture(drag.pointerId))canvas.releasePointerCapture(drag.pointerId);drag=undefined;pending=undefined;}
  function disconnect(id,port){const node=draft.nodes.find(node=>node.id===id);update(id,{inputs:{...node.inputs,[port]:''}});connectionError='';}

  function update(id,patch){connectionError='';draft={...draft,nodes:draft.nodes.map(node=>node.id===id?{...node,...patch}:node)};}
  function add(operation,point){
    const id=`expr_${crypto.randomUUID()}`;
    const node={id,operation,inputs:{}};
    if(operation==='record')node.inputs={Field:''};
    if(operation==='external'){node.type={kind:'string'};node.member='parameter';}
    if(operation==='constant'){node.type={kind:'string'};node.value='';}
    const position=point??graphPoint({x:canvas.clientWidth/2-120,y:canvas.clientHeight/2-80},offset,zoom);
    if(!point)while(Object.values(positions).some(p=>Math.abs(p.x-position.x)<24&&Math.abs(p.y-position.y)<24)){position.x+=32;position.y+=32;}
    positions={...positions,[id]:position};selected=[id];clearAnnotations();
    draft={...draft,nodes:[...draft.nodes,node]};
  }
  function connect(first,second){
    try{
      const {source,target}=orientPorts(first,second);
      if(source.nodeId===target.nodeId)throw new Error('Eine Node kann nicht mit sich selbst verbunden werden.');
      const node=draft.nodes.find(node=>node.id===target.nodeId);
      update(node.id,{inputs:{...node.inputs,[target.port]:source.nodeId}});connectionError='';
    }catch(cause){connectionError=String(cause);}
    pending=undefined;
  }
  function portClick(port){if(pending){const first=pending;pending=undefined;if(first.nodeId!==port.nodeId||first.direction!==port.direction||first.port!==port.port)connect(first,port);}else pending=port;}
  function portDown(event,port){
    if(event.button!==0)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.focus();connectionError='';
    drag={kind:'connection',pointerId:event.pointerId,port,x:event.clientX,y:event.clientY,dragging:false,point:graphPoint(local(event),offset,zoom)};
  }
  function nodeDown(event,id){if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.focus();pending=undefined;if(event.ctrlKey||event.metaKey||event.shiftKey){selected=selected.includes(id)?selected.filter(item=>item!==id):[...selected,id];return;}if(!selected.includes(id)){selected=[id];clearAnnotations();}drag={kind:'items',layout:assignGroups(structuredClone(currentLayout())),items:selectionItems(),x:event.clientX,y:event.clientY};}
  function panDown(event){if(event.button!==0||event.target.closest('article,.node-group,button,input,select,textarea'))return;event.preventDefault();canvas.focus();selected=[];clearAnnotations();pending=undefined;if(event.shiftKey){const point=local(event);drag={kind:'selection',origin:point,point,pointerId:event.pointerId};canvas.setPointerCapture(event.pointerId);return;}drag={kind:'pan',origin:{...offset},x:event.clientX,y:event.clientY};}
  let selectedComments=[],selectedGroups=[];
  function selectionItems(){return {nodes:selected,comments:selectedComments,groups:selectedGroups};}
  function setSelection(value){selected=value.nodes;selectedComments=value.comments;selectedGroups=value.groups;}
  function clearAnnotations(){selectedComments=[];selectedGroups=[];}
  function selectAnnotation(event,kind,id){
    const field=kind==='group'?'groups':'comments',items=selectionItems();
    if(event.ctrlKey||event.metaKey||event.shiftKey){setSelection({...items,[field]:items[field].includes(id)?items[field].filter(key=>key!==id):[...items[field],id]});return false;}
    if(!items[field].includes(id))setSelection({nodes:[],comments:[],groups:[],[field]:[id]});
    return true;
  }
  function currentLayout(){return {positions,comments,groups};}
  function applyLayout(next){positions=next.positions;comments=next.comments;groups=next.groups;}
  function save(){clearTimeout(validationTimer);const result=analyzeExpression(draft,types,registry,predicate,scalarResult);inferred=result.inferred;error=result.error;validationPending=false;if(error)return;dispatch('layoutsave',assignGroups(currentLayout()));dispatch('save',draft);}
  function addAnnotation(kind){const point={...annotationPoint},id=crypto.randomUUID();if(kind==='comment')comments=[...comments,{id,...point,text:''}];else groups=[...groups,{id,...point,name:'Neue Gruppe',color:'#60a5fa',width:520,height:360,nodeIds:[],commentIds:[]}];applyLayout(assignGroups(currentLayout()));canvasMenu.hidePopover();}
  function editAnnotation(kind,id,field,value){if(kind==='group')groups=groups.map(g=>g.id===id?{...g,[field]:value}:g);else comments=comments.map(c=>c.id===id?{...c,[field]:value}:c);}
  let groupDeleteRequest=null;
  function requestGroupDelete(ids,nodes=[],comments=[]){groupDeleteRequest={ids:[...ids],nodes:[...nodes],comments:[...comments],name:ids.length===1?groups.find(g=>g.id===ids[0])?.name??'Gruppe':`${ids.length} Gruppen`};}
  function deleteGroupChoice(contents){
    const removing=groupDeletion(currentLayout(),groupDeleteRequest.ids,contents);
    if(contents){removing.nodes=[...new Set([...removing.nodes,...groupDeleteRequest.nodes])];removing.comments=[...new Set([...removing.comments,...groupDeleteRequest.comments])];}
    groups=groups.filter(g=>!removing.groups.includes(g.id));
    comments=comments.filter(c=>!removing.comments.includes(c.id));
    for(const id of removing.nodes)remove(id);
    selected=[];clearAnnotations();
    applyLayout(assignGroups(currentLayout()));
  }
  function deleteAnnotation(kind,id){if(kind==='group'){requestGroupDelete([id]);return;}comments=comments.filter(item=>item.id!==id);applyLayout(assignGroups(currentLayout()));}
  function annotationStart(event,kind,id){if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.focus();pending=undefined;if(kind==='group'||kind==='comment'){if(!selectAnnotation(event,kind,id))return;drag={kind:'items',x:event.clientX,y:event.clientY,layout:assignGroups(structuredClone(currentLayout())),items:selectionItems()};return;}drag={kind,id,x:event.clientX,y:event.clientY,layout:assignGroups(structuredClone(currentLayout()))};}
  function annotationKey(event,kind,id){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?40:10,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;applyLayout((kind==='group'&&selectedGroups.includes(id)||kind==='comment'&&selectedComments.includes(id))?moveSelection(assignGroups(currentLayout()),selectionItems(),dx,dy):transformAnnotation(assignGroups(currentLayout()),kind,id,dx,dy));if(kind!=='group')applyLayout(assignGroups(currentLayout()));}
  let canvasMenu,menuPosition={x:0,y:0},annotationPoint;
  async function openCanvasMenu(event){if(event.type==='contextmenu'&&event.target.closest('article,.node-group'))return;event.preventDefault();event.stopPropagation();const rect=canvas.getBoundingClientRect(),x=event.clientX||rect.left+canvas.clientWidth/2,y=event.clientY||rect.top+canvas.clientHeight/2;annotationPoint=graphPoint({x:x-rect.left,y:y-rect.top},offset,zoom);menuPosition={x:Math.max(8,Math.min(x,window.innerWidth-210)),y:Math.max(8,Math.min(y,window.innerHeight-100))};await tick();canvasMenu.showPopover();canvasMenu.querySelector('button')?.focus();}
  function move(event){
    if(!drag)return;
    if(drag.kind==='selection'){if(event.pointerId!==drag.pointerId)return;drag={...drag,point:local(event)};setSelection(enclosedItems(canvas,drag.origin,drag.point));return;}
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(drag.kind==='items')applyLayout(moveSelection(drag.layout,drag.items,dx/zoom,dy/zoom));
    else if(drag.kind==='pan')offset={x:drag.origin.x+dx,y:drag.origin.y+dy};
    else if(['group','resize','resizeComment','comment'].includes(drag.kind))applyLayout(transformAnnotation(drag.layout,drag.kind,drag.id,dx/zoom,dy/zoom));
    else if(event.pointerId===drag.pointerId)drag={...drag,dragging:drag.dragging||Math.hypot(dx,dy)>4,point:graphPoint(local(event),offset,zoom)};
  }
  function finish(event){
    const current=drag;if(!current)return;
    if(current.kind==='selection'){if(event.pointerId!==current.pointerId)return;setSelection(enclosedItems(canvas,current.origin,local(event)));cancelGesture();return;}
    if(current.kind!=='connection'){drag=undefined;if(current.kind!=='pan'&&current.kind!=='group')applyLayout(assignGroups(currentLayout()));return;}
    if(event.pointerId!==current.pointerId)return;
    drag=undefined;
    if(!current.dragging){portClick(current.port);return;}
    pending=undefined;
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-expression-port]');
    if(target&&canvas.contains(target))connect(current.port,{nodeId:target.dataset.id,direction:target.dataset.direction,port:target.dataset.port});
  }
  function setZoom(next,point={x:canvas.clientWidth/2,y:canvas.clientHeight/2}){if(drag?.kind==='selection')return;next=Math.max(.35,Math.min(2,next));offset=zoomAt(point,offset,zoom,next);zoom=next;}
  function wheel(event){if(event.target.closest('.comment-preview,input,select,textarea'))return;event.preventDefault();setZoom(zoom*Math.exp(-event.deltaY*.001),local(event));}
  function drop(event){event.preventDefault();try{const {type}=JSON.parse(event.dataTransfer.getData('application/x-flow-expression'));if(Object.hasOwn(expressionLabels,type))add(type,graphPoint(local(event),offset,zoom));}catch{}}
  function remove(id){draft=removeExpressionNode(draft,id);const next={...positions};delete next[id];positions=next;selected=[];clearAnnotations();cancelGesture();}
  function constantType(node,name,nullable=node.type.kind==='nullable'){
    const base=name==='string'?{kind:'string'}:{kind:'scalar',name};const type=nullable?{kind:'nullable',inner:base}:base;
    update(node.id,{type,...(node.operation==='constant'?{value:initialValue(base)}:{})});
  }
  function editingText(event){return event.target.closest('input,select,textarea,[contenteditable]');}
  function selectionText(){return selected.length?JSON.stringify(copyExpressionNodes(draft,positions,selected)):'';}
  function pasteText(text){
    try{
      const fragment=readExpressionNodes(text);if(!fragment){notice='Die Zwischenablage enthält keine LINQ-Nodes.';return false;}
      const point=graphPoint({x:canvas.clientWidth/2-120,y:canvas.clientHeight/2-80},offset,zoom);
      while(Object.values(positions).some(p=>Math.abs(p.x-point.x)<24&&Math.abs(p.y-point.y)<24)){point.x+=32;point.y+=32;}
      const pasted=pasteExpressionNodes(draft,positions,fragment,point);
      draft=pasted.graph;positions=pasted.positions;selected=pasted.ids;clearAnnotations();cancelGesture();connectionError='';notice=`${selected.length} LINQ-Node(s) eingefügt.`;return true;
    }catch(cause){connectionError=String(cause);return true;}
  }
  function copy(event){
    if(editingText(event)){rememberNodes('');return;}
    const text=selectionText();if(!text||!event.clipboardData)return;
    event.clipboardData.setData(expressionClipboardMime,text);event.clipboardData.setData('text/plain',text);event.preventDefault();event.stopPropagation();rememberNodes(text);notice=`${selected.length} LINQ-Node(s) kopiert.`;
  }
  function paste(event){if(editingText(event)||!event.clipboardData)return;if(pasteText(event.clipboardData.getData(expressionClipboardMime)||event.clipboardData.getData('text/plain'))){event.preventDefault();event.stopPropagation();}}
  function key(event){
    if(groupDeleteRequest)return;
    if(!panel?.contains(event.target))return;
    if(!editingText(event)&&(event.ctrlKey||event.metaKey)&&!event.altKey){
      const shortcut=event.key.toLowerCase();
      if(shortcut==='a'){event.preventDefault();event.stopPropagation();setSelection({nodes:draft.nodes.map(node=>node.id),comments:comments.map(c=>c.id),groups:groups.map(g=>g.id)});return;}
      if(shortcut==='c'){const text=selectionText();if(!text)return;event.preventDefault();event.stopPropagation();rememberNodes(text);notice=`${selected.length} LINQ-Node(s) kopiert.`;try{navigator.clipboard?.writeText(text).catch(()=>{});}catch{}return;}
      if(shortcut==='v'&&rememberedNodes()){event.preventDefault();event.stopPropagation();pasteText(rememberedNodes());return;}
    }

    if(event.key==='Escape'&&canvasMenu?.matches(':popover-open')){event.stopPropagation();canvasMenu.hidePopover();canvas.focus();return;}
    if(event.key==='Escape'){event.stopPropagation();if(pending||drag){cancelGesture();}else if(selected.length||selectedComments.length||selectedGroups.length){selected=[];clearAnnotations();}else dispatch('close');}
    if(!event.target.closest('input,select,textarea,[contenteditable]')&&['Delete','Backspace'].includes(event.key)&&(selected.length||selectedComments.length||selectedGroups.length)){event.preventDefault();if(selectedGroups.length){requestGroupDelete(selectedGroups,selected,selectedComments);return;}comments=comments.filter(c=>!selectedComments.includes(c.id));for(const id of [...selected])remove(id);selected=[];clearAnnotations();applyLayout(assignGroups(currentLayout()));}
    if(event.key==='Tab'){
      const items=[...panel.querySelectorAll('button:not(:disabled),input,select,textarea,[tabindex="0"]')].filter(item=>item.getClientRects().length);
      if(event.shiftKey&&(document.activeElement===items[0]||document.activeElement===panel)){event.preventDefault();items.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}
    }
  }
  onMount(()=>{const previous=document.activeElement;panel.focus();return()=>{if(previous?.isConnected)previous.focus();};});
</script>
{#if groupDeleteRequest}<GroupDeleteDialog name={groupDeleteRequest.name} description="Beim Auflösen bleiben Nodes, Kommentare und Untergruppen erhalten. Beim Löschen wird der Gruppeninhalt einschließlich Untergruppen entfernt." onChoose={deleteGroupChoice} onClose={()=>groupDeleteRequest=null}/>{/if}
<ContextMenuStyles/>
<svelte:window on:pointermove={move} on:pointerup={finish} on:pointercancel={cancelGesture} on:blur={cancelGesture} on:keydown={key}/>
<div class="expression-backdrop">
  <section class="expression-editor" role="dialog" aria-modal="true" aria-label="Ausdruckseditor" tabindex="-1" bind:this={panel} on:copy={copy} on:paste={paste}>
    <header><strong>{title} · Ausdruckseditor</strong><span>Parameter: {typeLabel(draft.parameter)}</span><button on:click={()=>dispatch('close')}>Abbrechen</button><button disabled={validationPending||!!error} on:click={save}>Übernehmen</button></header>
    <div class="body">
      <aside aria-label="Ausdrucks-Nodes"><h3>Nodes <small>{palette.length}</small></h3><input class="search" aria-label="Ausdrucks-Nodes suchen" placeholder="Nodes suchen …" bind:value={search}/><div class="node-tree"><NodeTree {tree} expanded={!!search} showEnvironment={false} dragMime="application/x-flow-expression" on:add={event=>add(event.detail.type)}/></div><p>Node auf den Graphen ziehen oder anklicken. Ports ziehen oder nacheinander anklicken. Verbindung über × entfernen. Shift + Ziehen auf der Fläche wählt Nodes, Kommentare und Gruppen aus. Rechtsklick für Kommentare und Gruppen.</p></aside>
      <!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
      <div class="canvas" bind:this={canvas} tabindex="0" role="application" aria-label="Ausdrucksgraph" on:contextmenu={openCanvasMenu} on:keydown={event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)openCanvasMenu(event);}} on:pointerdown={panDown} on:wheel|nonpassive={wheel} on:dragover|preventDefault on:drop={drop} style={`background-position:${offset.x}px ${offset.y}px;background-size:${24*zoom}px ${24*zoom}px`}>
        {#if drag?.kind==='selection'}<SelectionRectangle start={drag.origin} end={drag.point}/>{/if}
        <div class="world" style={`transform:translate(${offset.x}px,${offset.y}px) scale(${zoom})`}>
          <Annotations {groups} {comments} {selectedComments} {selectedGroups} on:start={e=>annotationStart(e.detail.event,e.detail.kind,e.detail.id)} on:key={e=>annotationKey(e.detail.event,e.detail.kind,e.detail.id)} on:edit={e=>editAnnotation(e.detail.kind,e.detail.id,e.detail.field,e.detail.value)} on:remove={e=>deleteAnnotation(e.detail.kind,e.detail.id)}/>
          <svg class="edges"><g>{#each edges as edge (edge.id)}<path d={edge.path}/>{/each}{#if preview}<path class="connection-preview" d={preview}/>{/if}</g></svg>
          <svg class="edges unlink-layer">{#each edges as edge (edge.id)}<foreignObject x={edge.midpoint.x-10} y={edge.midpoint.y-10} width="20" height="20"><button class="unlink" title="Verbindung entfernen" aria-label="Verbindung entfernen" on:click={()=>disconnect(edge.nodeId,edge.port)}>×</button></foreignObject>{/each}</svg>
          {#each draft.nodes as node (node.id)}
            {@const output=inferred.get(node.id)}
            <article data-selectable-node={node.id} class:result={draft.result===node.id} class:selected={selected.includes(node.id)} aria-label={expressionLabels[node.operation]} style={`left:${positions[node.id].x}px;top:${positions[node.id].y}px`}>
              <div class="heading"><button class="drag" on:pointerdown={event=>nodeDown(event,node.id)} on:click={event=>{if(event.detail===0){selected=[node.id];clearAnnotations();}}}>{expressionLabels[node.operation]}</button><button aria-label={`${expressionLabels[node.operation]} entfernen`} on:click={()=>remove(node.id)}>×</button></div>
              <div class="node-meta"><span>LINQ-Ausdruck</span>{#if draft.result===node.id}<span class="result-label">Ergebnis</span>{/if}</div>
              <div class="ports"><div>{#each expressionInputs(node.operation,node.inputs) as port}<button class="port input" class:missing={!node.inputs[port]} class:pending={pending?.nodeId===node.id&&pending?.direction==='inputs'&&pending?.port===port} aria-label={`${expressionLabels[node.operation]}: Eingang ${port}`} data-expression-port data-id={node.id} data-port={port} data-direction="inputs" on:pointerdown={event=>portDown(event,{nodeId:node.id,direction:'inputs',port})} on:click={event=>{if(event.detail===0)portClick({nodeId:node.id,direction:'inputs',port});}}><i></i><span>{port}<small>{node.inputs[port]?(inferred.get(node.inputs[port])?typeLabel(inferred.get(node.inputs[port])):'?'):'Wert erforderlich'}</small></span></button>{/each}</div><div class="output"><button class="port" class:pending={pending?.nodeId===node.id&&pending?.direction==='outputs'} aria-label={`${expressionLabels[node.operation]}: Ausgang value`} data-expression-port data-id={node.id} data-port="value" data-direction="outputs" on:pointerdown={event=>portDown(event,{nodeId:node.id,direction:'outputs',port:'value'})} on:click={event=>{if(event.detail===0)portClick({nodeId:node.id,direction:'outputs',port:'value'});}}><span>value<small>{output?typeLabel(output):'?'}</small></span><i></i></button></div></div>
              <div class="settings">
                {#if isStringExpression(node.operation)}<small>{stringExpressions[node.operation].description}</small>{/if}
                {#if node.operation==='optionalProperty'}<small>Fehlt das Objekt, ist das Ergebnis null.</small>{/if}
                {#if node.operation==='ternary'}<small>condition: Bedingung · whenTrue: Ja-Wert · whenFalse: Nein-Wert. Nur der gewählte Zweig wird ausgewertet.</small>{/if}
                {#if node.operation==='record'}
                  {#each Object.keys(node.inputs) as name}<div class="record-field"><span>{name}</span><button aria-label={`Feld ${name} entfernen`} on:click={()=>update(node.id,{inputs:Object.fromEntries(Object.entries(node.inputs).filter(([field])=>field!==name))})}>×</button></div>{/each}
                  <label>Neues Feld<input aria-label="Neuer Feldname" bind:value={fieldNames[node.id]} placeholder="z. B. CustomerName"/></label>
                  <button disabled={!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(fieldNames[node.id]??'')||Object.hasOwn(node.inputs,fieldNames[node.id]??'')||Object.keys(node.inputs).length>=64} on:click={()=>{update(node.id,{inputs:{...node.inputs,[fieldNames[node.id]]:''}});fieldNames={...fieldNames,[node.id]:''};}}>Feld hinzufügen</button>
                {/if}
                {#if ['property','optionalProperty','sum','min','max'].includes(node.operation)}<label>Eigenschaft<select value={node.member??''} on:change={event=>update(node.id,{member:event.target.value||undefined})}><option value="">{['property','optionalProperty'].includes(node.operation)?'Auswählen …':'Elementwert (skalar)'}</option>{#each Object.entries(expressionFields(draft,node,types,inferred)) as [name,type]}<option value={name}>{name} · {typeLabel(type)}</option>{/each}</select></label>{/if}
                {#if node.operation==='external'}<label>Parametername<input value={node.member??''} on:input={event=>update(node.id,{member:event.target.value})}/></label>{/if}
                {#if node.operation==='constant'||node.operation==='external'}
                  {@const base=node.type.kind==='nullable'?node.type.inner:node.type}
                  <label>Typ<select value={base.kind==='string'?'string':base.name} on:change={event=>constantType(node,event.target.value)}><option value="string">String</option>{#each scalarNames as name}<option value={name}>{name.replace('core.','')}</option>{/each}</select></label>
                  <label class="check"><input type="checkbox" checked={node.type.kind==='nullable'} on:change={event=>constantType(node,base.kind==='string'?'string':base.name,event.target.checked)}/> Nullable</label>
                  {#if node.operation==='constant'&&node.type.kind==='nullable'}<label class="check"><input type="checkbox" checked={node.value===null} on:change={event=>update(node.id,{value:event.target.checked?null:initialValue(base)})}/> null</label>{/if}
                  {#if node.operation==='constant'&&node.value!==null}{#if base.kind==='scalar'}<ScalarInput scalar={base.name} value={node.value} on:value={event=>update(node.id,{value:event.detail})}/>{:else}<input aria-label="Konstantenwert" value={node.value} on:input={event=>update(node.id,{value:event.target.value})}/>{/if}{/if}
                {/if}
                <button class="result-button" aria-pressed={draft.result===node.id} on:click={()=>draft={...draft,result:node.id}}>Als Ergebnis verwenden</button>
              </div>
            </article>
          {/each}
        </div>
        <div class="viewport-controls"><button aria-label="Verkleinern" on:click={()=>setZoom(zoom/1.2)}>−</button><button aria-label="Zoom zurücksetzen" on:click={()=>setZoom(1)}>{Math.round(zoom*100)} %</button><button aria-label="Vergrößern" on:click={()=>setZoom(zoom*1.2)}>+</button></div>
      </div>
    </div>
    <footer role="status" class:error={!!(connectionError||(!validationPending&&error))}>{connectionError||(validationPending?'Prüfung ausstehend …':error)||notice|| (pending?'Gegenüberliegenden Port auswählen.':'Ausdruck gültig.')} · Ergebnis: {draft.result||'Keines'}</footer>
  <div class="canvas-menu flow2-context-menu" popover="auto" role="menu" tabindex="-1" aria-label="Canvas-Aktionen" bind:this={canvasMenu} style={`left:${menuPosition.x}px;top:${menuPosition.y}px`} on:keydown={event=>{if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...canvasMenu.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}}}><button role="menuitem" on:click={()=>addAnnotation('comment')}>+ Kommentar</button><button role="menuitem" on:click={()=>addAnnotation('group')}>+ Gruppe</button></div>
  </section>
</div>
<style>


  .unlink-layer{z-index:2}
  .record-field{display:flex;justify-content:space-between;align-items:center}.record-field button:not(:where([role=menuitem])){padding:2px 6px}
  .expression-backdrop{position:fixed;inset:0;z-index:12000;background:#0006;padding:20px;display:flex}.expression-editor{display:flex;flex-direction:column;width:100%;height:100%;background:var(--f-bg);color:var(--f-text);border:1px solid var(--f-border);border-radius:8px;overflow:hidden;font-size:13px}header{display:flex;align-items:center;gap:15px;padding:12px;background:var(--f-panel);border-bottom:1px solid var(--f-border)}header span{flex:1;color:var(--f-muted)}button:not(:where([role=menuitem])),input,select{font:inherit;color:inherit;background:var(--f-panel);border:1px solid var(--f-border);border-radius:4px;padding:6px;min-width:0}button:not(:where([role=menuitem])){cursor:pointer}button:not(:where([role=menuitem])):disabled{opacity:.5;cursor:default}button:not(:where([role=menuitem])):focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--f-brand)}.body{display:flex;flex:1;min-height:0}aside{width:190px;flex:none;padding:12px;border-right:1px solid var(--f-border);overflow:auto}aside p{font-size:11px;color:var(--f-muted)}h3{margin:0 0 10px;font-size:13px}.canvas{flex:1;overflow:auto;position:relative;background-image:radial-gradient(var(--f-border) 1px,transparent 1px);background-size:20px 20px}.world{position:relative}.edges{position:absolute;inset:0;width:1px;height:1px;overflow:visible;pointer-events:none}.edges path{fill:none;stroke:var(--f-brand);stroke-width:2}article{position:absolute;width:240px;background:var(--f-panel);border:1px solid var(--f-border);border-radius:6px;box-shadow:0 3px 10px #0001}article.result{outline:2px solid var(--f-brand)}.heading{height:44px;display:flex;border-bottom:1px solid var(--f-border)}.heading button:not(:where([role=menuitem])){border:0;background:transparent}.drag{flex:1;text-align:left;cursor:grab;touch-action:none;font-weight:600}.ports{display:flex;min-height:28px;justify-content:space-between}.ports button:not(:where([role=menuitem])){display:block;border:0;padding:4px 0;height:28px;font-size:11px;touch-action:none}.input{margin-left:-4px}.output{margin-right:-4px}.missing,.error{color:#dc2626}.settings{padding:10px;display:flex;flex-direction:column;gap:8px}.settings label{display:flex;flex-direction:column;gap:4px}.settings .check{flex-direction:row;align-items:center}.result-button{font-size:11px}footer{padding:10px;background:var(--f-panel);border-top:1px solid var(--f-border);overflow-wrap:anywhere}@media(max-width:700px){.expression-backdrop{padding:0}aside{width:130px}header{flex-wrap:wrap}}
  aside{order:2;width:260px;padding:0;border-right:0;border-left:1px solid var(--f-border);display:flex;flex-direction:column;overflow:hidden;background:var(--f-panel)}h3{display:flex;justify-content:space-between;padding:18px 16px 8px;margin:0}h3 small{color:var(--f-muted);font-weight:400}.search{margin:8px 16px 12px;padding:9px 10px;background:var(--f-bg)}.node-tree{flex:1;overflow:auto;padding:0 12px}aside p{padding:12px 16px;margin:0;border-top:1px solid var(--f-border);line-height:1.6}.canvas{overflow:hidden;touch-action:none}.world{position:absolute;inset:0;transform-origin:0 0}.heading{background:color-mix(in srgb,var(--f-brand) 18%,var(--f-panel));box-shadow:inset 0 3px var(--f-brand);border-radius:6px 6px 0 0}.drag{padding:12px}.node-meta{height:44px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 12px;font-size:11px;color:var(--f-muted)}.result-label{color:var(--f-brand);font-weight:600}article{box-sizing:border-box}article.result{outline:none}article.selected{outline:2px solid var(--f-brand)}.ports{padding-bottom:10px;min-height:38px}.ports>div{width:50%;min-width:0}.ports .port{position:relative;display:flex;align-items:center;gap:7px;width:100%;height:28px;box-sizing:border-box;padding:0 12px;text-align:left;font-size:11px;background:transparent}.input,.output{margin:0}.output .port{justify-content:flex-end;text-align:right}.port span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:12px}.port small{display:block;overflow:hidden;text-overflow:ellipsis;font-size:9px;line-height:10px;color:var(--f-muted)}.port i{position:absolute;left:-5px;width:9px;height:9px;box-sizing:border-box;border-radius:50%;border:2px solid var(--f-brand);background:var(--f-panel)}.output .port i{left:auto;right:-5px}.port:hover i,.port.pending i{background:var(--f-brand)}.port.missing i{border-color:#dc2626}.settings{border-top:1px solid var(--f-border)}.edges .connection-preview{stroke-dasharray:6 4;opacity:.7}.unlink{pointer-events:auto;width:20px;height:20px;padding:0;border-radius:50%;font-size:12px;color:var(--f-muted)}.viewport-controls{position:absolute;left:18px;bottom:18px;display:flex;box-shadow:0 2px 8px #0000000d}.viewport-controls button:not(:where([role=menuitem])){border-radius:0;min-width:32px;padding:7px 9px;font-size:12px}@media(max-width:700px){aside{width:190px}}
</style>
