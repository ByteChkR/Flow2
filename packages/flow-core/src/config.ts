import type { ConfigField, Diagnostic, JsonValue, NodeDefinition } from './model.js';

export function configDefaults(fields: Record<string, ConfigField> = {}): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.default]));
}
export function validateConfig(fields: Record<string, ConfigField> = {}, values: Record<string, JsonValue>, path = '/config'): Diagnostic[] {
  return Object.entries(fields).flatMap(([key, field]) => {
    const value = Object.hasOwn(values, key) ? values[key] : field.default;
    return typeof value !== field.type || (typeof value === 'number' && !Number.isFinite(value)) ||
      (field.type === 'string' && field.options && !field.options.includes(value as string))
      ? [{code:'config',path:`${path}/${key}`,message:`Invalid configuration value for ${key}.`}] : [];
  });
}
export function validateNodeMetadata(node: NodeDefinition): Diagnostic[] {
  const errors = validateConfig(node.config, configDefaults(node.config));
  for (const direction of ['inputs','outputs'] as const) for (const key of Object.keys(node.metadata?.[direction] ?? {})) {
    if (!Object.hasOwn(node[direction],key)) errors.push({code:'metadata',path:`/${direction}/${key}`,message:'Metadata refers to an unknown port.'});
  }
  return errors;
}

export function configContract(fields:Record<string,ConfigField>):unknown {
  return Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,{type:field.type,default:field.default,...(field.type==='string'&&field.options?{options:field.options}:{})}]));
}
