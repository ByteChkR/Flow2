import { FlowWorkspace } from '@adam-flow/runtime-browser';
import { createBrowserNodes, createBrowserCodecs } from '@adam-flow/nodes-browser';
import type { ContactDto } from '@adam-flow/nodes-browser';
import contact from '@adam-flow/contracts/examples/contact.flow';
import backend from '@adam-flow/contracts/examples/backend.flow';
export const examples=[
  {id:'contact',label:'Contact · interaktiv · v1',json:JSON.stringify(contact,null,2)},
  {id:'backend',label:'Contact · Backend · v1',json:JSON.stringify(backend,null,2)}
];
export function createWorkspace(readContactId:()=>string,displayContact:(value:ContactDto)=>void) {
  return new FlowWorkspace(types=>({nodes:createBrowserNodes(types,{readContactId,displayContact}),codecs:createBrowserCodecs(types)}));
}
export type {ContactDto};
