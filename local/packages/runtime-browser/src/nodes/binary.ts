import {defineNode,port} from '../runtime-browser/index.js';
export function base64ToArray(value:string):number[]{
  const text=value.replace(/[ \t\r\n]/g,'');
  const binary=atob(text);
  if(btoa(binary)!==text)throw new Error('Expected canonical Base64 (not a data URL).');
  return Array.from(binary,char=>char.charCodeAt(0));
}
export const binaryNodes=[defineNode({type:'Standard.Convert.Base64ToByteArray',version:1,label:'Base64 to Array',category:'Convert',inputs:{value:port.string()},outputs:{value:port.array(port.scalar('core.Integer'))},execute:({value})=>({value:base64ToArray(value)})})];
export function arrayToBase64(values:number[]):string {
  if(values.some(value=>!Number.isInteger(value)||value<0||value>255))throw new RangeError('Byte values must be between 0 and 255.');
  // Avoid spreading large documents into function arguments.
  let binary='';for(let i=0;i<values.length;i+=8192)binary+=String.fromCharCode(...values.slice(i,i+8192));
  return btoa(binary);
}
binaryNodes.push(defineNode({type:'Standard.Convert.ByteArrayToBase64',version:1,label:'Array to Base64',category:'Convert',description:'Kodiert eine Liste von Bytes (0 bis 255) als Base64.',inputs:{value:port.array(port.scalar('core.Integer'))},outputs:{value:port.string()},execute:({value})=>({value:arrayToBase64(value)})}));
