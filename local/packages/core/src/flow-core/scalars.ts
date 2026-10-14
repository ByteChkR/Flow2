/** Exact wire values. Decimal/date/duration never pass through a JS floating-point value. */
export const scalarNames=['core.Bool','core.Decimal','core.Integer','core.DateTimeOffset','core.TimeSpan','core.Guid'] as const;
export type ScalarName=typeof scalarNames[number];
export type ScalarValue=string|number|boolean;
const decimalMax=79228162514264337593543950335n;
const ticksPerDay=864000000000n;
const maxDateTicks=3155378975999999999n;
function invalid(name:string):never{throw new Error(`Invalid ${name} value.`);}
function text(value:unknown,name:string):string{
  if(typeof value!=='string'||value.length>256)invalid(name);
  return value.trim();
}
export function parseScalar(name:ScalarName,value:unknown):ScalarValue {
  switch(name){
    case 'core.Bool':if(typeof value!=='boolean')invalid(name);return value;
    case 'core.Integer':if(typeof value!=='number'||!Number.isInteger(value)||value<-2147483648||value>2147483647)invalid(name);return value===0?0:value;
    case 'core.Decimal':{
      const match=/^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text(value,name));if(!match)invalid(name);
      const fraction=(match[3]??'').replace(/0+$/,'');
      const coefficient=BigInt(match[2]!+fraction);
      if(fraction.length>28||coefficient>decimalMax)invalid(name);
      const integer=BigInt(match[2]!).toString();
      return (coefficient!==0n&&match[1]==='-'?'-':'')+integer+(fraction?'.'+fraction:'');
    }
    case 'core.TimeSpan':{
      const input=text(value,name);if(!/^[+-]?\d+$/.test(input))invalid(name);
      const ticks=BigInt(input);if(ticks< -9223372036854775808n||ticks>9223372036854775807n)invalid(name);
      return ticks.toString();
    }
    case 'core.Guid':{
      const input=text(value,name);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input))invalid(name);
      return input.toLowerCase();
    }
    case 'core.DateTimeOffset':{
      const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})$/.exec(text(value,name));
      if(!match)invalid(name);
      const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
      const hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]);
      const leap=year%4===0&&(year%100!==0||year%400===0);
      const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
      if(year<1||month<1||month>12||day<1||day>days[month-1]!||hour>23||minute>59||second>59)invalid(name);
      const zone=match[8]!;
      const offsetHours=zone==='Z'?0:Number(zone.slice(1,3)),offsetMinutes=zone==='Z'?0:Number(zone.slice(4,6));
      if(offsetHours>14||offsetMinutes>59||(offsetHours===14&&offsetMinutes!==0))invalid(name);
      const offset=(offsetHours*60+offsetMinutes)*(zone[0]==='-'?-1:1);
      const previous=year-1;
      const dayNumber=previous*365+Math.floor(previous/4)-Math.floor(previous/100)+Math.floor(previous/400)+days.slice(0,month-1).reduce((a,b)=>a+b,0)+day-1;
      const fraction=(match[7]??'').padEnd(7,'0');
      const utcTicks=BigInt(dayNumber)*ticksPerDay+BigInt(hour*3600+minute*60+second-offset*60)*10000000n+BigInt(fraction);
      if(utcTicks<0n||utcTicks>maxDateTicks)invalid(name);
      return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${fraction}${offset===0?'+00:00':zone}`;
    }
    default:return invalid(String(name));
  }
}
/** Parsers normalize editor input; wire validation requires its canonical representation. */
export function isScalarValue(name:ScalarName,value:unknown):boolean{
  try{return parseScalar(name,value)===value;}catch{return false;}
}
