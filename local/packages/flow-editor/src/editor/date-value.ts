import {parseScalar} from '@adam-flow/core/flow-core/scalars.js';
export interface DateParts {date:string;time:string;offset:string}
export function dateParts(value:unknown):DateParts {
  const match=typeof value==='string'?/^([^T]*)T(.*?)(Z|[+-][^+-]*)$/.exec(value):null;
  return match?{date:match[1]!,time:match[2]!,offset:match[3]==='Z'?'+00:00':match[3]!}:{date:'',time:'00:00:00.0000000',offset:'+00:00'};
}
export function dateValue(parts:DateParts):string {
  const text=`${parts.date}T${parts.time}${parts.offset}`;
  try{return parseScalar('core.DateTimeOffset',text) as string;}catch{return text;}
}
