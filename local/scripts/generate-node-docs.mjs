import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const localRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repositoryRoot=resolve(localRoot,'..');
const generatedRoot=resolve(repositoryRoot,'docs/generated');
const nodeDirectory=resolve(generatedRoot,'nodes');
const typeDirectory=resolve(generatedRoot,'types');
const temporary=await mkdtemp(resolve(tmpdir(),'adam-flow2-node-docs-'));
const genericTypeDefinitions={
  array:{title:'Array<T>',description:'Geordnete Liste gleichartiger Werte.',parameters:['T']},
  dictionary:{title:'Dictionary<T>',description:'Wörterbuch mit String-Schlüsseln und Werten vom Typ T.',parameters:['T']},
  optional:{title:'Optional<T>',description:'Port kann unverbunden bleiben; falls ein Wert vorhanden ist, besitzt er den Typ T.',parameters:['T']},
  nullable:{title:'Nullable<T>',description:'Wert kann T oder null sein.',parameters:['T']},
  enumerable:{title:'Enumerable<T>',description:'Aufzählung von Werten vom Typ T.',parameters:['T']},
  queryable:{title:'Queryable<T>',description:'Abfragbare Menge von Werten vom Typ T.',parameters:['T']},
  orderedQueryable:{title:'OrderedQueryable<T>',description:'Sortierbare, abfragbare Menge von Werten vom Typ T.',parameters:['T']},
  grouping:{title:'Grouping<TKey, TItem>',description:'Gruppierte Werte mit Schlüssel und Elementtyp.',parameters:['TKey','TItem']},
  object:{title:'Object',description:'Struktureller Objektwert mit benannten Feldern.',parameters:[]},
  graph:{title:'Graph<T>',description:'Graph mit einer typisierten Schnittstelle.',parameters:['T']}
};

try {
  const serverCatalog=JSON.parse(execFileSync('dotnet',['run','--project','apps/NodeCatalog/NodeCatalog.csproj','--configuration','Release','--no-launch-profile','--nologo'],{cwd:localRoot,encoding:'utf8',stdio:['ignore','pipe','inherit']}));
  const browserBundle=resolve(temporary,'browser-registry.mjs');
  await build({entryPoints:[resolve(localRoot,'packages/runtime-browser/src/registry.ts')],bundle:true,format:'esm',platform:'node',target:'node20',outfile:browserBundle,tsconfig:resolve(localRoot,'tsconfig.json'),logLevel:'silent'});
  const {createStandardRegistry}=await import(`${pathToFileURL(browserBundle).href}?${Date.now()}`);
  const nodes=mergeCatalogs(serverCatalog,createStandardRegistry().nodes.catalog);
  const types=collectTypes(nodes);
  await rm(nodeDirectory,{recursive:true,force:true}); await rm(typeDirectory,{recursive:true,force:true});
  await mkdir(nodeDirectory,{recursive:true}); await mkdir(typeDirectory,{recursive:true});
  await writeFile(resolve(generatedRoot,'flow-docs.css'),style(),'utf8');
  for(const node of nodes) await writeFile(resolve(nodeDirectory,`${nodeSlug(node)}.html`),page(`${label(node)} · Node`,nodeDetail(node,types),breadcrumbs([{label:'Home',href:'../../'},{label:'Referenz',href:'../index.html'},{label:'Nodes',href:'index.html'},{label:`${node.type}@${node.version}`}]),referenceTree(nodes,types,'nodes')),'utf8');
  for(const type of staticTypes(types)) await writeFile(resolve(typeDirectory,`${type.slug}.html`),page(`${type.title} · Datentyp`,typePage(type,nodes,types),breadcrumbs([{label:'Home',href:'../../'},{label:'Referenz',href:'../index.html'},{label:'Typen',href:'index.html'},{label:type.title}]),referenceTree(nodes,types,'types')),'utf8');
  await writeFile(resolve(typeDirectory,'specialization.html'),page('Spezialisierter Datentyp',specializationPage(types),breadcrumbs([{label:'Home',href:'../../'},{label:'Referenz',href:'../index.html'},{label:'Typen',href:'index.html'},{label:'Spezialisierung'}]),referenceTree(nodes,types,'types')),'utf8');
  await writeFile(resolve(nodeDirectory,'index.html'),page('Standard-Nodes',nodeIndex(nodes,types),breadcrumbs([{label:'Home',href:'../../'},{label:'Referenz',href:'../index.html'},{label:'Nodes'}]),referenceTree(nodes,types,'nodes')),'utf8');
  await writeFile(resolve(typeDirectory,'index.html'),page('Datentypen',typeIndex(types,nodes),breadcrumbs([{label:'Home',href:'../../'},{label:'Referenz',href:'../index.html'},{label:'Typen'}]),referenceTree(nodes,types,'types')),'utf8');
  await writeFile(resolve(generatedRoot,'index.html'),page('Flow2-Referenz',landingPage(nodes,types),breadcrumbs([{label:'Home',href:'../'},{label:'Referenz'}]),referenceTree(nodes,types,'landing'),'flow-docs.css'),'utf8');
  await writeFile(resolve(generatedRoot,'nodes.md'),'# Standard-Node-Referenz\n\n[Home](../README.md) / Referenz / **Nodes**\n\n[Interaktive Node-Dokumentation öffnen](nodes/index.html)\n','utf8');
  await writeFile(resolve(generatedRoot,'types.md'),'# Datentypen\n\n[Home](../README.md) / Referenz / **Typen**\n\n[Interaktive Typ-Dokumentation öffnen](types/index.html)\n','utf8');
  process.stdout.write(`Wrote ${nodeDirectory} (${nodes.length} nodes) and ${typeDirectory} (${staticTypes(types).length} static type contracts, ${types.size-staticTypes(types).length} dynamic specializations).\n`);
} finally { await rm(temporary,{recursive:true,force:true}); }

function mergeCatalogs(...catalogs) {
  const merged=new Map();
  for(const catalog of catalogs) for(const definition of catalog.nodes) {
    const key=`${definition.type}@${definition.version}`, current=merged.get(key);
    if(!current) { merged.set(key,structuredClone(definition)); continue; }
    if(canonicalJson(contractShape(current))!==canonicalJson(contractShape(definition))) throw new Error(`Divergent node contract for ${key}.`);
    current.environments=[...new Set([...current.environments,...definition.environments])].sort();
    current.metadata={...definition.metadata,...current.metadata,inputs:{...definition.metadata?.inputs,...current.metadata?.inputs},outputs:{...definition.metadata?.outputs,...current.metadata?.outputs}};
  }
  return [...merged.values()].sort((a,b)=>category(a).localeCompare(category(b))||label(a).localeCompare(label(b))||a.type.localeCompare(b.type));
}

function collectTypes(nodes) {
  const types=new Map();
  const visit=type=>{
    if(!type||types.has(canonicalJson(type))) return;
    const key=canonicalJson(type), genericKind=genericKindFor(type);
    if(genericKind) ensureGenericType(types,genericKind);
    types.set(key,{key,type:structuredClone(type),slug:`type-${fileSlug(typeText(type))}`,title:typeText(type),genericKind});
    if(type.inner) visit(type.inner); if(type.items) visit(type.items); if(type.key) visit(type.key);
    for(const field of Object.values(type.fields??{})) visit(field);
    for(const parameter of [...(type.signature?.inputs??[]),...(type.signature?.outputs??[])]) visit(parameter.type);
  };
  for(const node of nodes) for(const type of [...Object.values(node.inputs),...Object.values(node.outputs)]) visit(type);
  return new Map([...types].sort(([,a],[,b])=>a.title.localeCompare(b.title)||a.key.localeCompare(b.key)));
}

function genericKindFor(type) { return Object.hasOwn(genericTypeDefinitions,type.kind)?type.kind:null; }
function ensureGenericType(types,kind) { const key=`generic:${kind}`; if(types.has(key)) return; const definition=genericTypeDefinitions[kind]; types.set(key,{key,type:{kind},slug:`generic-${kind}`,title:definition.title,isGeneric:true,genericKind:kind,description:definition.description,parameters:definition.parameters}); }

function nodeIndex(nodes,types) {
  return `<header class="hero"><p>Adam.Flow2 · generiert</p><h1>Standard-Nodes</h1><span>${nodes.length} portable Nodes aus den tatsächlichen Browser- und Backend-Registries.</span></header>
<main class="node-grid" id="node-list">${nodes.map(node=>nodePanel(node,types)).join('')}</main>${panelNavigationScript()}`;
}

function landingPage(nodes,types) {
  return `<header class="hero landing-hero"><p>Adam.Flow2 · generiert</p><h1>Flow2-Referenz</h1><span>Wähle eine Referenz, um die portablen Standardbausteine zu erkunden.</span></header><section class="landing-choice"><a href="nodes/index.html"><span class="landing-icon">◫</span><h2>Node-Dokumentation</h2><p>${nodes.length} Nodes mit Laufzeiten, Ein- und Ausgängen, Konfiguration und Metadaten.</p><strong>Nodes öffnen</strong></a><a href="types/index.html"><span class="landing-icon">◇</span><h2>Typ-Dokumentation</h2><p>${staticTypes(types).length} allgemeine Typverträge. Spezialisierungen sind bei ihrem generischen Typ verlinkt.</p><strong>Datentypen öffnen</strong></a></section>`;
}

function nodePanel(node,types) {
  const metadata=node.metadata??{}, id=`${node.type}@${node.version}`;
  return `<article class="node-panel" id="${nodeSlug(node)}" data-detail-href="${nodeSlug(node)}.html" tabindex="0" role="link" aria-label="${attr(`${label(node)} öffnen`)}">
<header><div><p>${html(category(node))}</p><h2>${html(label(node))}</h2><code>${html(id)}</code></div><div class="badges">${node.environments.map(runtimeBadge).join('')}</div></header>
${metadata.description?`<div class="description">${html(metadata.description)}</div>`:''}
<section class="ports"><div class="port-column inputs"><h3>Eingänge</h3>${ports(node.inputs,metadata.inputs,types,'input')}</div><div class="port-column outputs"><h3>Ausgänge</h3>${ports(node.outputs,metadata.outputs,types,'output')}</div></section>
${configuration(node)}${behavior(node)}</article>`;
}

function panelNavigationScript() {
  return `<script>for(const panel of document.querySelectorAll('[data-detail-href]')){const open=()=>location.href=panel.dataset.detailHref;panel.addEventListener('click',event=>{if(!event.target.closest('a'))open();});panel.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!event.target.closest('a')){event.preventDefault();open();}});}</script>`;
}

function nodeDetail(node,types) {
  const metadata=node.metadata??{}, id=`${node.type}@${node.version}`;
  return `<header class="detail-hero"><p>${html(category(node))}</p><div><div><h1>${html(label(node))}</h1><code>${html(id)}</code></div><div class="badges">${node.environments.map(runtimeBadge).join('')}</div></div></header>
<div class="node-detail-layout"><main class="node-documentation"><section><h2>Beschreibung</h2><p>${html(metadata.description??'Für diese Node ist keine zusätzliche Beschreibung hinterlegt.')}</p></section><section><h2>Übersicht</h2><dl class="facts"><div><dt>Node-ID</dt><dd><code>${html(node.type)}</code></dd></div><div><dt>Version</dt><dd>${node.version}</dd></div><div><dt>Gruppe</dt><dd>${html(category(node))}</dd></div><div><dt>Laufzeiten</dt><dd>${node.environments.map(runtime=>runtime==='server'?'Backend':'Browser').join(', ')}</dd></div></dl></section>${configuration(node)}${behavior(node)}</main><aside class="node-preview"><h2>Node-Vorschau</h2><p>Ports und Laufzeiten dieser Node.</p><div class="preview-card"><header><strong>${html(label(node))}</strong><div class="badges">${node.environments.map(runtimeBadge).join('')}</div></header><section class="preview-ports"><div class="port-column inputs"><h3>Eingänge</h3>${ports(node.inputs,metadata.inputs,types,'input')}</div><div class="port-column outputs"><h3>Ausgänge</h3>${ports(node.outputs,metadata.outputs,types,'output')}</div></section></div></aside></div>`;
}

function ports(values,metadata,types,direction) {
  const entries=Object.entries(values); if(!entries.length) return '<em>Keine Ports</em>';
  return `<ul class="port-list ${direction}">${entries.map(([name,type])=>{const info=metadata?.[name]??{},entry=types.get(canonicalJson(type)); return `<li><i></i><div><strong>${html(info.label??name)}</strong>${info.label&&info.label!==name?` <code>${html(name)}</code>`:''}<a class="type" href="../types/${typeHref(entry)}"><code>${html(typeText(type))}</code></a>${metadataText(info)}</div></li>`;}).join('')}</ul>`;
}

function configuration(node) {
  const fields=Object.entries(node.config??{}); if(!fields.length) return '';
  return `<section class="configuration"><h3>Konfiguration</h3><dl>${fields.map(([name,field])=>`<div><dt><code>${html(name)}</code> <span>${html(field.scalar??field.type)}</span></dt><dd>Standardwert: <code>${html(JSON.stringify(field.default))}</code>${metadataText(field)}</dd></div>`).join('')}</dl></section>`;
}

function behavior(node) {
  const items=[]; if(node.control) items.push(`Kontrollfluss: Eingang ${node.control.input?'ja':'nein'}, Ausgang ${node.control.output?'ja':'nein'}, Start ${node.control.start?'ja':'nein'}`); if(node.flowPort) items.push(`Flow-Schnittstelle: ${node.flowPort}`); if(node.value?.operation) items.push(`Wertoperation: ${node.value.operation}`);
  return items.length?`<section class="behavior"><h3>Verhalten</h3><ul>${items.map(item=>`<li>${html(item)}</li>`).join('')}</ul></section>`:'';
}

function typeIndex(types,nodes) {
  const all=staticTypes(types),card=type=>`<a class="type-card" href="${typeHref(type)}"><code>${html(type.title)}</code><span>${type.isGeneric?'Generischer Basistyp':`${typeUseCount(type,nodes)} direkter Port${typeUseCount(type,nodes)===1?'':'s'}`}</span></a>`;
  return `<header class="hero"><p>Adam.Flow2 · generiert</p><h1>Datentypen</h1><span>${all.length} allgemeine Typverträge aus den portablen Standard-Nodes.</span></header><section class="type-section"><h2>Generische Typen</h2><div class="type-grid">${all.filter(type=>type.isGeneric).map(card).join('')}</div></section><section class="type-section"><h2>Skalare und strukturelle Typen</h2><div class="type-grid" id="type-list">${all.filter(type=>!type.isGeneric).map(card).join('')}</div></section>`;
}

function typePage(type,nodes,types) {
  const uses=[];
  for(const node of nodes) for(const [direction,ports] of [['Eingang',node.inputs],['Ausgang',node.outputs]]) for(const [name,portType] of Object.entries(ports)) if(canonicalJson(portType)===type.key) uses.push({node,direction,name});
  const parent=!type.isGeneric&&type.genericKind?types.get(`generic:${type.genericKind}`):null;
  const description=type.description??typeDescription(type.type);
  const specializations=type.isGeneric?[...types.values()].filter(candidate=>!candidate.isGeneric&&candidate.genericKind===type.genericKind):[];
  return `<header class="hero"><p>Adam.Flow2 · Datentyp</p><h1><code>${html(type.title)}</code></h1><span>${html(description)}</span>${parent?`<p class="type-parent">Spezialisierung von <a href="${typeHref(parent)}"><code>${html(parent.title)}</code></a></p>`:''}</header><section class="type-visual"><h2>Struktur</h2>${typeDiagram(type,types)}</section>${type.isGeneric?`<section id="specializations"><h2>Bekannte Spezialisierungen</h2>${specializations.length?`<ul class="usage-list">${specializations.map(candidate=>`<li><a href="${typeHref(candidate)}"><code>${html(candidate.title)}</code></a></li>`).join('')}</ul>`:'<p>Für diesen Vertrag wurden noch keine Spezialisierungen verwendet.</p>'}</section>`:`<details class="type-json"><summary>JSON-Vertrag anzeigen</summary><pre><code>${html(JSON.stringify(type.type,null,2))}</code></pre></details>`}<section><h2>Direkte Verwendung</h2>${uses.length?`<ul class="usage-list">${uses.map(use=>`<li><a href="../nodes/${nodeSlug(use.node)}.html">${html(label(use.node))}</a> · ${html(use.direction)} <code>${html(use.name)}</code></li>`).join('')}</ul>`:'<p>Dieser Typ ist nur Bestandteil zusammengesetzter Typen.</p>'}</section><p class="back"><a href="index.html">Alle Datentypen</a> · <a href="../nodes/index.html">Alle Nodes</a></p>`;
}

function typeDiagram(entry,types) {
  if(entry.isGeneric) return `<div class="type-diagram generic"><strong>${html(entry.title)}</strong>${entry.parameters.length?`<div class="type-parameters">${entry.parameters.map(parameter=>`<span>${html(parameter)}</span>`).join('')}</div>`:'<small>Keine Typparameter</small>'}</div>`;
  return typeShape(entry.type,types);
}
function typeShape(type,types) {
  const typeEntry=types.get(canonicalJson(type)),link=typeEntry?`<a href="${typeHref(typeEntry)}"><code>${html(typeText(type))}</code></a>`:`<code>${html(typeText(type))}</code>`;
  if(type.kind==='object') return `<div class="type-diagram object"><strong>Object</strong><div class="type-fields">${Object.entries(type.fields??{}).map(([name,value])=>`<div><code>${html(name)}</code><span>${typeShape(value,types)}</span></div>`).join('')||'<em>Keine Felder</em>'}</div></div>`;
  if(type.kind==='grouping') return `<div class="type-diagram"><strong>Grouping</strong><div class="type-parameters"><span><small>TKey</small>${typeShape(type.key,types)}</span><span><small>TItem</small>${typeShape(type.items,types)}</span></div></div>`;
  if(type.inner) return `<div class="type-diagram"><strong>${html(type.kind)}</strong><div class="type-parameters"><span><small>T</small>${typeShape(type.inner,types)}</span></div></div>`;
  if(type.items) return `<div class="type-diagram"><strong>${html(type.kind)}</strong><div class="type-parameters"><span><small>T</small>${typeShape(type.items,types)}</span></div></div>`;
  return `<div class="type-diagram scalar">${link}</div>`;
}

function specializationPage(types) {
  const catalog=[...types.values()].filter(type=>!type.isGeneric&&type.genericKind).map(type=>({key:type.key,title:type.title,description:typeDescription(type.type),type:type.type,parent:{title:types.get(`generic:${type.genericKind}`).title,href:typeHref(types.get(`generic:${type.genericKind}`))}}));
  const script=`const catalog=${JSON.stringify(catalog)},entry=catalog.find(item=>item.key===new URLSearchParams(location.search).get('type')),title=document.getElementById('specialization-title'),description=document.getElementById('specialization-description'),parent=document.getElementById('specialization-parent'),visual=document.getElementById('specialization-visual'),json=document.getElementById('specialization-json'),labels={string:'String',array:'Array',dictionary:'Dictionary',optional:'Optional',nullable:'Nullable',enumerable:'Enumerable',queryable:'Queryable',orderedQueryable:'OrderedQueryable',entity:'Entity',entityRef:'EntityRef',grouping:'Grouping',graph:'Graph',object:'Object'};function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}function parameter(label,type){const value=element('span'),caption=element('small','',label);value.append(caption,shape(type));return value}function shape(type){const object=type.kind==='object',scalar=type.kind==='scalar',box=element('div','type-diagram'+(object?' object':'')+(scalar?' scalar':'')),heading=element('strong','',scalar?(type.name.startsWith('core.')?type.name.slice(5):type.name):(labels[type.kind]??type.kind));box.append(heading);if(object){const fields=element('div','type-fields'),entries=Object.entries(type.fields??{});if(!entries.length)fields.append(element('em','','Keine Felder'));for(const [name,value] of entries){const field=element('div'),label=element('code','',name),content=element('span');content.append(shape(value));field.append(label,content);fields.append(field)}box.append(fields);return box}if(type.kind==='grouping'){const parameters=element('div','type-parameters');parameters.append(parameter('TKey',type.key),parameter('TItem',type.items));box.append(parameters);return box}const nested=type.inner??type.items;if(nested){const parameters=element('div','type-parameters');parameters.append(parameter('T',nested));box.append(parameters)}return box}if(entry){title.textContent=entry.title;description.textContent=entry.description;const link=element('a');link.href=entry.parent.href;link.append(element('code','',entry.parent.title));parent.append('Spezialisierung von ',link);visual.append(shape(entry.type));json.textContent=JSON.stringify(entry.type,null,2)}else{title.textContent='Spezialisierung nicht gefunden';description.textContent='Der angeforderte Typ ist nicht im generierten Katalog enthalten.';document.querySelector('.type-visual').hidden=true;document.querySelector('.type-json').hidden=true}`;
  return `<header class="hero"><p>Adam.Flow2 · Datentyp</p><h1 id="specialization-title">Spezialisierter Datentyp</h1><span id="specialization-description">Der Typ wird aus dem Verweis geladen.</span><p class="type-parent" id="specialization-parent"></p></header><section class="type-visual"><h2>Struktur</h2><div id="specialization-visual"></div></section><details class="type-json"><summary>JSON-Vertrag anzeigen</summary><pre><code id="specialization-json"></code></pre></details><script>${script}</script>`;
}

function staticTypes(types) { return [...types.values()].filter(type=>type.isGeneric||!type.genericKind); }
function typeHref(type) { return type.genericKind&&!type.isGeneric?`specialization.html?type=${encodeURIComponent(type.key)}`:`${type.slug}.html`; }

function referenceTree(nodes,types,currentArea) {
  const groups=Object.groupBy(nodes,node=>category(node));
  const nodePath=node=>currentArea==='nodes'?`${nodeSlug(node)}.html`:currentArea==='types'?`../nodes/${nodeSlug(node)}.html`:`nodes/${nodeSlug(node)}.html`;
  const typePath=type=>currentArea==='types'?typeHref(type):currentArea==='nodes'?`../types/${typeHref(type)}`:`types/${typeHref(type)}`;
  const documentedTypes=staticTypes(types);
  return `<aside class="global-toc"><label for="tree-search">Referenz durchsuchen</label><input id="tree-search" type="search" placeholder="Nodes oder Datentypen"><div class="tree" id="reference-tree"><details open data-tree-branch><summary>Nodes <small>${nodes.length}</small></summary>${Object.entries(groups).map(([group,items])=>`<details open data-tree-branch><summary>${html(group)} <small>${items.length}</small></summary>${items.map(node=>`<a data-tree-item data-search="${attr(`${label(node)} ${node.type}@${node.version} ${group} ${node.environments.join(' ')}`)}" href="${nodePath(node)}"><strong>${html(label(node))}</strong><small>${html(`${node.type}@${node.version}`)}</small></a>`).join('')}</details>`).join('')}</details><details open data-tree-branch><summary>Datentypen <small>${documentedTypes.length}</small></summary>${documentedTypes.map(type=>`<a data-tree-item data-search="${attr(`${type.title} ${type.description??typeDescription(type.type)}`)}" href="${typePath(type)}"><strong>${html(type.title)}</strong><small>${type.isGeneric?'Generischer Typ':'Datentyp'}</small></a>`).join('')}</details></div></aside>${treeScript()}`;
}

function treeScript() {
  return `<script>const input=document.getElementById('tree-search'),items=[...document.querySelectorAll('[data-tree-item]')],branches=[...document.querySelectorAll('[data-tree-branch]')];function updateTree(){const query=input.value.trim().toLocaleLowerCase();for(const item of items)item.hidden=!!query&&!item.dataset.search.toLocaleLowerCase().includes(query);for(const branch of branches){const matches=[...branch.querySelectorAll(':scope > [data-tree-item],:scope > [data-tree-branch]')].some(child=>!child.hidden&&(!child.matches('[data-tree-branch]')||child.querySelector('[data-tree-item]:not([hidden])')));branch.hidden=!!query&&!matches;if(query&&matches)branch.open=true;}}input.addEventListener('input',updateTree);</script>`;
}

function metadataText(metadata={}) { const values=[]; if(metadata.description) values.push(metadata.description); if(metadata.order!==undefined) values.push(`Reihenfolge: ${metadata.order}`); if(metadata.options?.length) values.push(`Optionen: ${metadata.options.join(', ')}`); if(metadata.requiredWhen) values.push(`Erforderlich bei ${metadata.requiredWhen.config}=${metadata.requiredWhen.value}`); if(metadata.editor) values.push(`Editor: ${metadata.editor.kind} (${metadata.editor.editors.join(', ')})`); return values.length?`<small>${html(values.join(' · '))}</small>`:''; }
function typeDescription(type) { if(type.kind==='scalar') return `Skalarwert ${scalarLabel(type.name)}.`; if(type.kind==='optional') return `Optionaler Wert vom Typ ${typeText(type.inner)}.`; if(type.kind==='nullable') return `Wert vom Typ ${typeText(type.inner)} oder null.`; if(type.kind==='array') return `Liste von ${typeText(type.items)}.`; if(type.kind==='dictionary') return `Wörterbuch mit Werten vom Typ ${typeText(type.items)}.`; if(type.kind==='object') return 'Struktureller Objektwert.'; return `Typform ${typeLabel(type.kind)}.`; }
function typeUseCount(type,nodes) { return nodes.flatMap(node=>[...Object.values(node.inputs),...Object.values(node.outputs)]).filter(port=>canonicalJson(port)===type.key).length; }
function runtimeBadge(runtime) { return `<span class="badge ${runtime}">${runtime==='server'?'Backend':'Browser'}</span>`; }
function typeText(type) { if(type.kind==='scalar') return scalarLabel(type.name); if(['array','enumerable','queryable','orderedQueryable'].includes(type.kind)) return `${typeLabel(type.kind)}<${typeText(type.items)}>`; if(type.kind==='dictionary') return `${typeLabel(type.kind)}<${typeText(type.items)}>`; if(['optional','nullable'].includes(type.kind)) return `${typeLabel(type.kind)}<${typeText(type.inner)}>`; if(['entity','entityRef'].includes(type.kind)) return `${typeLabel(type.kind)}<${type.name}>`; if(type.kind==='object') return `Object { ${Object.entries(type.fields??{}).map(([name,value])=>`${name}: ${typeText(value)}`).join(', ')} }`; return typeLabel(type.kind); }
function scalarLabel(name) { return name.startsWith('core.')?name.slice('core.'.length):name; }
function typeLabel(kind) { return ({string:'String',array:'Array',dictionary:'Dictionary',optional:'Optional',nullable:'Nullable',enumerable:'Enumerable',queryable:'Queryable',orderedQueryable:'OrderedQueryable',entity:'Entity',entityRef:'EntityRef',grouping:'Grouping',graph:'Graph',object:'Object'})[kind]??kind; }
function nodeSlug(node) { return `node-${fileSlug(`${node.type}-${node.version}`)}`; }
function fileSlug(value) { return `${String(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)||'type'}-${createHash('sha256').update(value).digest('hex').slice(0,10)}`; }
function category(node) { return node.metadata?.category??'Ohne Kategorie'; }
function label(node) { return node.metadata?.label??node.type; }
function breadcrumbs(items) { return `<nav class="breadcrumbs">${items.map((item,index)=>`${index?'<span>/</span>':''}${item.href?`<a href="${attr(item.href)}">${html(item.label)}</a>`:`<strong>${html(item.label)}</strong>`}`).join('')}</nav>`; }
function page(title,content,breadcrumb,tree,stylesheet='../flow-docs.css') { return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${html(title)}</title><link rel="stylesheet" href="${attr(stylesheet)}"></head><body><div class="layout">${breadcrumb}<div class="documentation-layout">${tree}<main class="documentation-content">${content}</main></div></div></body></html>`; }
function style() { return ':root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#182033;background:#f6f7fb;line-height:1.45}*{box-sizing:border-box}body{margin:0}.layout{max-width:1420px;margin:auto;padding:26px 32px 64px}.breadcrumbs{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-bottom:30px;font-size:.9rem;color:#687287}.breadcrumbs a{color:#5438b0;font-weight:700;text-decoration:none}.breadcrumbs strong{color:#30394e}.documentation-layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px}.global-toc{position:sticky;top:18px;align-self:start;padding:13px;border:1px solid #dfe3ef;border-radius:12px;background:#fff;box-shadow:0 6px 18px #17203308}.global-toc>label{display:block;margin-bottom:6px;font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#5e6880}.global-toc>input{width:100%;padding:8px;border:1px solid #c8cede;border-radius:8px;font:inherit}.tree{max-height:calc(100vh - 160px);margin-top:12px;overflow:auto;font-size:.84rem}.tree details{margin:4px 0}.tree summary{cursor:pointer;font-weight:700}.tree summary small{color:#737d91;font-weight:500}.tree details details{margin-left:12px}.tree a{display:grid;gap:1px;padding:4px 6px;margin:2px 0;border-radius:6px;color:#273049;text-decoration:none}.tree a:hover{background:#f0edff}.tree a strong{font-size:.8rem}.tree a small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#697287;font-size:.7rem}.hero{margin:30px 0}.hero p,.detail-hero>p{margin:0;color:#7256d5;font-size:.8rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.hero h1{margin:.15rem 0 .45rem;font-size:2.2rem}.hero span{color:#586278}.detail-hero{margin:0 0 22px;padding:22px 24px;border:1px solid #dfdaf7;border-radius:16px;background:linear-gradient(120deg,#f3efff,#fbfaff)}.detail-hero>div{display:flex;justify-content:space-between;gap:16px;align-items:start}.detail-hero h1{margin:4px 0;font-size:2rem}.detail-hero code{color:#59637a}.landing-choice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.landing-choice>a{padding:26px;border:1px solid #dcd7f2;border-radius:16px;background:#fff;color:#1d2639;text-decoration:none;box-shadow:0 7px 22px #1720330a}.landing-choice>a:hover{border-color:#7458d5;transform:translateY(-2px)}.landing-choice h2{margin:8px 0}.landing-choice p{color:#59637a}.landing-choice strong{color:#5438b0}.landing-icon{font-size:2rem;color:#6042c7}.node-grid{display:grid;gap:18px}.node-panel{overflow:hidden;border:1px solid #dce1ef;border-radius:16px;background:#fff;box-shadow:0 7px 22px #1720330a;cursor:pointer}.node-panel:hover,.node-panel:focus{border-color:#7659d6;box-shadow:0 9px 25px #5438b01d;outline:none}.node-panel>header{display:flex;justify-content:space-between;gap:16px;padding:17px 20px 14px;background:linear-gradient(120deg,#f3efff,#fbfaff);border-bottom:1px solid #e4e0f6}.node-panel header p{margin:0 0 4px;color:#7256d5;font-weight:800;font-size:.77rem;text-transform:uppercase;letter-spacing:.05em}.node-panel h2{margin:0 0 4px;font-size:1.22rem}.node-panel code{color:#616b80;font-size:.82rem;overflow-wrap:anywhere}.badges{display:flex;gap:6px;align-items:start;flex-wrap:wrap}.badge{padding:4px 8px;border-radius:999px;font-size:.75rem;font-weight:750}.badge.browser{background:#ddf7ef;color:#11634f}.badge.server{background:#e8e4ff;color:#5036a1}.description{padding:15px 20px;color:#4d576e}.ports{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #eceef5}.port-column{padding:14px 20px}.port-column+.port-column{border-left:1px solid #eceef5}.port-column h3,.configuration h3,.behavior h3,section h2{margin:0 0 10px;font-size:.94rem}.port-list{padding:0;margin:0;list-style:none}.port-list li{display:flex;gap:9px;padding:8px 0;border-top:1px dashed #e4e7ef}.port-list li:first-child{border-top:0}.port-list i{width:10px;height:10px;flex:none;margin-top:6px;border:2px solid #ed5b5b;border-radius:50%}.outputs i{border-color:#2cc6a7}.port-list strong{font-size:.92rem}.port-list .type{display:block;margin-top:3px;color:#4d31ae;text-decoration:none;font-size:.82rem}.port-list small,.configuration small{display:block;margin-top:3px;color:#6a7488;font-size:.78rem}.port-column em{color:#8b94a7;font-size:.9rem}.configuration,.behavior{padding:14px 20px;border-top:1px solid #eceef5}.configuration dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:9px;margin:0}.configuration dl>div{padding:9px;border:1px solid #e8eaf2;border-radius:9px}.configuration dt{font-weight:700}.configuration dt span{font-size:.8rem;color:#697287;font-weight:500}.configuration dd{margin:4px 0 0;color:#59637a;font-size:.86rem}.behavior ul{margin:0;padding-left:19px;color:#59637a}.node-detail-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:22px;align-items:start}.node-documentation{display:grid;gap:16px}.node-documentation>section{padding:18px 20px;border:1px solid #dce1ef;border-radius:14px;background:#fff}.node-documentation p{margin:0;color:#4d576e}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin:0}.facts>div{padding:9px;border-radius:8px;background:#f7f8fc}.facts dt{font-size:.76rem;color:#687287}.facts dd{margin:2px 0 0;font-weight:650}.node-preview{position:sticky;top:24px}.node-preview>h2{margin:0 0 4px}.node-preview>p{margin:0 0 12px;color:#687287;font-size:.9rem}.preview-card{overflow:hidden;border:1px solid #d8ddef;border-radius:13px;background:#fff;box-shadow:0 6px 18px #1720330c}.preview-card>header{display:flex;justify-content:space-between;gap:10px;padding:12px 14px;background:#f3efff}.preview-ports{display:grid;grid-template-columns:1fr 1fr}.preview-ports .port-column{padding:12px 14px}.preview-ports .port-column+.port-column{border-left:1px solid #eceef5}.preview-ports .port-list li{padding:6px 0}.preview-ports .outputs{text-align:right}.preview-ports .outputs .port-list li{justify-content:flex-end;flex-direction:row-reverse}.preview-ports .outputs .type{margin-left:auto}.type-section{margin:0 0 28px}.type-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.type-card{display:grid;gap:6px;padding:15px;border:1px solid #dce1ef;border-radius:12px;background:#fff;color:#182033;text-decoration:none}.type-card:hover{border-color:#785cdb;box-shadow:0 5px 16px #17203312}.type-card span{font-size:.82rem;color:#697287}.type-parent{margin-top:12px!important;font-size:.9rem}.type-parent a{color:#5438b0}.type-visual{padding:18px 20px;margin-bottom:16px;border:1px solid #dce1ef;border-radius:14px;background:#fff}.type-diagram{display:inline-grid;gap:8px;min-width:180px;padding:13px;border:1px solid #cfc6f0;border-radius:11px;background:#f8f6ff}.type-diagram.scalar{display:inline-block;background:#f7f8fc;border-color:#dfe3ef}.type-diagram.object{display:block}.type-parameters{display:flex;gap:8px;flex-wrap:wrap}.type-parameters>span{display:grid;gap:3px;padding:7px;border:1px solid #dfd9f4;border-radius:7px;background:#fff}.type-parameters small{color:#687287}.type-fields{display:grid;gap:6px}.type-fields>div{display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:center;padding:8px;border-radius:7px;background:#fff}.type-json{padding:12px 16px;margin-bottom:16px;border:1px solid #dfe3ef;border-radius:12px;background:#fff}.type-json summary{cursor:pointer;font-weight:700}pre{overflow:auto;padding:16px;border-radius:12px;background:#202536;color:#e7ebf8}.usage-list{padding-left:20px}.usage-list a{color:#5036a1;font-weight:700}@media(max-width:1100px){.documentation-layout,.node-detail-layout{grid-template-columns:1fr}.global-toc,.node-preview{position:static}.tree{max-height:320px}.node-detail-layout{margin-top:22px}}@media(max-width:700px){.layout{padding:18px}.landing-choice,.facts,.preview-ports{grid-template-columns:1fr}.facts{grid-template-columns:1fr}.ports{grid-template-columns:1fr}.port-column+.port-column,.preview-ports .port-column+.port-column{border-left:0;border-top:1px solid #eceef5}.preview-ports .outputs{text-align:left}.preview-ports .outputs .port-list li{justify-content:start;flex-direction:row}.preview-ports .outputs .type{margin-left:0}.type-fields>div{grid-template-columns:1fr}.node-panel>header,.detail-hero>div{flex-direction:column}.hero h1{font-size:1.8rem}}'; }
function html(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function attr(value) { return html(value); }
function canonicalJson(value) { if(Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; if(value&&typeof value==='object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function contractShape(node) { const config=Object.fromEntries(Object.entries(node.config??{}).map(([name,field])=>{const {order,...shape}=field;return [name,shape];})); return {inputs:node.inputs,outputs:node.outputs,config,control:node.control,flowPort:node.flowPort,value:node.value}; }
