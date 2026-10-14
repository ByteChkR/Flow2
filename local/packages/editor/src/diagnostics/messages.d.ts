export type MessageTarget = {kind:'flow';graphId:string;nodeIds:string[]} | {kind:'config';section:string;id:string|number;field?:string;path?:string};
export interface MessageCategory {id:string;label:string;value:string;valueLabel?:string}
export interface Message {
 id:string;code:string;severity:'error'|'warning'|'info';source:string;
 title:string;description:string;hint:string|null;location:string;
 categories?:MessageCategory[];target?:MessageTarget;groupLabel?:string;blocking:boolean;cause?:string;details:Record<string,unknown>;
}
export function messageFromDiagnostic(d:unknown,context?:Record<string,unknown>):Message;
export function errorMessages(error:unknown,context?:Record<string,unknown>):Message[];
export function safeText(value:unknown):string;
export function deduplicate(messages:Message[]):Message[];
export function diagnosticDetails(message:Message):string;
export function jsonSyntaxDiagnostic(text:unknown,error:unknown):{code:string;message:string;line?:number;column?:number};
export class MessageError extends Error {messages:Message[];constructor(messages:Message[])}
