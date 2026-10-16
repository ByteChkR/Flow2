import {flowDesignations, flowInterface} from '@adam-flow/core/flow-core/index.js';
import type {Catalog, Flow} from '@adam-flow/core/flow-core/index.js';
import {generalValueNodeType} from '@adam-flow/core/flow-core/general-value-nodes.js';

/** Preserve existing ports and connections, including incompatible declarations for correction. */
export function assignDesignation(flow: Flow, id: string | undefined, catalog: Catalog, createId = () => `node_${crypto.randomUUID()}`): Flow {
  const next = structuredClone(flow);
  if (!id) { delete next.designation; return next; }
  const definition = flowDesignations.get(id);
  if (!definition) throw new Error(`Unbekannte Kennzeichnung: ${id}`);
  next.designation = id;
  const signature = flowInterface(next,catalog);
  const environment = definition.environments.includes('browser') && flow.mode !== 'backend' ? 'browser' : definition.environments[0]!;
  for (const direction of ['inputs','outputs'] as const) {
    for (const [name,type] of Object.entries(definition[direction]?.required ?? {})) {
      const operation=direction==='inputs'?'input':'output';
      const existing=next.nodes.find(node=>node.value?.operation===operation&&node.config.name===name);
      // A designation owns its declared interface. Older drafts may contain a
      // generic Record from before the slot acquired a concrete signature.
      // Repair that declaration when the designation is (re-)assigned.
      if(existing?.value) {
        existing.value={...existing.value,type:structuredClone(type)};
        existing.environment=environment;
        continue;
      }
      if (signature[direction].some(port => port.name === name)) continue;
      const nodeId = createId();
      next.nodes.push({id:nodeId,type:generalValueNodeType(nodeId,direction==='inputs'?'input':'output'),typeVersion:1,environment,config:{name},
        value:{operation,type:structuredClone(type)}});
    }
  }
  // The output has an open author-defined object shape, checked by its designation validator.
  if(id==='default-value'&&!signature.outputs.some(port=>port.name==='DefaultValues')) {
    const nodeId=createId();
    next.nodes.push({id:nodeId,type:generalValueNodeType(nodeId,'output'),typeVersion:1,environment,config:{name:'DefaultValues'},value:{operation:'output',type:{kind:'object',fields:{}}}});
  }
  const initialOutput = id==='default-value' ? 'DefaultValues'
    : id==='frontend.detail.toolbarAction.v1' ? 'NextDetailsAction' : undefined;
  if(initialOutput) {
    const start=next.nodes.find(node=>node.type==='Standard.Flow.Start');
    const nodeId=start?.id??createId();
    // Only wire a bare interface automatically; never bypass existing processing nodes.
    // Toolbar actions start as a minimal, executable graph just like default values.
    const bareInterface=next.connections.length===0&&next.nodes.every(node=>node.type==='Standard.Flow.Start'||node.value?.operation==='input'||node.value?.operation==='output');
    if(!start)next.nodes.unshift({id:nodeId,type:'Standard.Flow.Start',typeVersion:1,environment,config:{}});
    if(bareInterface) {
      const output=next.nodes.find(node=>node.value?.operation==='output'&&node.config.name===initialOutput);
      if(output)next.connections.push({kind:'control',source:{nodeId,port:'out'},target:{nodeId:output.id,port:'in'}});
    }
  }
  return next;
}
