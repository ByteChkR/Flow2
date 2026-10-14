export interface NodeTrace { nodeId: string; status: 'running'|'completed'|'failed'; durationMs?: number; message?: string; profile?:Record<string,number> }
export interface ExecutionTrace {
  graphId?:string|null;invocationId?:string|null;parentInvocationId?:string|null;callNodeId?:string|null;
  id: string; timestamp: string; environment: 'server'|'browser'; kind: 'session'|'execution'|'segment'|'node'|'boundary'|'log'|'profile';
  profile?:Record<string,number>|null; status: string; segmentId?: string|null; nodeId?: string|null; connectionIndex?: number|null; message?: string|null; durationMs?: number|null;
}

export type FlowLogLevel='info'|'warning'|'error';
export interface FlowLogger {info(message:string):void;warning(message:string):void;error(message:string):void}
export interface NodeLog {nodeId:string;level:FlowLogLevel;message:string}
export const nullLogger:FlowLogger={info(){},warning(){},error(){}};
