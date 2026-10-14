import {defineNode,port,type AuthoredNode} from '../runtime-browser/authoring.js';
import {parseScalar,decimalMath,dateTimeOffsetMath} from '@adam-flow/core/flow-core/index.js';
const units:Record<string,bigint>={ticks:1n,microseconds:10n,milliseconds:10000n,seconds:10000000n,minutes:600000000n,hours:36000000000n,days:864000000000n};
function unitTicks(unit:string):bigint{if(!Object.hasOwn(units,unit))throw new Error('unit: Expected ticks, microseconds, milliseconds, seconds, minutes, hours or days.');return units[unit]!;}
function checkedTicks(ticks:bigint):string{if(ticks< -9223372036854775808n||ticks>9223372036854775807n)throw new Error('TimeSpan overflow.');return String(ticks);}
export function durationFromUnits(value:string,unit:string):string{
 const canonical=parseScalar('core.Decimal',value) as string,parts=canonical.split('.'),scale=10n**BigInt(parts[1]?.length??0);
 const numerator=BigInt(parts.join(''))*unitTicks(unit);
 if(numerator%scale!==0n)throw new Error('value: Duration must be an exact multiple of 100 ns.');
 return checkedTicks(numerator/scale);
}
const integer=port.scalar('core.Integer'),date=port.scalar('core.DateTimeOffset'),duration=port.scalar('core.TimeSpan'),decimal=port.scalar('core.Decimal');
const dateDescription='Arbeitet mit dem festen UTC-Offset des Werts. Keine implizite lokale Zeitzone oder Sommerzeitumstellung; Präzision 100 ns.';
function createDate(v:Record<string,number|undefined>):string{
 const ranges:Record<string,[number,number]>={year:[1,9999],month:[1,12],day:[1,31],hour:[0,23],minute:[0,59],second:[0,59],fractionTicks:[0,9999999],offsetMinutes:[-840,840]};
 for(const [name,[min,max]] of Object.entries(ranges)){const value=v[name]??0;if(!Number.isInteger(value)||value<min||value>max)throw new Error('Invalid date components: '+name);}
 const pad=(n:number,width=2)=>String(n).padStart(width,'0'),offset=v.offsetMinutes??0;
 const text=`${pad(v.year!,4)}-${pad(v.month!)}-${pad(v.day!)}T${pad(v.hour??0)}:${pad(v.minute??0)}:${pad(v.second??0)}.${pad(v.fractionTicks??0,7)}${offset<0?'-':'+'}${pad(Math.floor(Math.abs(offset)/60))}:${pad(Math.abs(offset)%60)}`;
 try{return parseScalar('core.DateTimeOffset',text) as string;}catch{throw new Error('Invalid date components.');}
}
export const temporalNodes:AuthoredNode[]=[
 defineNode({type:'Standard.Date.Create',version:1,label:'Create Date',category:'Date',description:dateDescription,inputs:{year:integer,month:integer,day:integer,hour:port.optional(integer),minute:port.optional(integer),second:port.optional(integer),fractionTicks:port.optional(integer),offsetMinutes:port.optional(integer)},outputs:{value:date},execute:v=>({value:createDate(v)})}),
 defineNode({type:'Standard.Date.Parts',version:1,label:'Date Parts',category:'Date',description:dateDescription+' Wochentag: Montag = 1, Sonntag = 7.',inputs:{value:date},outputs:{year:integer,month:integer,day:integer,hour:integer,minute:integer,second:integer,fractionTicks:integer,offsetMinutes:integer,dayOfWeek:integer},execute:({value})=>{
  const v=parseScalar('core.DateTimeOffset',value) as string;
  return {year:Number(v.slice(0,4)),month:Number(v.slice(5,7)),day:Number(v.slice(8,10)),hour:Number(v.slice(11,13)),minute:Number(v.slice(14,16)),second:Number(v.slice(17,19)),fractionTicks:Number(v.slice(20,27)),offsetMinutes:(Number(v.slice(28,30))*60+Number(v.slice(31,33)))*(v[27]==='-'?-1:1),dayOfWeek:(new Date(v.slice(0,10)+'T00:00:00Z').getUTCDay()+6)%7+1};
 }}),
 ...(['Day','Month'] as const).map(part=>defineNode({type:'Standard.Date.StartOf'+part,version:1,label:'Start of '+part,category:'Date',description:dateDescription,inputs:{value:date},outputs:{value:date},execute:({value})=>{const v=parseScalar('core.DateTimeOffset',value) as string;try{return {value:parseScalar('core.DateTimeOffset',(part==='Day'?v.slice(0,10):v.slice(0,8)+'01')+'T00:00:00.0000000'+v.slice(27)) as string};}catch{throw new Error('DateTimeOffset overflow.');}}})),
 defineNode({type:'Standard.Date.AddDays',version:1,label:'Add Days',category:'Date',description:dateDescription,inputs:{value:date,amount:integer},outputs:{value:date},execute:({value,amount})=>{try{return {value:dateTimeOffsetMath.add(value,checkedTicks(BigInt(amount)*units.days!))};}catch{throw new Error('DateTimeOffset overflow.');}}}),
 defineNode({type:'Standard.TimeSpan.FromUnits',version:1,label:'Duration From Units',category:'Date/TimeSpan',description:'Einheiten: ticks, microseconds, milliseconds, seconds, minutes, hours, days. Erfordert ein exaktes Vielfaches von 100 ns.',inputs:{value:decimal,unit:port.string()},outputs:{value:duration},execute:({value,unit})=>({value:durationFromUnits(value,unit)})}),
 defineNode({type:'Standard.TimeSpan.TotalUnits',version:1,label:'Duration Total Units',category:'Date/TimeSpan',description:'Gesamtdauer als Decimal; Rundung wie Decimal-Division. Einheit: ticks, microseconds, milliseconds, seconds, minutes, hours oder days.',inputs:{value:duration,unit:port.string()},outputs:{value:decimal},execute:({value,unit})=>({value:decimalMath.divide(value,String(unitTicks(unit)))})}),
 defineNode({type:'Standard.Values.NewGuid',version:1,label:'New Guid',category:'Values',description:'Erzeugt bei jeder Ausführung eine neue zufällige Guid.',inputs:{},outputs:{value:port.scalar('core.Guid')},execute:()=>({value:crypto.randomUUID()})})
];
