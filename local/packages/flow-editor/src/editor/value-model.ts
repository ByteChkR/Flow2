import type {JsonValue,TypeRef} from '@adam-flow/core/flow-core/index.js';

/** Defaults are used only after an explicit user action (add item / set optional value). */
export function initialValue(type:TypeRef):JsonValue|undefined {
  switch(type.kind){
    case 'optional':return undefined;
    case 'nullable':case 'null':return null;
    case 'boolean':return false;
    case 'number':return 0;
    case 'string':return '';
    case 'scalar':switch(type.name){
      case 'core.Bool':return false;
      case 'core.Integer':return 0;
      case 'core.Decimal':case 'core.TimeSpan':return '0';
      case 'core.Guid':return '00000000-0000-0000-0000-000000000000';
      case 'core.DateTimeOffset':return '1970-01-01T00:00:00.0000000+00:00';
    }break;
    case 'dictionary':case 'array':return [];
    case 'object':return Object.fromEntries(Object.entries(type.fields).map(([name,field])=>[name,initialValue(field)]).filter(([,value])=>value!==undefined)) as Record<string,JsonValue>;
    case 'entityRef':return {type:type.name,id:''};
    case 'graph':return {graphId:'',revision:1};
    case 'entity':return undefined;
  }
}
export function replaceField(value:unknown,key:string,next:JsonValue|undefined):Record<string,JsonValue> {
  const fields=value&&typeof value==='object'&&!Array.isArray(value)?{...value} as Record<string,JsonValue>:{};
  if(next===undefined)delete fields[key];else fields[key]=next;
  return fields;
}
export function typeLabel(type:TypeRef):string {
  switch(type.kind){
    case 'scalar':return type.name.replace(/^core\./,'');
    case 'nullable':return `${typeLabel(type.inner)} | null`;
    case 'optional':return `${typeLabel(type.inner)} (optional)`;
    case 'dictionary':return `Dictionary<Text, ${typeLabel(type.items)}>`;
    case 'array':return `Liste<${typeLabel(type.items)}>`;
    case 'grouping':return `Group<${typeLabel(type.key)}, ${typeLabel(type.items)}>`;
    case 'enumerable':return `Enumerable<${typeLabel(type.items)}>`;
    case 'orderedQueryable':return `OrderedQueryable<${typeLabel(type.items)}>`;
    case 'queryable':return `Queryable<${type.items.kind==='entity'?type.items.name.split('@')[0]!.split('.').at(-1):typeLabel(type.items)}>`;
    case 'object':return 'Record';
    case 'entity':case 'entityRef':return type.name;
    default:return type.kind;
  }
}
export function displayValue(value:unknown):string {
  return value!==null&&typeof value==='object'?JSON.stringify(value,null,2):String(value);
}
