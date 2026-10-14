import {resolveDefinition} from '@adam-flow/core/flow-core/node-resolution.js';
import {efCatalog} from '@adam-flow/core/flow-core/ef-nodes.js';
import { ContractError, TypeRegistry, validateBoundary, validateFlow } from '@adam-flow/core/flow-core/index.js';
import type { Catalog, CodecCatalog, Environment, Flow, PortAddress, TypeDocument } from '@adam-flow/core/flow-core/index.js';
import {inferQueryNodes,queryCatalog,queryCodecs} from '@adam-flow/core/flow-core/query-nodes.js';

/** Drafts may contain disconnected inputs and unfinished inline literals; connection/type rules still apply. */
export function connectPorts(flow: Flow, source: PortAddress, target: PortAddress, catalog: Catalog,
  types: TypeDocument, codecs: Record<Environment, CodecCatalog>, kind?:'data'|'control'): Flow {
  const next = structuredClone(flow);
  const edge: Flow['connections'][number] = {source: {...source}, target: {...target},...(kind?{kind}:{})};
  next.connections.push(edge);
  const literal=next.nodes.find(node=>node.id===target.nodeId)?.inlineInputs?.[target.port];
  if(kind!=='control'&&literal)literal.enabled=false;
  inferQueryNodes(next,catalog,types);
  catalog=efCatalog(next,queryCatalog(next,catalog),types);
  codecs={server:{...codecs.server,codecs:[...codecs.server.codecs,...queryCodecs([next],codecs.server.codecs)]},browser:{...codecs.browser,codecs:[...codecs.browser.codecs,...queryCodecs([next],codecs.browser.codecs)]}};
  const errors = validateFlow(next, catalog, types).filter(error => !['missing_input','inactive_dependency','inactive_output','parameter_name','expression'].includes(error.code) && !(error.code==='value_type' && /^\/flow\/nodes\/[^/]+\/inlineInputs\//.test(error.path)));
  if (errors.length) throw new ContractError(errors);
  const from = next.nodes.find(node => node.id === source.nodeId)!;
  const to = next.nodes.find(node => node.id === target.nodeId)!;
  if (kind !== 'control' && from.environment !== to.environment) {
    const output = resolveDefinition(catalog,from)!.outputs[source.port]!;
    const input = resolveDefinition(catalog,to)!.inputs[target.port]!;
    const registry = new TypeRegistry(types);
    const candidates = codecs[from.environment].codecs.filter(codec =>
      validateBoundary(output, input, codec, codecs[from.environment], codecs[to.environment], registry).length === 0);
    if (candidates.length !== 1) throw new Error(candidates.length ? 'Mehrere passende Codecs. Bitte den Codec im Flow-JSON explizit wählen.' : 'Kein gemeinsamer Codec für diese Port-Typen. Lokale Entities benötigen eine DTO-Projektion.');
    edge.codec = {typeId: candidates[0]!.typeId, version: candidates[0]!.version};
  }
  return next;
}

export function removeNode(flow: Flow, id: string): Flow {
  const next = structuredClone(flow);
  next.nodes = next.nodes.filter(node => node.id !== id);
  next.connections = next.connections.filter(edge => edge.source.nodeId !== id && edge.target.nodeId !== id);
  if (next.entryNodeId === id) delete next.entryNodeId;
  return next;
}
