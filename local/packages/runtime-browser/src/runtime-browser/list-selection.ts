import type {ValueNodeBinding} from '@adam-flow/core/flow-core/model.js';
import {valuesEqual} from '@adam-flow/core/flow-core/value-equality.js';

export function executeListSelection(binding:ValueNodeBinding,inputs:Record<string,unknown>):Record<string,unknown>{
  const items=inputs.items as unknown[],operation=binding.operation;
  const integer=(port:string,min:number)=>{
    const value=inputs[port] as number;
    if(!Number.isInteger(value)||value<min)throw new Error(`Input ${port}: Expected an integer >= ${min}.`);
    return value;
  };
  switch(operation){
    case 'contains':case 'indexOf':case 'lastIndexOf':{
      let index=-1;
      for(let i=0;i<items.length;i++)if(valuesEqual(binding.type,items[i],inputs.item)){
        index=i;if(operation!=='lastIndexOf')break;
      }
      return {value:operation==='contains'?index>=0:index};
    }
    case 'isEmpty':return {value:items.length===0};
    case 'first':case 'last':case 'single':
      if(items.length===0||operation==='single'&&items.length!==1)throw new Error(`Input items: ${operation==='single'?'Expected exactly one element.':'List must not be empty.'}`);
      return {value:items[operation==='last'?items.length-1:0]};
    case 'tryGetItem':case 'tryFirst':case 'tryLast':case 'trySingle':{
      const index=operation==='tryGetItem'?inputs.index as number:operation==='tryLast'?items.length-1:0;
      const found=Number.isInteger(index)&&index>=0&&index<items.length&&(operation!=='trySingle'||items.length===1);
      return {found,...(found?{value:items[index]}:{}),...(operation==='trySingle'?{status:items.length===0?'empty':items.length===1?'single':'multiple'}:{})};
    }
    case 'skip':return {value:items.slice(integer('count',0))};
    case 'take':return {value:items.slice(0,integer('count',0))};
    case 'slice':{
      const index=integer('index',0),length=integer('length',0);
      if(index>items.length)throw new Error('Input index: Index out of range.');
      if(length>items.length-index)throw new Error('Input length: Range must fit within the list.');
      return {value:items.slice(index,index+length)};
    }
    case 'reverse':return {value:items.slice().reverse()};
    case 'chunk':{
      const size=integer('size',1),value:unknown[][]=[];
      for(let i=0;i<items.length;i+=size)value.push(items.slice(i,i+size));
      return {value};
    }
    case 'flatten':return {value:(items as unknown[][]).flat()};
    default:throw new Error('Unknown list selection operation.');
  }
}
