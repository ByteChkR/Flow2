import {isScalarValue} from './scalars.js';
import type { ConfigField, Diagnostic, JsonValue, NodeDefinition } from './model.js';

export function configDefaults(fields: Record<string, ConfigField> = {}): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.default]));
}
export function validateConfig(fields: Record<string, ConfigField> = {}, values: Record<string, JsonValue>, path = '/config'): Diagnostic[] {
  return Object.entries(fields).flatMap(([key, field]) => {
    const value = Object.hasOwn(values, key) ? values[key] : field.default;
    return (field.type==='scalar' ? !isScalarValue(field.scalar,value) : typeof value !== field.type || (typeof value === 'number' && !Number.isFinite(value)) ||
      (field.type === 'string' && field.options && !field.options.includes(value as string)))
      ? [{code:'config',path:`${path}/${key}`,message:`Invalid configuration value for ${key}.`}] : [];
  });
}
export function validateNodeMetadata(node: NodeDefinition): Diagnostic[] {
  const errors = validateConfig(node.config, configDefaults(node.config));
  if(node.flowPort){
    const ports=node.flowPort==='input'?node.outputs:node.inputs;
    const other=node.flowPort==='input'?node.inputs:node.outputs;
    if(Object.keys(ports).length!==1||!ports.value||Object.keys(other).length||node.config?.name?.type!=='string'||
      (node.flowPort==='input'?!!node.control:!node.control?.input||node.control.start))
      errors.push({code:'flow_port',path:'/catalog',message:'Flow ports require a name configuration, one scalar or graph value port, and control input for outputs only.'});
  }
  for (const direction of ['inputs','outputs'] as const) for (const key of Object.keys(node.metadata?.[direction] ?? {})) {
    const editor=node.metadata?.[direction]?.[key]?.editor;
    if(editor){let type=node[direction][key];while(type?.kind==='optional'||type?.kind==='nullable')type=type.inner;if(direction!=='inputs'||type?.kind!=='string')errors.push({code:'metadata',path:`/${direction}/${key}`,message:'HTML editors require a string input.'});}
    const rule=node.metadata?.[direction]?.[key]?.requiredWhen;
    if(rule&&(direction!=='inputs'||node.config?.[rule.config]?.type!=='string'))errors.push({code:'metadata',path:`/${direction}/${key}`,message:'Input requirement must refer to a string configuration.'});
    if (!Object.hasOwn(node[direction],key)) errors.push({code:'metadata',path:`/${direction}/${key}`,message:'Metadata refers to an unknown port.'});
  }
  return errors;
}

export function configContract(fields:Record<string,ConfigField>):unknown {
  return Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,{type:field.type,default:field.default,...(field.type==='scalar'?{scalar:field.scalar}:{}),...(field.type==='string'&&field.options?{options:field.options}:{})}]));
}

/** Config-dependent input requirement; an absent config value uses its declared default. */
export function inputRequired(node:NodeDefinition,values:Record<string,JsonValue>,port:string):boolean {
  if(node.inputs[port]?.kind!=='optional')return true;
  const rule=node.metadata?.inputs?.[port]?.requiredWhen;
  return !!rule&&(values[rule.config]??node.config?.[rule.config]?.default)===rule.value;
}
