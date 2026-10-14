import {defineNode,field,port} from '../runtime-browser/index.js';
import {parseScalar} from '@adam-flow/core/flow-core/index.js';

/** Validate and round up exact seconds before the bounded conversion required by setTimeout. */
export function decimalDelayMilliseconds(value:string):number {
  const canonical=parseScalar('core.Decimal',value) as string;
  const [whole,fraction='']=canonical.split('.');
  const scale=10n**BigInt(fraction.length),coefficient=BigInt(whole!+fraction);
  if(coefficient<0n||coefficient*1000n>2147483647n*scale)throw new RangeError('Seconds must be between 0 and 2147483.647.');
  return Number((coefficient*1000n+scale-1n)/scale);
}

export const wait=defineNode({
  type:'Standard.Flow.Wait',version:1,label:'Wait',category:'Control',control:{input:true,output:true,start:false},
  inputs:{seconds:port.scalar('core.Decimal',{label:'Seconds',description:'Non-negative duration in seconds, including fractions.'})},outputs:{},
  async execute({seconds},{signal}){
    const milliseconds=decimalDelayMilliseconds(seconds);
    signal?.throwIfAborted();
    await new Promise<void>((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal?.reason);};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},milliseconds);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    });
    return {};
  },
});
