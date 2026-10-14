import {defineNode,port} from '../runtime-browser/authoring.js';
import {NodeFailure} from '../runtime-browser/node-failure.js';
export const assertNode=defineNode({type:'Standard.Flow.Assert',version:1,label:'Assert',category:'Control',description:'Prüft eine Bedingung. Bei false schlägt die Node mit Meldung und Fehlercode fehl; bei true geht der Kontrollfluss weiter.',control:{input:true,output:true,start:false},inputs:{condition:port.scalar('core.Bool'),message:port.optional(port.string()),code:port.optional(port.string())},outputs:{},execute:({condition,message,code})=>{
 if(condition)return {};
 const failureCode=code??'assertion_failed';
 if(!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(failureCode)||['cancelled','session_lost','timeout','limit'].includes(failureCode))throw new Error('code: Expected a non-reserved error identifier (1–128 characters).');
 throw new NodeFailure(failureCode,message??'Assertion failed.');
}});
