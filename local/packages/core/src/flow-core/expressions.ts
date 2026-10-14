import {isStringExpression,stringExpressions,stringExpressionType,type StringExpressionOperation} from './string-expressions.js';
import type {TypeRef,TypeDocument} from './model.js';
import {canonicalJson} from './transport.js';
import {TypeRegistry,validateValue} from './types.js';

export type ExpressionOperation=StringExpressionOperation|'external'|'parameter'|'property'|'optionalProperty'|'ternary'|'constant'|'record'|'equal'|'notEqual'|'greaterThan'|'lessThan'|'greaterOrEqual'|'lessOrEqual'|'and'|'or'|'xor'|'not'|'isNull'|'groupKey'|'groupElements'|'count'|'sum'|'min'|'max';
export interface ExpressionNode {id:string;operation:ExpressionOperation;inputs:Record<string,string>;member?:string;type?:TypeRef;value?:unknown}
export interface ExpressionGraph {schemaVersion:1;parameter:TypeRef;nodes:ExpressionNode[];result:string}
const bool:TypeRef={kind:'scalar',name:'core.Bool'};
const scalar=(type:TypeRef):boolean=>type.kind==='scalar'||type.kind==='string'||type.kind==='nullable'&&scalar(type.inner);
/** Infer every expression port, including disconnected nodes, without executing user code. */
export function expressionTypes(graph:ExpressionGraph,types:TypeDocument,options:{registry?:TypeRegistry;errors?:Map<string,string>}={}):Map<string,TypeRef> {
  const registry=options.registry??new TypeRegistry(types),nodes=new Map(graph.nodes.map(node=>[node.id,node])),result=new Map<string,TypeRef>(),visiting=new Set<string>();
  if(graph.schemaVersion!==1||!graph.nodes.length||graph.nodes.length>512||nodes.size!==graph.nodes.length)throw new Error('Ungültiger Ausdrucksgraph.');
  if(registry.check(graph.parameter).length)throw new Error('Unbekannter Parametertyp.');
  const failures=new Map<string,unknown>();
  function infer(id:string):TypeRef {
    if(failures.has(id))throw failures.get(id);
    const cached=result.get(id);if(cached)return cached;
    const node=nodes.get(id);if(!node)throw new Error(`${id}: Ausdruck fehlt.`);
    if(visiting.has(id))throw new Error(`${id}: Zyklus im Ausdruck.`);
    visiting.add(id);
    try {
    const input=(name:string)=>infer(node.inputs[name]??'');
    function shape(...names:string[]){if(canonicalJson(Object.keys(node!.inputs).sort())!==canonicalJson(names.sort()))throw new Error(`${id}: Ungültige Eingänge.`);}
    let type:TypeRef;
    switch(node.operation){
      case 'external':
        shape();if(node.value!==undefined||!node.member||! /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(node.member)||!node.type||!scalar(node.type)||registry.check(node.type).length)throw new Error(`${id}: Ungültiger externer Parameter.`);
        if(graph.nodes.some(other=>other.operation==='external'&&other.member===node.member&&canonicalJson(other.type)!==canonicalJson(node.type)))throw new Error(`${id}: Widersprüchliche Parametertypen.`);
        type=node.type;break;
      case 'parameter':shape();type=graph.parameter;break;
      case 'record':
        if(!Object.keys(node.inputs).length||Object.keys(node.inputs).length>64||Object.keys(node.inputs).some(name=>! /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)))throw new Error(`${id}: Record benötigt 1–64 benannte Felder.`);
        type={kind:'object',fields:Object.fromEntries(Object.keys(node.inputs).sort().map(name=>[name,input(name)]))};break;
      case 'constant':
        shape();if(!node.type||!scalar(node.type)||registry.check(node.type).length||validateValue(node.type,node.value,registry).length)throw new Error(`${id}: Ungültige Konstante.`);
        type=node.type;break;
      case 'groupKey':case 'groupElements':{
        shape('value');const group=input('value');
        if(group.kind!=='grouping')throw new Error(`${id}: Gruppe erforderlich.`);
        type=node.operation==='groupKey'?group.key:{kind:'enumerable',items:group.items};break;
      }
      case 'count':case 'sum':case 'min':case 'max':{
        shape('value');const group=input('value');
        if(group.kind!=='grouping'&&group.kind!=='enumerable')throw new Error(`${id}: Gruppe oder Elemente erforderlich.`);
        if(node.operation==='count'){type={kind:'scalar',name:'core.Integer'};break;}
        const element=group.items;
        const fields=element.kind==='entity'?types.types.find(type=>type.id===element.name)?.fields:element.kind==='object'?element.fields:undefined;
        const value=node.member?fields?.[node.member]:element;
        const numeric=value?.kind==='nullable'?value.inner:value;
        if(numeric?.kind!=='scalar'||!['core.Integer','core.Decimal'].includes(numeric.name))throw new Error(`${id}: Integer- oder Decimal-Werte erforderlich.`);
        type=value!;break;
      }
      case 'property':case 'optionalProperty':{
        shape('value');const source=input('value'),owner=source.kind==='nullable'?source.inner:source;
        const fields=owner.kind==='entity'?types.types.find(type=>type.id===owner.name)?.fields:owner.kind==='object'?owner.fields:undefined;
        const field=node.member&&fields?.[node.member];if(!field)throw new Error(`${id}: Eigenschaft ist nicht registriert.`);
        type=(source.kind==='nullable'||node.operation==='optionalProperty')&&field.kind!=='nullable'?{kind:'nullable',inner:field}:field;break;
      }
      case 'ternary':{
        shape('condition','whenTrue','whenFalse');
        if(canonicalJson(input('condition'))!==canonicalJson(bool))throw new Error(`${id}: Bedingung muss Bool sein.`);
        const yes=input('whenTrue'),no=input('whenFalse');
        if(canonicalJson(yes)===canonicalJson(no))type=yes;
        else if(yes.kind==='nullable'&&canonicalJson(yes.inner)===canonicalJson(no))type=yes;
        else if(no.kind==='nullable'&&canonicalJson(no.inner)===canonicalJson(yes))type=no;
        else throw new Error(`${id}: Beide Zweige benötigen denselben Typ (gegebenenfalls nullable).`);
        break;
      }
      case 'isNull':shape('value');if(input('value').kind!=='nullable')throw new Error(`${id}: Nullable erforderlich.`);type=bool;break;
      case 'not':shape('value');if(canonicalJson(input('value'))!==canonicalJson(bool))throw new Error(`${id}: Bool erforderlich.`);type=bool;break;
      case 'equal':case 'notEqual':case 'greaterThan':case 'lessThan':case 'greaterOrEqual':case 'lessOrEqual':case 'and':case 'or':case 'xor':{
        shape('left','right');const left=input('left'),right=input('right');
        if(canonicalJson(left)!==canonicalJson(right)||!scalar(left))throw new Error(`${id}: Gleiche skalare Operandentypen erforderlich.`);
        if(['and','or','xor'].includes(node.operation)&&canonicalJson(left)!==canonicalJson(bool))throw new Error(`${id}: Bool erforderlich.`);
        if(['greaterThan','lessThan','greaterOrEqual','lessOrEqual'].includes(node.operation)){
          const inner=left.kind==='nullable'?left.inner:left;
          if(inner.kind!=='scalar'||!['core.Integer','core.Decimal','core.DateTimeOffset','core.TimeSpan'].includes(inner.name))throw new Error(`${id}: Nicht vergleichbarer Typ.`);
        }
        type=bool;break;
      }
      default:
        if(!isStringExpression(node.operation))throw new Error(`${id}: Operation ist in Ausdrücken nicht erlaubt.`);
        shape(...stringExpressions[node.operation].inputs);
        type=stringExpressionType(node.operation,input);break;
    }
    result.set(id,type);return type;
    }catch(error){failures.set(id,error);throw error;}finally{visiting.delete(id);}
  }
  if(options.errors){
    for(const id of new Set([graph.result,...graph.nodes.map(node=>node.id)]))try{infer(id);}catch(error){options.errors.set(id,String(error));}
  }else {infer(graph.result);for(const node of graph.nodes)infer(node.id);}
  return result;
}
