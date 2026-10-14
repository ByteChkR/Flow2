import { ContractError, TypeRegistry, validateFlow, validateBoundary } from '@adam-flow/flow-core';
import type { Catalog, CodecCatalog, CodecReference, Diagnostic, Flow, PortAddress, TypeDocument } from '@adam-flow/flow-core';

export interface BoundaryStep { connectionIndex: number; source: PortAddress; target: PortAddress; codec: CodecReference }
export function compileBoundaries(flow: Flow, catalog: Catalog, types: TypeDocument,
  capabilities: { server: CodecCatalog; browser: CodecCatalog }): { boundaries: BoundaryStep[]; diagnostics: Diagnostic[] } {
  const diagnostics = validateFlow(flow, catalog, types);
  if (diagnostics.length) return { boundaries: [], diagnostics };
  if (capabilities.server.environment !== 'server' || capabilities.browser.environment !== 'browser') return { boundaries: [], diagnostics: [{ code: 'environment', path: '/codecs', message: 'Codec capability environment mismatch.' }] };
  const registry = new TypeRegistry(types), boundaries: BoundaryStep[] = [];
  for (const [index, connection] of flow.connections.entries()) {
    const source = flow.nodes.find(node => node.id === connection.source.nodeId)!;
    const target = flow.nodes.find(node => node.id === connection.target.nodeId)!;
    if (source.environment === target.environment) continue;
    const output = catalog.nodes.find(node => node.type === source.type && node.version === source.typeVersion)!.outputs[connection.source.port]!;
    const input = catalog.nodes.find(node => node.type === target.type && node.version === target.typeVersion)!.inputs[connection.target.port]!;
    const errors = validateBoundary(output, input, connection.codec, capabilities[source.environment], capabilities[target.environment], registry);
    diagnostics.push(...errors.map(error => ({ ...error, path: `/connections/${index}${error.path}` })));
    if (!errors.length) boundaries.push({ connectionIndex: index, source: connection.source, target: connection.target, codec: connection.codec! });
  }
  return { boundaries: diagnostics.length ? [] : structuredClone(boundaries), diagnostics };
}
export function requireBoundaries(flow: Flow, catalog: Catalog, types: TypeDocument, capabilities: { server: CodecCatalog; browser: CodecCatalog }): BoundaryStep[] {
  const result = compileBoundaries(flow, catalog, types, capabilities);
  if (result.diagnostics.length) throw new ContractError(result.diagnostics);
  return result.boundaries;
}

export * from "./plan.js";
