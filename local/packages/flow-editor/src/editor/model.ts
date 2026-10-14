import type { NodeDefinition } from '@adam-flow/core/flow-core/index.js';
export interface Point {x:number;y:number}
/** Incomplete layouts are valid drafts. Use the same deterministic position for nodes and edges. */
export function nodePosition(flow:import('@adam-flow/core/flow-core/index.js').Flow,positions:Record<string,Point>,nodeId:string):Point {
  const saved=positions[nodeId];
  if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))return saved;
  const index=Math.max(0,flow.nodes.findIndex(node=>node.id===nodeId));
  return {x:70+(index%3)*320,y:100+Math.floor(index/3)*320};
}
export function completeNodePositions(flow:import('@adam-flow/core/flow-core/index.js').Flow,positions:Record<string,Point>):Record<string,Point>{
  let result=positions;
  for(const node of flow.nodes){const position=nodePosition(flow,positions,node.id);if(position!==positions[node.id]){if(result===positions)result={...positions};result[node.id]=position;}}
  return result;
}
export interface NodeToolboxEntry {type:string;version:number;label:string;category:string;hidden?:boolean}
export interface NodeTree {name:string;children:NodeTree[];nodes:NodeDefinition[];entries?:NodeTreeEntry[]}
export type NodeTreeEntry={kind:'branch';branch:NodeTree}|{kind:'node';node:NodeDefinition};
export function nodeTreeEntries(tree:NodeTree):NodeTreeEntry[]{return tree.entries??[...tree.children.map(branch=>({kind:'branch' as const,branch})),...tree.nodes.map(node=>({kind:'node' as const,node}))];}
export function nodeTree(nodes:NodeDefinition[],search='',layout:NodeToolboxEntry[]=[]):NodeTree {
  const root:NodeTree={name:'Nodes',children:[],nodes:[]};
  const terms=search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const placements=new Map(layout.map((entry,index)=>[`${entry.type}@${entry.version}`,{...entry,index}]));
  const ranks=new Map<object,number>();
  for(const original of nodes) {
    const workspaceNode=!!original.graph?.graphId&&original.nodeId!=='reference';
    const placement=workspaceNode?undefined:placements.get(`${original.type}@${original.version}`);
    if(placement?.hidden)continue;
    const node=placement?{...original,metadata:{...original.metadata,label:placement.label,category:placement.category}}:original;
    const rank=placement?.index??(workspaceNode?Number.MAX_SAFE_INTEGER-(original.graph?.operation==='reference'?2:1):Number.MAX_SAFE_INTEGER);
    ranks.set(node,rank);
    const path=(node.metadata?.category||'Weitere').split('/').filter(Boolean);
    const text=[...path,node.metadata?.label,node.type].join(' ').toLocaleLowerCase();
    if(!terms.every(term=>text.includes(term)))continue;
    let current=root;
    for(const name of path) {
      let child=current.children.find(item=>item.name===name);
      if(!child){child={name,children:[],nodes:[]};current.children.push(child);}
      ranks.set(child,Math.min(ranks.get(child)??Number.MAX_SAFE_INTEGER,rank));
      current=child;
    }
    current.nodes.push(node);
  }
  function sort(tree:NodeTree){tree.children.sort((a,b)=>a.name.localeCompare(b.name));tree.nodes.sort((a,b)=>(a.metadata?.label||a.type).localeCompare(b.metadata?.label||b.type));tree.children.forEach(sort);}
  sort(root);
  if(layout.length){
    function order(tree:NodeTree){
      tree.children.forEach(order);
      tree.entries=nodeTreeEntries(tree).sort((a,b)=>(ranks.get(a.kind==='branch'?a.branch:a.node)??Number.MAX_SAFE_INTEGER)-(ranks.get(b.kind==='branch'?b.branch:b.node)??Number.MAX_SAFE_INTEGER));
    }
    order(root);
  }
  return root;
}
/** Export all branches, in the same order as the palette, with two spaces per level. */
export function nodeTreeText(tree:NodeTree):string {
  const lines:string[]=[];
  const singleLine=(value:string)=>value.replace(/[\r\n\t]+/g,' ');
  function visit(branch:NodeTree,depth:number){
    lines.push('  '.repeat(depth)+singleLine(branch.name));
    for(const entry of nodeTreeEntries(branch)){
      if(entry.kind==='branch'){visit(entry.branch,depth+1);continue;}
      const node=entry.node;
      const environments=node.environments.map(env=>env==='server'?'Backend':'Browser').join(', ');
      lines.push('  '.repeat(depth+1)+`${singleLine(node.metadata?.label||node.type)} [${singleLine(node.type)}@${node.version}] (${environments})`);
    }
  }
  visit(tree,0);
  return lines.join('\n')+'\n';
}
export function graphPoint(point:Point,offset:Point,zoom:number):Point {return {x:(point.x-offset.x)/zoom,y:(point.y-offset.y)/zoom};}
export function zoomAt(point:Point,offset:Point,oldZoom:number,newZoom:number):Point {
  const world=graphPoint(point,offset,oldZoom);return {x:point.x-world.x*newZoom,y:point.y-world.y*newZoom};
}

export interface EditorPort {nodeId:string;port:string;direction:'inputs'|'outputs';kind?:'data'|'control'}
export function orientPorts(first:EditorPort,second:EditorPort) {
  if((first.kind||'data')!==(second.kind||'data'))throw new Error('Daten- und Ablauf-Ports können nicht verbunden werden.');
  if(first.direction===second.direction)throw new Error('Ein Ausgang muss mit einem Eingang verbunden werden.');
  const [source,target]=first.direction==='outputs'?[first,second]:[second,first];
  return {source:{nodeId:source.nodeId,port:source.port},target:{nodeId:target.nodeId,port:target.port},...(first.kind==='control'?{kind:'control' as const}:{})};
}
export function bezierPath(source:Point,target:Point):string {
  const bend=Math.max(60,Math.abs(target.x-source.x)/2);
  return `M ${source.x} ${source.y} C ${source.x+bend} ${source.y}, ${target.x-bend} ${target.y}, ${target.x} ${target.y}`;
}
/** Entity setters expose hundreds of optional ports; reveal only used or explicitly selected fields. */
export function visibleInputPorts(node:import('@adam-flow/core/flow-core/index.js').Flow['nodes'][number],definition:NodeDefinition,connections:import('@adam-flow/core/flow-core/index.js').Flow['connections'],selected:string[]=[]):string[] {
  const ports=Object.keys(definition.inputs);
  if(node.type!=='Backend.EF.SetFields')return ports;
  const connected=new Set(connections.filter(edge=>edge.kind!=='control'&&edge.target.nodeId===node.id).map(edge=>edge.target.port));
  return ports.filter(port=>!port.startsWith('field_')||connected.has(port)||selected.includes(port)||!!node.inlineInputs?.[port]?.enabled||Object.hasOwn(node.inlineInputs?.[port]??{},'value'));
}
export function portPosition(flow:import('@adam-flow/core/flow-core/index.js').Flow,definitions:Record<string,NodeDefinition>,positions:Record<string,Point>,address:EditorPort,selected:Record<string,string[]>={}):Point {
  const node=flow.nodes.find(node=>node.id===address.nodeId)!;
  const definition=(definitions[`${node.type}@${node.typeVersion}/${node.id}`]??definitions[`${node.type}@${node.typeVersion}`])!;
  const control=address.kind==='control';
  const index=control?0:(address.direction==='inputs'?visibleInputPorts(node,definition,flow.connections,selected[node.id]):Object.keys(definition.outputs)).indexOf(address.port)+(definition.control?1:0);
  const position=nodePosition(flow,positions,node.id);
  return {x:position.x+(address.direction==='outputs'?240:0),y:position.y+103+index*28};
}
/** Explicit inputs let Svelte invalidate the entire geometry when a node moves. */
export function connectionPaths(flow:import('@adam-flow/core/flow-core/index.js').Flow,definitions:Record<string,NodeDefinition>,positions:Record<string,Point>,selected:Record<string,string[]>={}) {
  return flow.connections.map(edge=>{
    const source=portPosition(flow,definitions,positions,{...edge.source,direction:'outputs',kind:edge.kind||'data'},selected);
    const target=portPosition(flow,definitions,positions,{...edge.target,direction:'inputs',kind:edge.kind||'data'},selected);
    const from=flow.nodes.find(node=>node.id===edge.source.nodeId)!.environment,to=flow.nodes.find(node=>node.id===edge.target.nodeId)!.environment;
    return {boundary:from!==to,transition:`${from==='server'?'Backend':'Browser'} → ${to==='server'?'Backend':'Browser'}`,path:bezierPath(source,target),midpoint:{x:(source.x+target.x)/2,y:(source.y+target.y)/2}};
  });
}
