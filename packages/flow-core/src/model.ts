export type TypeRef =
  | { kind: 'string' | 'number' | 'boolean' | 'null' }
  | { kind: 'array'; items: TypeRef }
  | { kind: 'object'; fields: Record<string, TypeRef> }
  | { kind: 'optional'; inner: TypeRef }
  | { kind: 'entity' | 'entityRef'; name: string };
export interface EntityDefinition { id: string; kind: 'entity'; fields: Record<string, TypeRef> }
export interface TypeDocument { schemaVersion: 1; types: EntityDefinition[] }
export type Environment = 'server' | 'browser';
export interface PortMetadata { label?: string; description?: string; order?: number }
export interface NodeMetadata { label?: string; description?: string; category?: string; inputs?: Record<string, PortMetadata>; outputs?: Record<string, PortMetadata> }
export type ConfigField = PortMetadata & ({type: 'string'; default: string; options?: string[]} | {type: 'number'; default: number} | {type: 'boolean'; default: boolean});
export interface NodeDefinition {
  type: string; version: number; environments: Environment[];
  inputs: Record<string, TypeRef>; outputs: Record<string, TypeRef>;
  metadata?: NodeMetadata; config?: Record<string, ConfigField>;
}
export interface Catalog { schemaVersion: 1; nodes: NodeDefinition[] }
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface FlowNode {
  id: string; type: string; typeVersion: number; environment: Environment; config: Record<string, JsonValue>;
}
export interface PortAddress { nodeId: string; port: string }
export interface Flow {
  schemaVersion: 1; id: string; version: number; mode: 'backend' | 'interactive';
  nodes: FlowNode[]; connections: { source: PortAddress; target: PortAddress; codec?: CodecReference }[]; entryNodeId?: string;
}
export interface Diagnostic { code: string; path: string; message: string }

export interface CodecReference { typeId: string; version: number }
export interface CodecDefinition extends CodecReference { valueType: TypeRef; wireSchema: Record<string, unknown> }
export interface CodecCatalog { schemaVersion: 1; environment: Environment; codecs: CodecDefinition[] }
export interface WireEnvelope { schemaVersion: 1; typeId: string; codecVersion: number; payload: JsonValue }
