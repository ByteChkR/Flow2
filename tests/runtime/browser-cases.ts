import { mergeCatalogs, TypeRegistry, validateCatalog } from '@adam-flow/flow-core';
import type { Catalog, NodeDefinition, TypeDocument } from '@adam-flow/flow-core';
import { BrowserNodeRegistry } from '@adam-flow/runtime-browser';
import { createBrowserNodes } from '@adam-flow/nodes-browser';

const types: TypeDocument = { schemaVersion: 1, types: [] };
const definition = (version = 1): NodeDefinition => ({ type: 'echo', version, environments: ['browser'], inputs: { value: { kind: 'string' } }, outputs: { value: { kind: 'string' } } });
function assert(value: boolean, message = 'Assertion failed'): void { if (!value) throw new Error(message); }
function rejects(run: () => unknown): void { let failed = false; try { run(); } catch { failed = true; } assert(failed, 'Expected rejection'); }
const call = (registry: BrowserNodeRegistry, version = 1) => registry.execute({ nodeId: 'test', type: 'echo', typeVersion: version, environment: 'browser', inputs: { value: 'Ada' } });
export const browserRuntimeCases: { name: string; run: () => void }[] = [
  { name: 'browser nodes execute and update injected UI state', run: () => {
    let displayed: unknown;
    const registry = createBrowserNodes(types, { readContactId: () => 'contact-7', displayContact: value => { displayed = value; } });
    const input = registry.execute({ nodeId: 'input', type: 'input.contactId', typeVersion: 1, environment: 'browser', inputs: {} });
    const dto = { id: input['id'], name: 'Ada' };
    registry.execute({ nodeId: 'display', type: 'ui.displayContact', typeVersion: 1, environment: 'browser', inputs: { value: dto } });
    assert(displayed === dto, 'Browser object identity must be preserved');
    const sum = registry.execute({ nodeId: 'add', type: 'math.add', typeVersion: 1, environment: 'browser', inputs: { a: 20, b: 22 } });
    assert(sum['sum'] === 42 && input['id'] === 'contact-7');
  } },
  { name: 'versioned implementations are distinct', run: () => {
    const registry = new BrowserNodeRegistry(types);
    registry.register(definition(1), inputs => ({ value: inputs['value'] }));
    registry.register(definition(2), () => ({ value: 'version 2' }));
    assert(call(registry)['value'] === 'Ada' && call(registry, 2)['value'] === 'version 2');
    rejects(() => call(registry, 3));
  } },
  { name: 'server environment never resolves in browser', run: () => {
    const registry = new BrowserNodeRegistry(types); registry.register(definition(), inputs => ({ ...inputs }));
    rejects(() => registry.execute({ nodeId: 'bad', type: 'echo', typeVersion: 1, environment: 'server', inputs: { value: 'Ada' } }));
    rejects(() => registry.register({ ...definition(), environments: ['server'] }, () => ({})));
  } },
  { name: 'invalid inputs fail before implementation', run: () => {
    const registry = new BrowserNodeRegistry(types); let ran = false;
    registry.register(definition(), inputs => { ran = true; return { ...inputs }; });
    for (const inputs of [{ value: 42 }, {}, { value: 'Ada', extra: true }]) rejects(() => registry.execute({ nodeId: 'bad', type: 'echo', typeVersion: 1, environment: 'browser', inputs }));
    assert(!ran);
  } },
  { name: 'invalid outputs are rejected', run: () => {
    const registry = new BrowserNodeRegistry(types); registry.register(definition(), () => ({ value: 42 }));
    rejects(() => call(registry));
  } },
  { name: 'optional ports may be absent', run: () => {
    const registry = new BrowserNodeRegistry(types);
    registry.register({ ...definition(), inputs: { value: { kind: 'optional', inner: { kind: 'string' } } }, outputs: {} }, () => ({}));
    registry.execute({ nodeId: 'optional', type: 'echo', typeVersion: 1, environment: 'browser', inputs: {} });
  } },
  { name: 'catalog and registration snapshots do not expose implementations', run: () => {
    const registry = new BrowserNodeRegistry(types); const node = definition();
    registry.register(node, inputs => ({ ...inputs })); node.inputs['value'] = { kind: 'number' };
    const exported = registry.catalog; exported.nodes[0]!.inputs['value'] = { kind: 'number' };
    assert(call(registry)['value'] === 'Ada');
    validateCatalog(JSON.parse(JSON.stringify(registry.catalog)) as Catalog, new TypeRegistry(types));
    assert(!JSON.stringify(registry.catalog).includes('execute'));
  } },
  { name: 'duplicate registration fails', run: () => {
    const registry = new BrowserNodeRegistry(types); registry.register(definition(), inputs => ({ ...inputs }));
    rejects(() => registry.register(definition(), inputs => ({ ...inputs })));
  } },
  { name: 'unknown entity references cannot register', run: () => {
    const node = definition(); node.inputs['value'] = { kind: 'entity', name: 'missing.Entity@1' };
    rejects(() => new BrowserNodeRegistry(types).register(node, inputs => ({ ...inputs })));
  } },
  { name: 'identical contracts merge across environments', run: () => {
    const browser = { schemaVersion: 1 as const, nodes: [definition()] };
    const server = { schemaVersion: 1 as const, nodes: [{ ...definition(), environments: ['server' as const] }] };
    const result = mergeCatalogs(new TypeRegistry(types), server, browser);
    assert(result.nodes.length === 1 && result.nodes[0]!.environments.length === 2);
  } },
  { name: 'conflicting and overlapping catalogs cannot merge', run: () => {
    const browser: Catalog = { schemaVersion: 1, nodes: [definition()] };
    const conflicting: Catalog = { schemaVersion: 1, nodes: [{ ...definition(), environments: ['server'], outputs: { value: { kind: 'number' } } }] };
    rejects(() => mergeCatalogs(new TypeRegistry(types), browser, conflicting));
    rejects(() => mergeCatalogs(new TypeRegistry(types), browser, browser));
  } },
];
