import {resolveDefinition,definitionKey} from './node-resolution.js';
import {flowDesignations} from './designations.js';
import {isHybridType} from './graphs.js';
import {validateInlineInputs} from './inline-inputs.js';
import { canonicalJson } from './transport.js';
import { flowInterface,validateInterface } from './interface.js';
import { activeNodes } from './control.js';
import { inputRequired, validateConfig, validateNodeMetadata } from './config.js';
import type { Catalog, Diagnostic, Flow, NodeDefinition, TypeDocument } from './model.js';
import { ContractError, validateSchema,parseContract } from './schema.js';
import {queryOperation} from './query-nodes.js';
import {expressionTypes} from './expressions.js';
import { isAssignable, TypeRegistry } from './types.js';

export function validateFlow(flowValue: unknown, catalogValue: unknown, typesValue: unknown): Diagnostic[] {
  const errors: Diagnostic[] = [];
  for (const [name, value] of [['flow', flowValue], ['catalog', catalogValue], ['types', typesValue]] as const) {
    errors.push(...validateSchema(name, value).map(d => ({ ...d, path: `/${name}${d.path}` })));
  }
  if (errors.length) return errors;
  const flow = flowValue as Flow, catalog = catalogValue as Catalog;
  let registry: TypeRegistry;
  try { registry = new TypeRegistry(typesValue as TypeDocument); }
  catch (error) { if (error instanceof ContractError) return error.diagnostics; throw error; }
  const add = (code: string, path: string, message: string) => { errors.push({ code, path, message }); };
  const definitions = new Map<string, NodeDefinition>();
  for (const [index, node] of catalog.nodes.entries()) {
    errors.push(...validateNodeMetadata(node));
    if(node.control && ((node.control.start && (node.control.input || !node.control.output || Object.keys(node.inputs).length>0)) || (node.control.output&&!node.control.input&&!node.control.start&&node.graph?.operation!=='invoke'))) add('control_contract',`/catalog/nodes/${index}`,'Invalid Start/control contract.');
    const key = definitionKey(node);
    if (definitions.has(key)) add('duplicate_node_type', `/catalog/nodes/${index}`, `Duplicate node definition ${key}.`);
    definitions.set(key, node);
    for (const ports of [node.inputs, node.outputs]) for (const [port, type] of Object.entries(ports)) errors.push(...registry.check(type, `/catalog/nodes/${index}/${port}`));
  }
  const nodes = new Map<string, typeof flow.nodes[number]>();
  const resolved = new Map<string, NodeDefinition>();
  const edges = new Map<string, Set<string>>();
  for (const [index, node] of flow.nodes.entries()) {
    const path = `/flow/nodes/${index}`;
    if (nodes.has(node.id)) add('duplicate_node', path, `Duplicate node ID ${node.id}.`);
    nodes.set(node.id, node); edges.set(node.id, new Set());
    const definition = resolveDefinition(catalog,node);
    if (!definition) { add('unknown_node_type', path, `Unknown node ${node.type}@${node.typeVersion}.`); continue; }
    resolved.set(node.id, definition);
    if(canonicalJson(node.graph??null)!==canonicalJson(definition.graph??null))add('graph_binding',path,'Graph binding differs from its node definition.');
    if(canonicalJson(node.value??null)!==canonicalJson(definition.value??null))add('value_binding',path,'Value binding differs from its node definition.');
    if(canonicalJson(node.query??null)!==canonicalJson(definition.query??null))add('query_binding',path,'Query binding differs from its node definition.');
    for(const binding of ['ef','ui'] as const)if(canonicalJson(node[binding]??null)!==canonicalJson(definition[binding]??null))add(binding+'_binding',path,'Binding differs from its node definition.');
    errors.push(...validateInlineInputs(node,definition,flow,registry));
    errors.push(...validateConfig(definition.config,node.config,`${path}/config`));
    if(queryOperation(node)&&definition.config?.expression&&!(node.query?.operation==='any'&&!node.query.predicate)){
      try{
        const graph=parseContract('expression',String(node.config.expression??definition.config.expression.default));
        const query=definition.inputs.query;
        if((query?.kind!=='queryable'&&query?.kind!=='orderedQueryable')||canonicalJson(graph.parameter)!==canonicalJson(query.items))throw new Error('Ausdrucksparameter passt nicht zur Query.');
        const output=expressionTypes(graph,typesValue as TypeDocument).get(graph.result);
        const parameters=Object.fromEntries(graph.nodes.filter(n=>n.operation==='external').map(n=>[n.member!,n.type!]));
        if(canonicalJson(parameters)!==canonicalJson(node.query?.parameters??{}))throw new Error('Query-Parameter stimmen nicht mit dem Ausdruck überein.');
        if((node.query?.operation==='select'||node.query?.operation==='groupBy')&&canonicalJson(output)!==canonicalJson(node.query.result))throw new Error('Query-Ergebnistyp stimmt nicht mit dem Ausdruck überein.');
        if(['where','any','all'].includes(queryOperation(node)!)&&canonicalJson(output)!==canonicalJson({kind:'scalar',name:'core.Bool'}))throw new Error('Bedingung muss Bool ergeben.');
        const key=output?.kind==='nullable'?output.inner:output;
        if(['orderBy','thenBy'].includes(queryOperation(node)!)&&key?.kind!=='scalar'&&key?.kind!=='string')throw new Error('Sortierschlüssel muss skalar sein.');
      }catch(error){add('expression',`${path}/config/expression`,String(error));}
    }
    if (!definition.environments.includes(node.environment)) add('environment', path, `Node ${node.id} is unavailable in ${node.environment}.`);
    if (flow.mode === 'hybrid' && (!definition.environments.includes('server') || !definition.environments.includes('browser')||![...Object.values(definition.inputs),...Object.values(definition.outputs)].every(isHybridType))) add('hybrid_node',path,'Hybrid graphs require both server and browser implementations for every node.');
    if (flow.mode === 'backend' && node.environment === 'browser') add('mode', path, 'Backend flows cannot contain browser nodes.');
  }
  const starts=flow.nodes.filter(node=>resolved.get(node.id)?.control?.start);
  if(starts.length!==1)add('start','/flow/nodes','Each graph requires exactly one Start node.');
  if(flow.entryNodeId!==undefined&&flow.entryNodeId!==starts[0]?.id)add('entry','/flow/entryNodeId','Entry must be the Start node.');
  const connectedInputs = new Set<string>();
  const controlEdges=new Set<string>();
  const incoming = new Set<string>();
  for (const [index, connection] of flow.connections.entries()) {
    const path = `/flow/connections/${index}`;
    const { source, target } = connection;
    if (!nodes.has(source.nodeId) || !nodes.has(target.nodeId)) { add('unknown_node', path, 'Connection refers to an unknown node.'); continue; }
    edges.get(source.nodeId)!.add(target.nodeId); incoming.add(target.nodeId);
    if(connection.kind==='control') {
      if(!resolved.get(source.nodeId)?.control?.output||!resolved.get(target.nodeId)?.control?.input||source.port!=='out'||target.port!=='in')add('control_port',path,'Control edges require a control output and input.');
      if(connection.codec)add('control_codec',path,'Control edges have no data codec.');
      const key=`${source.nodeId}/${target.nodeId}`;
      if(controlEdges.has(key))add('duplicate_control',path,'Duplicate control connection.');
      controlEdges.add(key);continue;
    }
    const sourcePorts = resolved.get(source.nodeId)?.outputs;
    const targetPorts = resolved.get(target.nodeId)?.inputs;
    if (!sourcePorts || !targetPorts) continue;
    if (!Object.hasOwn(sourcePorts, source.port) || !Object.hasOwn(targetPorts, target.port)) { add('unknown_port', path, 'Connection refers to an unknown port.'); continue; }
    const key = `${target.nodeId}/${target.port}`;
    if (connectedInputs.has(key)) add('multiple_inputs', path, 'An input port accepts only one connection.');
    connectedInputs.add(key);
    if (!isAssignable(sourcePorts[source.port]!, targetPorts[target.port]!, registry)) add('type_mismatch', path, `${source.nodeId}.${source.port} is incompatible with ${target.nodeId}.${target.port}.`);
  }
  const active=activeNodes(flow,catalog);
  errors.push(...validateInterface(flowInterface(flow,catalog),active));
  for(const [index,edge] of flow.connections.entries())if(active.has(edge.target.nodeId)&&!active.has(edge.source.nodeId))add('inactive_dependency',`/flow/connections/${index}`,'An active node depends on a node outside the Start control flow.');
  for (const [id, definition] of resolved) if(active.has(id)) for (const [port, type] of Object.entries(definition.inputs)) {
    if (inputRequired(definition,nodes.get(id)!.config,port) && !connectedInputs.has(`${id}/${port}`)&&!nodes.get(id)!.inlineInputs?.[port]?.enabled) add('missing_input', `/flow/nodes/${id}/inputs/${port}`, 'Required input is not connected.');
  }
  if (flow.entryNodeId !== undefined && (!nodes.has(flow.entryNodeId) || incoming.has(flow.entryNodeId))) add('entry', '/flow/entryNodeId', 'Entry must identify an existing root node.');
  // Kahn's algorithm handles arbitrary DAGs without recursive stack growth.
  const indegree = new Map([...nodes.keys()].map(id => [id, 0]));
  for (const targets of edges.values()) for (const id of targets) indegree.set(id, indegree.get(id)! + 1);
  const ready = [...indegree].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  for (let index = 0; index < ready.length; index++) {
    const id = ready[index]!; visited++;
    for (const target of edges.get(id)!) { const count = indegree.get(target)! - 1; indegree.set(target, count); if (count === 0) ready.push(target); }
  }
  if (visited !== nodes.size) add('cycle', '/flow/connections', 'Flow must be acyclic.');
  if (!errors.length) errors.push(...flowDesignations.validate(flow, catalog));
  return errors;
}
