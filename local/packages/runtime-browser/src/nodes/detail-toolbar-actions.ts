import {defineNode, port} from '../runtime-browser/authoring.js';
import type {TypeRef} from '@adam-flow/core/flow-core/model.js';

/** Deliberately open record: each action version owns the meaning of its details. */
export const toolbarActionDetailsType: TypeRef = {kind:'object',fields:{}};
export const nextDetailsActionType: TypeRef = {kind:'object',fields:{
  action:{kind:'string'}, cancelAction:{kind:'boolean'}, details:toolbarActionDetailsType
}};

function createToolbarAction(action:'None'|'Refresh', label:string) {
  return defineNode({
    type:`Frontend.Detail.ToolbarAction.Create${action}`, version:1,
    label, category:'Frontend/Detail-Toolbar',
    description:'Erzeugt das Ergebnis einer Detail-Toolbar-Binding. cancelAction unterbindet bei gebundenen Bestandsbuttons die ursprüngliche Host-Aktion.',
    inputs:{cancelAction:port.boolean({label:'Ursprüngliche Aktion unterbinden'}),details:port.custom<Record<string,unknown>>(toolbarActionDetailsType,{label:'Aktionsdetails'})},
    outputs:{value:port.custom<Record<string,unknown>>(nextDetailsActionType,{label:'NextDetailsAction'})},
    execute:inputs=>({value:{action,cancelAction:inputs.cancelAction,details:inputs.details}})
  });
}

export const detailToolbarActionNodes=[
  createToolbarAction('None','Keine Detailfolgeaktion erstellen'),
  createToolbarAction('Refresh','Detail aktualisieren erstellen')
];
