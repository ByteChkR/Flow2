import { validateConfig, validateNodeMetadata } from './config.js';
import type { Catalog, Diagnostic, Flow, NodeDefinition, TypeDocument } from './model.js';
import { ContractError, validateSchema } from './schema.js';
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
    const key = `${node.type}@${node.version}`;
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
    const definition = definitions.get(`${node.type}@${node.typeVersion}`);
    if (!definition) { add('unknown_node_type', path, `Unknown node ${node.type}@${node.typeVersion}.`); continue; }
    resolved.set(node.id, definition);
    errors.push(...validateConfig(definition.config,node.config,`${path}/config`));
    if (!definition.environments.includes(node.environment)) add('environment', path, `Node ${node.id} is unavailable in ${node.environment}.`);
    if (flow.mode === 'backend' && node.environment === 'browser') add('mode', path, 'Backend flows cannot contain browser nodes.');
  }
  const connectedInputs = new Set<string>();
  const incoming = new Set<string>();
  for (const [index, connection] of flow.connections.entries()) {
    const path = `/flow/connections/${index}`;
    const { source, target } = connection;
    if (!nodes.has(source.nodeId) || !nodes.has(target.nodeId)) { add('unknown_node', path, 'Connection refers to an unknown node.'); continue; }
    edges.get(source.nodeId)!.add(target.nodeId); incoming.add(target.nodeId);
    const sourcePorts = resolved.get(source.nodeId)?.outputs;
    const targetPorts = resolved.get(target.nodeId)?.inputs;
    if (!sourcePorts || !targetPorts) continue;
    if (!Object.hasOwn(sourcePorts, source.port) || !Object.hasOwn(targetPorts, target.port)) { add('unknown_port', path, 'Connection refers to an unknown port.'); continue; }
    const key = `${target.nodeId}/${target.port}`;
    if (connectedInputs.has(key)) add('multiple_inputs', path, 'An input port accepts only one connection.');
    connectedInputs.add(key);
    if (!isAssignable(sourcePorts[source.port]!, targetPorts[target.port]!, registry)) add('type_mismatch', path, `${source.nodeId}.${source.port} is incompatible with ${target.nodeId}.${target.port}.`);
  }
  for (const [id, definition] of resolved) for (const [port, type] of Object.entries(definition.inputs)) {
    if (type.kind !== 'optional' && !connectedInputs.has(`${id}/${port}`)) add('missing_input', `/flow/nodes/${id}/inputs/${port}`, 'Required input is not connected.');
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
  return errors;
}
