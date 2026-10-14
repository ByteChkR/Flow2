import { defineNode, field, port } from '../runtime-browser/index.js';

export const start = defineNode({
  type:'Standard.Flow.Start',version:1,label:'Start',category:'Control',
  control:{input:false,output:true,start:true},inputs:{},outputs:{},execute:()=>({}),
});

export {wait} from "./decimal.js";

export const print=defineNode({
  type:'Standard.Debug.Print',version:1,label:'Print',category:'Debug',
  control:{input:true,output:true,start:false},inputs:{text:port.string({label:'Text'})},outputs:{},
  execute({text},{log}){log.info(text);return {};},
});
export const error=defineNode({
  type:'Standard.Debug.Error',version:1,label:'Error',category:'Debug',
  control:{input:true,output:true,start:false},inputs:{message:port.optional(port.string({label:'Message'}))},outputs:{},
  config:{message:field.string('Flow execution failed.',{label:'Message'})},
  execute({message},{config}){throw new Error(message??config.message);},
});
export const constantString=defineNode({
  type:'Standard.Values.Constant.String',version:1,label:'Constant String',category:'Values',
  inputs:{},outputs:{value:port.string({label:'Value'})},config:{value:field.string('',{label:'Value'})},
  execute(_,{config}){return {value:config.value};},
});


export const constantDate = defineNode({
  type:'Standard.Values.Constant.DateTimeOffset',version:1,label:'Constant Date',category:'Values',
  inputs:{},outputs:{value:port.scalar('core.DateTimeOffset',{label:'Value'})},
  config:{value:field.scalar('core.DateTimeOffset','1970-01-01T00:00:00+00:00',{label:'Value'})},
  execute:(_,{config})=>({value:config.value}),
});
