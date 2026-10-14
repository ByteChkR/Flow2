import { ContractError, TypeRegistry, validateBoundary, validateFlow } from '@adam-flow/flow-core';
import type { Catalog, CodecCatalog, Environment, Flow, PortAddress, TypeDocument } from '@adam-flow/flow-core';

/** Drafts may have disconnected inputs; every other graph rule still applies. */
export function connectPorts(flow: Flow, source: PortAddress, target: PortAddress, catalog: Catalog,
  types: TypeDocument, codecs: Record<Environment, CodecCatalog>): Flow {
  const next = structuredClone(flow);
  const edge: Flow['connections'][number] = {source: {...source}, target: {...target}};
  next.connections.push(edge);
  const errors = validateFlow(next, catalog, types).filter(error => error.code !== 'missing_input');
  if (errors.length) throw new ContractError(errors);
  const from = next.nodes.find(node => node.id === source.nodeId)!;
  const to = next.nodes.find(node => node.id === target.nodeId)!;
  if (from.environment !== to.environment) {
    const output = catalog.nodes.find(node => node.type === from.type && node.version === from.typeVersion)!.outputs[source.port]!;
    const input = catalog.nodes.find(node => node.type === to.type && node.version === to.typeVersion)!.inputs[target.port]!;
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
