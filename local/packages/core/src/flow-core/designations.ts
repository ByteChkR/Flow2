import type {Catalog, Diagnostic, Environment, Flow, FlowInterface, JsonValue, TypeRef} from './model.js';
import {flowInterface} from './interface.js';
import {canonicalJson} from './transport.js';
import {isGraphControl,graphControlSlots} from './graph-controls.js';
import {materializeHybrid} from './graphs.js';

export interface DesignationPorts {
  required: Record<string, TypeRef>;
  allowAdditional: boolean;
}
/** Application-owned contracts; graph files contain only their stable ID. */
export interface FlowDesignation {
  id: string;
  version: number;
  name: string;
  description: string;
  environments: Environment[];
  inputs?: DesignationPorts;
  outputs?: DesignationPorts;
  validators?: string[];
}
export interface DesignationContext {
  flow: Flow;
  signature: FlowInterface;
  catalog: Catalog;
}
export interface DesignationValidator {
  id: string;
  version: number;
  validate?: (context: DesignationContext) => Diagnostic[];
  validateOutputs?: (context: DesignationContext, outputs: Readonly<Record<string, JsonValue>>) => Diagnostic[];
  validateInputs?: (context: DesignationContext, inputs: Readonly<Record<string, JsonValue>>) => Diagnostic[];
}

/** Registration is explicit; accessors return copies to prevent mutation behind cache keys. */
export class DesignationRegistry {
  private definitions = new Map<string, FlowDesignation>();
  private validators = new Map<string, DesignationValidator>();

  registerValidator(validator: DesignationValidator): void {
    if (!validator.id || !Number.isInteger(validator.version) || validator.version < 1 || this.validators.has(validator.id))
      throw new Error(`Invalid or duplicate designation validator: ${validator.id}`);
    this.validators.set(validator.id, {...validator});
  }

  register(definition: FlowDesignation): void {
    if (!definition.id || definition.id.length > 128 || !definition.name || !Number.isInteger(definition.version) || definition.version < 1 || this.definitions.has(definition.id))
      throw new Error(`Invalid or duplicate flow designation: ${definition.id}`);
    if (!definition.environments.length || definition.environments.some(value => value !== 'server' && value !== 'browser'))
      throw new Error(`Invalid designation environments: ${definition.id}`);
    for (const id of definition.validators ?? []) if (!this.validators.has(id)) throw new Error(`Unknown designation validator: ${id}`);
    this.definitions.set(definition.id, structuredClone(definition));
  }

  get(id: string): FlowDesignation | undefined {
    const value = this.definitions.get(id);
    return value && structuredClone(value);
  }
  list(): FlowDesignation[] { return [...this.definitions.values()].map(value => structuredClone(value)); }
  get fingerprint(): string {
    return canonicalJson({definitions: this.list().sort((a,b) => a.id.localeCompare(b.id)),
      validators: [...this.validators.values()].map(({id,version}) => ({id,version})).sort((a,b) => a.id.localeCompare(b.id))});
  }

  /** Shared entry point for editors, selectors and hosts. Dynamic targets are checked on invocation. */
  validateUse(flow: Flow, catalog: Catalog, options: {
    designation?: string; environment?: Environment; inputs?: Readonly<Record<string, JsonValue>>;
    graphs?: readonly Flow[]; allowedEnvironments?: readonly Environment[];
  } = {}): Diagnostic[] {
    const errors: Diagnostic[] = [];
    if (options.designation && flow.designation !== options.designation)
      errors.push({code:'designation_required',path:'/flow/designation',message:`Expected flow designation: ${options.designation}`});
    if (!flow.designation && !options.graphs?.some(graph=>graph.designation) && !options.allowedEnvironments) return errors;
    const checked = new Set<string>();
    const visit = (source: Flow, environment: Environment, inherited: readonly Environment[], ancestors: Set<string>, path: string, inputs?: Readonly<Record<string, JsonValue>>) => {
      if (ancestors.has(source.id)) { errors.push({code:'designation_recursion',path,message:'Recursive graph calls are not supported.'}); return; }
      if (ancestors.size >= 32) { errors.push({code:'designation_depth',path,message:'Graph invocation depth exceeded.'}); return; }
      const key=canonicalJson({id:source.id,environment,inherited,inputs:inputs??null});
      if(checked.has(key))return;
      checked.add(key);
      const current = materializeHybrid(source,environment);
      errors.push(...this.validate(current,catalog,inputs).map(error=>({...error,path:path+error.path})));
      const own = current.designation ? this.get(current.designation)?.environments : undefined;
      const allowed = own ? inherited.filter(item=>own.includes(item)) : inherited;
      const next = new Set(ancestors).add(source.id);
      for (const node of current.nodes) {
        if (!allowed.includes(node.environment)) errors.push({code:'designation_environment',path:`${path}/flow/nodes/${node.id}`,message:`Runtime ${node.environment} is not allowed by the calling context.`});
        if (!node.graph || (node.graph.operation !== 'invoke' && !isGraphControl(node.graph.operation))) continue;
        const slots = isGraphControl(node.graph.operation) ? graphControlSlots(node.graph) : ['graph'];
        const ids = new Set<string>();
        if (node.graph.graphId) ids.add(node.graph.graphId);
        for (const edge of current.connections.filter(edge=>edge.target.nodeId===node.id && slots.includes(edge.target.port))) {
          const sourceNode = current.nodes.find(item=>item.id===edge.source.nodeId);
          if (sourceNode?.graph?.operation==='reference' && sourceNode.graph.graphId) ids.add(sourceNode.graph.graphId);
          if (sourceNode?.value?.operation==='input' && sourceNode.value.type.kind==='graph' && inputs) {
            const value = inputs[String(sourceNode.config.name)];
            if(value && typeof value==='object' && !Array.isArray(value) && typeof value.graphId==='string') ids.add(value.graphId);
          }
        }
        for (const id of ids) {
          const target = options.graphs?.find(item=>item.id===id);
          if (target) visit(target,node.environment,allowed,next,`${path}/calls/${node.id}/${id}`);
          else errors.push({code:'designation_graph_missing',path:`${path}/calls/${node.id}/${id}`,message:`Missing graph: ${id}`});
        }
      }
    };
    visit(flow,options.environment??'server',options.allowedEnvironments??['server','browser'],new Set(),'',options.inputs);
    return errors;
  }

  validateOutputs(flow: Flow, catalog: Catalog, outputs: Readonly<Record<string, JsonValue>>): Diagnostic[] {
    if (!flow.designation) return [];
    const definition=this.get(flow.designation);
    if(!definition)return [{code:'designation_unknown',path:'/flow/designation',message:`Unknown flow designation: ${flow.designation}`}];
    const context={flow,catalog,signature:flowInterface(flow,catalog)};
    return (definition.validators??[]).flatMap(id=>this.validators.get(id)!.validateOutputs?.(context,outputs)??[]);
  }

  validate(flow: Flow, catalog: Catalog, inputs?: Readonly<Record<string, JsonValue>>): Diagnostic[] {
    if (!flow.designation) return [];
    const definition = this.get(flow.designation);
    if (!definition) return [{code:'designation_unknown', path:'/flow/designation', message:`Unknown flow designation: ${flow.designation}`}];
    const signature = flowInterface(flow, catalog);
    const diagnostics: Diagnostic[] = [];
    for (const node of flow.nodes) if (!definition.environments.includes(node.environment))
      diagnostics.push({code:'designation_environment',path:`/flow/nodes/${node.id}`,message:`${definition.name}: runtime ${node.environment} is not allowed.`});
    for (const direction of ['inputs','outputs'] as const) {
      const contract = definition[direction];
      if (!contract) continue;
      for (const [name,type] of Object.entries(contract.required)) {
        const actual = signature[direction].find(port => port.name === name);
        if (!actual || canonicalJson(actual.type) !== canonicalJson(type))
          diagnostics.push({code:'designation_port',path:`/flow/${direction}/${name}`,message:`${definition.name}: required port ${name} is missing or has an incompatible type.`});
      }
      if (!contract.allowAdditional) for (const port of signature[direction]) if (!Object.hasOwn(contract.required,port.name))
        diagnostics.push({code:'designation_extra_port',path:`/flow/${direction}/${port.name}`,message:`${definition.name}: additional port ${port.name} is not allowed.`});
    }
    const context = {flow, signature, catalog};
    for (const id of definition.validators ?? []) {
      const validator = this.validators.get(id)!;
      diagnostics.push(...validator.validate?.(context) ?? []);
      if (inputs !== undefined) diagnostics.push(...validator.validateInputs?.(context,inputs) ?? []);
    }
    return diagnostics;
  }
}

export const flowDesignations = new DesignationRegistry();
