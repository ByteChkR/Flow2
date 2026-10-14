import {errorMessages,messageFromDiagnostic,deduplicate} from '@adam/editor/diagnostics/messages.js';
import {locateDiagnostics} from './validation-results.js';
import type {Catalog,GraphBundle,TypeDocument,Diagnostic} from '@adam-flow/core/flow-core/model.js';
export function flowMessages(error:unknown,bundle:GraphBundle,catalog:Catalog,types:TypeDocument,names:Record<string,string>={},source='flow-action'){
 const value=error as {diagnostics?:Diagnostic[];graphId?:string;nodeId?:string;executionId?:string};
 if(value?.diagnostics)return deduplicate(locateDiagnostics(value.diagnostics,bundle,catalog,types).map(d=>messageFromDiagnostic({...d,path:d.localPath},{source,location:[names[d.graphId]??d.graphId,...d.labels,d.localPath].filter(Boolean).join(' / '),target:{kind:'flow',graphId:d.graphId,nodeIds:d.nodeIds}})));
 const graphId=value?.graphId??bundle.rootGraphId;
 const node=value?.nodeId?bundle.graphs.find(g=>g.id===graphId)?.nodes.find(n=>n.id===value.nodeId):undefined;
 return errorMessages(error,{source,executionId:value?.executionId,location:[names[graphId]??graphId,node?.type].filter(Boolean).join(' / '),target:{kind:'flow',graphId,nodeIds:node?[node.id]:[]}});
}
