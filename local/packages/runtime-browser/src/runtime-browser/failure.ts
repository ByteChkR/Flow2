import type {ExecutionFailure} from './orchestrator.js';
/** Preserve the original subgraph location through segment wrappers. */
export function inheritedFailure(error:unknown):ExecutionFailure|undefined{
 const seen=new Set<unknown>();
 while(error&&typeof error==='object'&&!seen.has(error)){
  seen.add(error);const value=error as {flowFailure?:ExecutionFailure;cause?:unknown};
  if(value.flowFailure)return value.flowFailure;
  error=value.cause;
 }
 return undefined;
}
export function failureError(failure:ExecutionFailure):Error{return Object.assign(new Error(failure.message),{flowFailure:failure});}
