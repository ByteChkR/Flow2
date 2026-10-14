export interface NodeTrace { nodeId: string; status: 'running'|'completed'|'failed'; durationMs?: number; message?: string }
export interface ExecutionTrace {
  id: string; timestamp: string; environment: 'server'|'browser'; kind: 'session'|'execution'|'segment'|'node'|'boundary';
  status: string; segmentId?: string|null; nodeId?: string|null; connectionIndex?: number|null; message?: string|null; durationMs?: number|null;
}
