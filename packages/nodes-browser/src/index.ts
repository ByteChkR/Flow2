import { BrowserNodeRegistry, defineNode, port, field } from '@adam-flow/runtime-browser';
import type { PortValue } from '@adam-flow/runtime-browser';
import type { TypeDocument } from '@adam-flow/flow-core';

export const contactDtoPort = port.object({id:port.string(),name:port.string(),age:port.optional(port.number())});
export type ContactDto = PortValue<typeof contactDtoPort>;
export interface BrowserUi { readContactId: () => string; displayContact: (value: ContactDto) => void }

export const addNode = defineNode({
  type:'math.add',version:1,label:'Addieren',category:'Mathematik',
  inputs:{a:port.number({label:'Erste Zahl',order:0}),b:port.number({label:'Zweite Zahl',order:1})},
  outputs:{sum:port.number({label:'Summe'})},
  execute:({a,b})=>({sum:a+b}),
});
function definitions(ui:BrowserUi) {
  return [
    defineNode({type:'input.contactId',version:1,label:'Kontakt-ID',category:'Eingaben',
      inputs:{},outputs:{id:port.string({label:'Kontakt-ID'})},
      config:{initialValue:field.string('contact-1',{label:'Kontakt-ID',order:0})},
      execute:(_,context)=>({id:ui.readContactId() || context.config.initialValue})}),
    defineNode({type:'ui.displayContact',version:1,label:'Kontakt anzeigen',category:'Oberfläche',
      inputs:{value:port.object({id:port.string(),name:port.string(),age:port.optional(port.number())},{label:'Kontakt-DTO'})},outputs:{},
      execute:({value})=>{ui.displayContact(value);return {};}}),
    addNode,
    defineNode({type:'input.number',version:1,label:'Zahl',category:'Eingaben',inputs:{},outputs:{value:port.number({label:'Wert'})},
      config:{value:field.number(0,{label:'Wert'})},execute:(_, {config})=>({value:config.value})}),
    defineNode({type:'input.text',version:1,label:'Text',category:'Eingaben',inputs:{},outputs:{value:port.string({label:'Text'})},
      config:{value:field.string('',{label:'Text',order:0}),trim:field.boolean(false,{label:'Rand-Leerzeichen entfernen',order:1}),
        casing:field.string('Unverändert',{label:'Schreibweise',options:['Unverändert','Großbuchstaben','Kleinbuchstaben'],order:2})},
      execute:(_, {config})=>{const value=config.trim?config.value.trim():config.value;return {value:config.casing==='Großbuchstaben'?value.toUpperCase():config.casing==='Kleinbuchstaben'?value.toLowerCase():value};}}),
  ];
}
export const browserDefinitions = definitions({readContactId:()=>'',displayContact:()=>{}}).map(node=>node.definition);
// UI state stays injected; authoring and execution do not depend on Svelte.
export function createBrowserNodes(types: TypeDocument, ui: BrowserUi): BrowserNodeRegistry {
  const registry = new BrowserNodeRegistry(types);
  for(const node of definitions(ui)) registry.register(node);
  return registry;
}
export * from './codecs.js';
export * from './transport.js';
