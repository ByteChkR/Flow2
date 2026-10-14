import {temporalNodes} from './temporal.js';
import {defineNode,port,type AuthoredNode} from '../runtime-browser/authoring.js';
import {decimalMath,integerMath,parseScalar} from '@adam-flow/core/flow-core/index.js';

/** Calendar arithmetic preserves all seven fractional digits and the original offset. */
export function addCalendar(value:string,amount:number,unit:'Months'|'Years'):string {
  const canonical=parseScalar('core.DateTimeOffset',value) as string;
  parseScalar('core.Integer',amount);
  const year=Number(canonical.slice(0,4)),month=Number(canonical.slice(5,7)),day=Number(canonical.slice(8,10));
  const delta=unit==='Years'?amount*12:amount;
  if(unit==='Years'&&(amount< -10000||amount>10000)||unit==='Months'&&(amount< -120000||amount>120000))throw new RangeError('Calendar offset out of range.');
  const total=(year-1)*12+month-1+delta;
  if(total<0||total>=9999*12)throw new RangeError('Date out of range.');
  const y=Math.floor(total/12)+1,m=total%12+1,leap=y%4===0&&(y%100!==0||y%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return parseScalar('core.DateTimeOffset',`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(Math.min(day,days[m-1]!)).padStart(2,'0')}${canonical.slice(10)}`) as string;
}
export const extendedScalarNodes:AuthoredNode[]=[...temporalNodes];
function numbers<T extends number|string>(kind:'integer'|'decimal',math:{min(a:T,b:T):T;max(a:T,b:T):T;modulo(a:T,b:T):T;pow(a:T,b:number):T;clamp(a:T,b:T,c:T):T},abs:(v:T)=>T){
  const number=port.scalar(kind==='integer'?'core.Integer':'core.Decimal');
  const add=(op:string,label:string,inputs:any,run:(v:any)=>T,description:string)=>extendedScalarNodes.push(defineNode({
    type:`Standard.Math.${kind==='integer'?'Integer':'Decimal'}.${op[0]!.toUpperCase()+op.slice(1)}`,version:1,label:`${label} (${kind})`,description,category:'Math',inputs,outputs:{value:number},execute:values=>({value:run(values)})}));
  add('abs','Abs',{value:number},v=>abs(v.value),'Absolutwert berechnen. Ein Überlauf bricht die Ausführung ab.');
  add('min','Min',{left:number,right:number},v=>math.min(v.left,v.right),'Minimum zweier Werte.');
  add('max','Max',{left:number,right:number},v=>math.max(v.left,v.right),'Maximum zweier Werte.');
  add('modulo','Modulo',{left:number,right:number},v=>math.modulo(v.left,v.right),'Divisionsrest mit Vorzeichen des linken Werts. Der Divisor darf nicht null sein.');
  add('power','Power',{value:number,exponent:port.scalar('core.Integer')},v=>math.pow(v.value,v.exponent),kind==='integer'?'Potenz mit nichtnegativem Integer-Exponenten und Überlaufprüfung.':'Potenz mit Integer-Exponent. Negative Exponenten berechnen zuerst den Kehrwert.');
  add('clamp','Clamp',{value:number,min:number,max:number},v=>math.clamp(v.value,v.min,v.max),'Begrenzt den Wert auf min bis max. min darf max nicht überschreiten.');
}
numbers('integer',integerMath,v=>parseScalar('core.Integer',Math.abs(v)) as number);
numbers('decimal',decimalMath,v=>(parseScalar('core.Decimal',v) as string).replace(/^-/,'') );
for(const unit of ['Months','Years'] as const)extendedScalarNodes.push(defineNode({
  type:`Standard.Date.Add${unit}`,version:1,label:`Add ${unit}`,category:'Date',description:'Verschiebt ein Datum um Kalendermonate oder -jahre. Kürzt den Tag bei kürzeren Monaten und erhält Uhrzeit, Präzision und UTC-Offset.',
  inputs:{value:port.scalar('core.DateTimeOffset'),amount:port.scalar('core.Integer')},outputs:{value:port.scalar('core.DateTimeOffset')},execute:({value,amount})=>({value:addCalendar(value,amount,unit)})}));
