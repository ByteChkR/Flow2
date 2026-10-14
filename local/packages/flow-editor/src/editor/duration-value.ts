import {parseScalar} from '@adam-flow/core/flow-core/scalars.js';

/** Human-readable duration; never passes Int64 ticks through a JS number. */
export function formatDuration(value:unknown):string {
  let ticks=BigInt(parseScalar('core.TimeSpan',value) as string);
  const sign=ticks<0n?'-':'';
  if(ticks<0n)ticks=-ticks;
  const fraction=ticks%10000000n;let seconds=ticks/10000000n;
  const second=seconds%60n;seconds/=60n;
  const minute=seconds%60n;seconds/=60n;
  const hour=seconds%24n,days=seconds/24n;
  const pad=(n:bigint)=>String(n).padStart(2,'0');
  return `${sign}${days?`${days}.`:''}${pad(hour)}:${pad(minute)}:${pad(second)}${fraction?`.${String(fraction).padStart(7,'0')}`:''}`;
}

export function parseDuration(text:string):string {
  const match=/^(-)?(?:(\d+)\.)?(\d{1,2}):([0-5]\d):([0-5]\d)(?:\.(\d{1,7}))?$/.exec(text.trim());
  if(!match||BigInt(match[3]!)>23n)throw new Error('Dauer im Format [-][Tage.]hh:mm:ss[.fffffff] eingeben.');
  const magnitude=((BigInt(match[2]??'0')*24n+BigInt(match[3]!))*3600n+BigInt(match[4]!)*60n+BigInt(match[5]!))*10000000n+BigInt((match[6]??'').padEnd(7,'0'));
  return parseScalar('core.TimeSpan',String(match[1]?-magnitude:magnitude)) as string;
}
