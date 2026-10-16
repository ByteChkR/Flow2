import type {Catalog, CodecCatalog, Flow, GraphBundle, JsonValue, GraphReference} from '@adam-flow/core/flow-core/index.js';
import type {ExecutionFailure} from './orchestrator.js';

export interface BrowserSegmentResult {
  segmentId:string;
  attemptId:string;
  wires:Record<string,string>;
  outputs?:Record<string,JsonValue>;
  error?:ExecutionFailure;
}
export interface BrowserResultItem {executionId:string;result:BrowserSegmentResult}

export type ExecutionCommand =
  | {kind:'openSession';body:{browserCatalog:Catalog;browserCodecs:CodecCatalog}}
  | {kind:'start';body:{flow:Flow;inputs:Record<string,JsonValue>;sessionId?:string;bundle?:GraphBundle;profiling?:boolean}}
  | {kind:'next';executionId:string}
  | {kind:'results';executionId:string;body:{results:BrowserResultItem[]}}
  | {kind:'invoke';executionId:string;body:{segmentId:string;attemptId:string;reference:GraphReference;inputs:Record<string,JsonValue>;callKey:string}}
  | {kind:'cancel';executionId:string}
  | {kind:'closeSession';sessionId:string}
  | {kind:'startProcess';taskId:string;body:{sessionId?:string}}
  | {kind:'heartbeatProcess'|'completeProcess'|'releaseProcess';taskId:string};

export interface ExecutionTransport {
  readonly kind:'http'|'signalr';
  /** Only polling transports request a periodic reconciliation wakeup. */
  readonly pollIntervalMs?:number;
  /** A reply means coordinator acceptance, not merely that bytes were sent. */
  send(command:ExecutionCommand, context:{sessionId?:string;signal:AbortSignal}):Promise<unknown>;
  describe(command:ExecutionCommand):string;
  subscribeChanges?(changed:(executionId?:string)=>void):()=>void;
}

export class ExecutionTransportError extends Error {
  constructor(message:string,readonly status:number,readonly code?:string,readonly diagnostics?:unknown[]) {
    super(message);this.name='ExecutionTransportError';
  }
}

/** Only this adapter knows the HTTP endpoint layout. */
export function httpExecutionRequest(command:ExecutionCommand):{path:string;method:string;body?:unknown} {
  const execution='executionId' in command?`/api/executions/${encodeURIComponent(command.executionId)}`:'';
  const process='taskId' in command?`/api/processes/${encodeURIComponent(command.taskId)}`:'';
  switch(command.kind) {
    case 'openSession':return {path:'/api/sessions',method:'POST',body:command.body};
    case 'start':return {path:'/api/executions',method:'POST',body:command.body};
    case 'next':return {path:execution+'/next',method:'GET'};
    case 'results':return {path:execution+'/results',method:'POST',body:command.body};
    case 'invoke':return {path:execution+'/invoke',method:'POST',body:command.body};
    case 'cancel':return {path:execution,method:'DELETE'};
    case 'closeSession':return {path:`/api/sessions/${encodeURIComponent(command.sessionId)}`,method:'DELETE'};
    case 'startProcess':return {path:process+'/start',method:'POST',body:command.body};
    case 'heartbeatProcess':return {path:process+'/heartbeat',method:'POST'};
    case 'completeProcess':return {path:process+'/complete',method:'POST'};
    case 'releaseProcess':return {path:process,method:'DELETE'};
  }
}

export class HttpExecutionTransport implements ExecutionTransport {
  readonly kind='http' as const;
  readonly pollIntervalMs=5000;
  constructor(private readonly fetcher:typeof fetch=fetch){}
  describe(command:ExecutionCommand):string {
    const {path,method}=httpExecutionRequest(command);
    return `${method} ${path.replace(/executions\/[^/]+/,'executions/:id')}`;
  }
  async send(command:ExecutionCommand,{sessionId,signal}:{sessionId?:string;signal:AbortSignal}):Promise<unknown> {
    const {path,method,body}=httpExecutionRequest(command);
    const response=await this.fetcher(path,{method,credentials:'same-origin',
      headers:{'Content-Type':'application/json',...(sessionId?{'X-Flow-Session':sessionId}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal});
    // Gateway failures need not contain JSON; preserve their retry classification.
    if([502,503,504].includes(response.status))throw new ExecutionTransportError(`Flow2: HTTP ${response.status}`,response.status);
    const result=response.status===204?undefined:await response.json();
    if(!response.ok)throw new ExecutionTransportError(result?.message??`HTTP ${response.status}`,response.status,result?.code,
      Array.isArray(result?.errors)?result.errors:undefined);
    return result;
  }
}
