import {describeNode} from './node-descriptions.js';
import {dictionaryShape} from './dictionaries.js';
import {supportsValueOrder} from './value-order.js';
import {supportsValueEquality} from './value-equality.js';
import {valueNames} from './node-names.js';
import type {FlowNode,ValueNodeBinding,NodeDefinition,TypeRef} from './model.js';
import {canonicalJson,isTransportable} from './transport.js';
import {jsonValueType,jsonSupports} from './json-values.js';
export const generalValueOperations=['dictCreate','dictGet','dictTryGet','dictSet','dictRemove','dictContainsKey','dictKeys','dictValues','ternary','input','output','null','isNull','isMissing','require','hasField','removeField','merge','getProperty','record','withFields','list','count','getItem','addItem','addRange','insertItem','insertRange','setItem','removeAt','removeRange','clear','removeItem','removeAll','tryGetItem','first','last','tryFirst','tryLast','single','trySingle','contains','indexOf','lastIndexOf','isEmpty','skip','take','slice','reverse','chunk','flatten','sort','distinct','union','intersect','except','zip','sum','average','min','max','jsonFrom','jsonTo'] as const;
export const generalValueNodeType=(id:string,operation:string)=>valueNames[operation as keyof typeof valueNames];
function generalValueDefinitionCore(node:FlowNode):NodeDefinition {
  const b=node.value!,t=structuredClone(b.type);
  function require(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
  require(generalValueOperations.some(op=>op===b.operation)&&node.type===generalValueNodeType(node.id,b.operation)&&node.typeVersion===1&&!node.graph&&!node.query,'Invalid value specialization.');
  require(['getProperty','removeField'].includes(b.operation)||b.member===undefined,'Only GetProperty and RemoveField accept member.');
  require(['getProperty','zip','merge'].includes(b.operation)||b.result===undefined,'Only GetProperty, Zip and Merge accept result.');
  require(b.operation==='withFields'||b.fields===undefined,'Only WithFields accepts a field selection.');
  require(b.operation==='list'||b.count===undefined,'Only ListCreate accepts a count.');
  const inputs:Record<string,TypeRef>={},outputs:Record<string,TypeRef>={};
  let config:NodeDefinition['config'],control:NodeDefinition['control'],flowPort:NodeDefinition['flowPort'],label:string=b.operation;
  const bool:TypeRef={kind:'scalar',name:'core.Bool'},integer:TypeRef={kind:'scalar',name:'core.Integer'};
  switch(b.operation){
    case 'dictCreate':case 'dictGet':case 'dictTryGet':case 'dictSet':case 'dictRemove':case 'dictContainsKey':case 'dictKeys':case 'dictValues':{
      require(t.kind!=='optional','Dictionary values cannot be absent; use nullable values.');
      const dictionary:TypeRef={kind:'dictionary',items:t};label='Dictionary '+b.operation.slice(4);
      if(b.operation==='dictCreate'){inputs.entries=dictionaryShape(t);outputs.value=dictionary;break;}
      inputs.dictionary=dictionary;
      if(['dictGet','dictTryGet','dictSet','dictRemove','dictContainsKey'].includes(b.operation))inputs.key={kind:'string'};
      if(b.operation==='dictSet')inputs.item=t;
      switch(b.operation){
        case 'dictGet':outputs.value=t;break;
        case 'dictTryGet':outputs.found=bool;outputs.value={kind:'optional',inner:t};break;
        case 'dictContainsKey':outputs.value=bool;break;
        case 'dictKeys':outputs.value={kind:'array',items:{kind:'string'}};break;
        case 'dictValues':outputs.value={kind:'array',items:t};break;
        default:outputs.value=dictionary;if(b.operation==='dictRemove')outputs.removed=bool;
      }
      break;
    }
    case 'jsonFrom':case 'jsonTo':
      require(t.kind!=='optional'&&jsonSupports(t),'JSON conversion requires a scalar, nullable, record or array type.');
      label=b.operation==='jsonFrom'?'JSON From Value<T>':'JSON To Value<T>';
      inputs.value=b.operation==='jsonFrom'?t:jsonValueType;outputs.value=b.operation==='jsonTo'?t:jsonValueType;break;
    case 'ternary':label='Ternary<T>';inputs.condition=bool;inputs.whenTrue=t;inputs.whenFalse=t;outputs.value=t;break;
    case 'input':case 'output':
      flowPort=b.operation;label=b.operation==='input'?'Flow Input<T>':'Flow Output<T>';
      (b.operation==='input'?outputs:inputs).value=t;
      if(b.operation==='output')control={input:true,output:false,start:false};
      config={name:{type:'string',default:b.operation,label:'Name'}};break;
    case 'null':case 'require':
      require(!['optional','nullable'].includes(t.kind)&&(b.operation==='null'||t.kind!=='null'),'Choose a present, non-nullable T.');
      label=b.operation==='null'?'Null<T>':'RequireValue<T>';outputs.value=b.operation==='null'&&t.kind!=='null'?{kind:'nullable',inner:t}:t;
      if(b.operation==='require')inputs.value={kind:'optional',inner:{kind:'nullable',inner:t}};break;
    case 'isNull':label='IsNull<T>';require(t.kind==='nullable'||t.kind==='null','IsNull requires a nullable type.');inputs.value=t;outputs.value=bool;break;
    case 'isMissing':label='IsMissing<T>';inputs.value=t.kind==='optional'?t:{kind:'optional',inner:t};outputs.value=bool;break;
    case 'hasField':case 'removeField':
      require(t.kind==='object','Choose a record type.');inputs.value=t;
      if(b.operation==='hasField'){inputs.name={kind:'string'};outputs.value=bool;label='HasField';}
      else {require(b.member!==undefined&&Object.hasOwn(t.fields,b.member),'Choose an existing field to remove.');outputs.value={kind:'object',fields:Object.fromEntries(Object.entries(t.fields).filter(([name])=>name!==b.member))};outputs.removed=bool;label='RemoveField';}
      break;
    case 'merge':{
      const right=b.result??t;require(t.kind==='object'&&right.kind==='object','Merge requires two record types.');
      const fields:Record<string,TypeRef>=Object.assign(Object.create(null),t.fields);
      for(const [name,next] of Object.entries(right.fields)){
        const prior=fields[name];
        if(!prior){fields[name]=next;continue;}
        const leftType=prior.kind==='optional'?prior.inner:prior,rightType=next.kind==='optional'?next.inner:next;
        require(canonicalJson(leftType)===canonicalJson(rightType),'Conflicting record field types: '+name);
        fields[name]=prior.kind==='optional'&&next.kind==='optional'?{kind:'optional',inner:leftType}:leftType;
      }
      require(Object.keys(fields).length<=64,'Merged record must have at most 64 fields.');
      inputs.left=t;inputs.right=right;outputs.value={kind:'object',fields};label='Merge Records';break;
    }
    case 'getProperty':
      label='GetProperty<T>';require((t.kind==='object'||t.kind==='entity')&&b.member,'GetProperty requires a record/entity and member.');
      if(t.kind==='object'){require(Object.hasOwn(t.fields,b.member)&&b.result===undefined,'Unknown record member or redundant result type.');outputs.value=t.fields[b.member]!;}
      else {require(b.result,'Entity member needs its registered result type.');outputs.value=structuredClone(b.result);}
      inputs.value=t;break;
    case 'record':case 'withFields':{
      label=b.operation==='record'?'CreateRecord':'WithFields';require(t.kind==='object'&&Object.keys(t.fields).length<=64,'Choose a record with 0–64 named fields.');
      const fields=b.fields??Object.keys(t.fields);require(new Set(fields).size===fields.length&&fields.every(field=>Object.hasOwn(t.fields,field)),'Unknown or duplicate replacement field.');
      if(b.operation==='withFields')inputs.value=t;
      for(const field of fields)inputs[`field_${field}`]=t.fields[field]!;
      outputs.value=t;break;
    }
    case 'addItem':case 'addRange':case 'insertItem':case 'insertRange':case 'setItem':case 'removeAt':case 'removeRange':case 'clear':case 'removeItem':case 'removeAll':{
      require(t.kind!=='optional','List elements cannot be absent; use nullable elements.');
      const list:TypeRef={kind:'array',items:t};
      label=valueNames[b.operation].split('.').at(-1)+'<T>';
      inputs.items=list;outputs.value=list;
      if(['addItem','insertItem','setItem','removeItem','removeAll'].includes(b.operation))inputs.item=t;
      if(['addRange','insertRange'].includes(b.operation))inputs.additionalItems=list;
      if(['insertItem','insertRange','setItem','removeAt','removeRange'].includes(b.operation))inputs.index=integer;
      if(b.operation==='removeRange')inputs.length=integer;
      if(b.operation==='removeAt')outputs.removedItem=t;
      if(b.operation==='removeItem'||b.operation==='removeAll'){
        require(supportsValueEquality(t),'Input item: This type does not support value equality.');
        outputs[b.operation==='removeItem'?'removed':'removedCount']=b.operation==='removeItem'?bool:integer;
      }
      break;
    }
    case 'tryGetItem':case 'first':case 'last':case 'tryFirst':case 'tryLast':case 'single':case 'trySingle':case 'contains':case 'indexOf':case 'lastIndexOf':case 'isEmpty':case 'skip':case 'take':case 'slice':case 'reverse':case 'chunk':case 'flatten':{
      require(t.kind!=='optional','List elements cannot be absent; use nullable elements.');
      const list:TypeRef={kind:'array',items:t};
      label=valueNames[b.operation].split('.').at(-1)+'<T>';
      inputs.items=b.operation==='flatten'?{kind:'array',items:list}:list;
      outputs.value=list;
      if(['first','last','single'].includes(b.operation))outputs.value=t;
      if(['tryGetItem','tryFirst','tryLast','trySingle'].includes(b.operation)){
        outputs.value={kind:'optional',inner:t};outputs.found=bool;
        if(b.operation==='trySingle')outputs.status={kind:'string'};
      }
      if(b.operation==='tryGetItem'||b.operation==='slice')inputs.index=integer;
      if(b.operation==='slice')inputs.length=integer;
      if(b.operation==='skip'||b.operation==='take')inputs.count=integer;
      if(b.operation==='chunk'){inputs.size=integer;outputs.value={kind:'array',items:list};}
      if(b.operation==='isEmpty')outputs.value=bool;
      if(['contains','indexOf','lastIndexOf'].includes(b.operation)){
        require(supportsValueEquality(t),'Input item: This type does not support value equality.');
        inputs.item=t;outputs.value=b.operation==='contains'?bool:integer;
      }
      break;
    }
    case 'sort':case 'distinct':case 'union':case 'intersect':case 'except':case 'zip':case 'sum':case 'average':case 'min':case 'max':{
      require(t.kind!=='optional','List elements cannot be absent.');
      const list:TypeRef={kind:'array',items:t};inputs.items=list;outputs.value=list;
      label=valueNames[b.operation].split('.').at(-1)+'<T>';
      if(['distinct','union','intersect','except'].includes(b.operation))require(supportsValueEquality(t),'Type does not support equality.');
      if(['union','intersect','except'].includes(b.operation))inputs.other=list;
      if(['sort','min','max'].includes(b.operation))require(supportsValueOrder(t),'Type does not support ordering.');
      if(b.operation==='sort')inputs.descending={kind:'optional',inner:bool};
      if(b.operation==='min'||b.operation==='max')outputs.value={kind:'optional',inner:t};
      if(b.operation==='sum'||b.operation==='average'){
        require(t.kind==='scalar'&&['core.Integer','core.Decimal'].includes(t.name),'Choose Integer or Decimal.');
        outputs.value=b.operation==='sum'?t:{kind:'optional',inner:{kind:'scalar',name:'core.Decimal'}};
      }
      if(b.operation==='zip'){
        const right=b.result??t;require(right.kind!=='optional','Zip elements cannot be absent.');
        inputs.other={kind:'array',items:right};outputs.value={kind:'array',items:{kind:'object',fields:{left:t,right}}};
      }
      break;
    }
    case 'list':case 'count':case 'getItem':{
      require(t.kind!=='optional','List elements cannot be absent; use nullable elements.');
      const list:TypeRef={kind:'array',items:t};
      if(b.operation==='list'){
        label='ListCreate<T>';require(b.count!==undefined&&Number.isInteger(b.count)&&b.count>=0&&b.count<=256,'ListCreate needs a count between 0 and 256.');
        for(let i=0;i<b.count;i++)inputs[`item_${i}`]=t;outputs.value=list;
      }else {inputs.items=list;outputs.value=b.operation==='count'?integer:t;label=b.operation==='count'?'ListCount<T>':'GetItem<T>';if(b.operation==='getItem')inputs.index=integer;}
      break;
    }
  }
  const environments:NodeDefinition['environments']=[...Object.values(inputs),...Object.values(outputs)].every(isTransportable)?['server','browser']:['server'];
  require(node.environment!=='browser'||environments.includes('browser'),'Native values require backend execution.');
  return {nodeId:node.id,type:node.type,version:1,environments,inputs,outputs,metadata:{label,...(b.operation==='ternary'?{description:'condition ? whenTrue : whenFalse. Beide verbundenen Zweige werden ausgewertet.'}:{}),category:flowPort?'Flow/Generic':'Values/Generic',inputs:Object.fromEntries(Object.keys(inputs).map(key=>[key,{label:key.startsWith('field_')?key.slice(6):key}]))},...(config?{config}:{}),...(control?{control}:{}),...(flowPort?{flowPort}:{}),value:structuredClone(b)};
}
export function generalValueDefault(operation:ValueNodeBinding['operation']):ValueNodeBinding {
  return {operation,type:['sum','average'].includes(operation)?{kind:'scalar',name:'core.Decimal'}:operation==='isNull'?{kind:'nullable',inner:{kind:'string'}}:['record','withFields','getProperty','hasField','removeField','merge'].includes(operation)?{kind:'object',fields:{text:{kind:'string'}}}:{kind:'string'},...(['getProperty','removeField'].includes(operation)?{member:'text'}:{}),...(operation==='list'?{count:2}:{})};
}
export function generalValueTemplates():NodeDefinition[]{
  return generalValueOperations.map(operation=>{const {value,nodeId,...definition}=generalValueDefinition({id:'template',type:generalValueNodeType('template',operation),typeVersion:1,environment:'server',config:{},value:generalValueDefault(operation)});return {...definition,type:valueNames[operation]};});
}

export function generalValueDefinition(node:FlowNode):NodeDefinition {return describeNode(generalValueDefinitionCore(node));}
