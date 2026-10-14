import {parseScalar} from './scalars.js';

const dayTicks=864000000000n,maxDateTicks=3155378975999999999n;
const daysBefore=(year:number)=>{const y=year-1;return y*365+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400);};
const months=(year:number)=>[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
const duration=(value:string)=>BigInt(parseScalar('core.TimeSpan',value) as string);
function checkedDuration(value:bigint):string{
  if(value< -9223372036854775808n||value>9223372036854775807n)throw new RangeError('TimeSpan overflow.');
  return String(value);
}
function instant(value:string){
  const iso=parseScalar('core.DateTimeOffset',value) as string;
  const year=Number(iso.slice(0,4)),month=Number(iso.slice(5,7)),day=Number(iso.slice(8,10));
  const days=daysBefore(year)+months(year).slice(0,month-1).reduce((sum,count)=>sum+count,0)+day-1;
  const seconds=Number(iso.slice(11,13))*3600+Number(iso.slice(14,16))*60+Number(iso.slice(17,19));
  const offset=iso.slice(27),minutes=(Number(offset.slice(1,3))*60+Number(offset.slice(4,6)))*(offset[0]==='-'?-1:1);
  const local=BigInt(days)*dayTicks+BigInt(seconds)*10000000n+BigInt(iso.slice(20,27));
  return {local,utc:local-BigInt(minutes)*600000000n,offset};
}
function localDate(ticks:bigint,offset:string):string {
  if(ticks<0n||ticks>maxDateTicks)throw new RangeError('DateTimeOffset overflow.');
  const days=Number(ticks/dayTicks);let low=1,high=9999;
  while(low<high){const middle=Math.ceil((low+high)/2);if(daysBefore(middle)<=days)low=middle;else high=middle-1;}
  const year=low;let remaining=days-daysBefore(year),month=0;const lengths=months(year);
  while(remaining>=lengths[month]!){remaining-=lengths[month]!;month++;}
  const within=ticks%dayTicks,seconds=within/10000000n;
  const pad=(value:number|bigint,width=2)=>String(value).padStart(width,'0');
  const text=`${pad(year,4)}-${pad(month+1)}-${pad(remaining+1)}T${pad(seconds/3600n)}:${pad(seconds/60n%60n)}:${pad(seconds%60n)}.${pad(within%10000000n,7)}${offset}`;
  // Includes the UTC range check, which can fail even when the local calendar date is valid.
  return parseScalar('core.DateTimeOffset',text) as string;
}
export const timeSpanMath={
  add:(a:string,b:string)=>checkedDuration(duration(a)+duration(b)),
  compare:(a:string,b:string)=>{const x=duration(a),y=duration(b);return x<y?-1:x>y?1:0;},
};
export const dateTimeOffsetMath={
  difference:(left:string,right:string)=>checkedDuration(instant(left).utc-instant(right).utc),
  add:(value:string,ticks:string)=>{const date=instant(value);return localDate(date.local+duration(ticks),date.offset);},
  compare:(a:string,b:string)=>{const x=instant(a).utc,y=instant(b).utc;return x<y?-1:x>y?1:0;},
};

export const dateTimeOffsetKey=(value:string):string=>String(instant(value).utc);
