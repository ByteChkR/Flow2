/** Explicit node failure codes survive segment wrappers; system cancellation stays separate. */
export class NodeFailure extends Error {
 constructor(public readonly code:string,message:string){super(message);}
}
export function nodeFailureCode(error:unknown):string|undefined{
 const seen=new Set<unknown>();
 while(error instanceof Error&&!seen.has(error)){seen.add(error);if(error instanceof NodeFailure)return error.code;error=error.cause;}
 return undefined;
}
