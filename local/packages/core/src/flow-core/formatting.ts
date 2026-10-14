import {parseScalar} from './scalars.js';
export function formattingLanguage(language:string):string{
  if(language==='de'||language==='de-DE')return 'de-DE';
  if(language==='en'||language==='en-US')return 'en-US';
  if(language==='en-GB')return language;
  if(language==='fr'||language==='fr-FR')return 'fr-FR';
  throw new Error('Unsupported language. Use de-DE, en-US, en-GB or fr-FR.');
}
export function formatValue(kind:string,value:unknown,format:string,language:string):string{
  const locale=formattingLanguage(language),decimal=locale==='de-DE'||locale==='fr-FR'?',':'.',group=locale==='de-DE'?'.':locale==='fr-FR'?'\u202f':',';
  if(kind==='integer'||kind==='decimal'){
    const source=String(parseScalar(kind==='integer'?'core.Integer':'core.Decimal',value));
    if(format==='G')return source.replace('.',decimal);
    if(!/^[FNP](?:[0-9]|1[0-9]|2[0-8])?$/.test(format))throw new Error('Numeric format must be G, F, N or P with 0–28 decimal places.');
    const digits=format.length===1?2:Number(format.slice(1));
    const negative=source.startsWith('-'),[whole,fraction='']=source.replace(/^-/,'').split('.');
    let coefficient=BigInt(whole!+fraction),scale=fraction.length-(format[0]==='P'?2:0);
    if(scale>digits){const divisor=10n**BigInt(scale-digits),remainder=coefficient%divisor;coefficient/=divisor;if(remainder*2n>=divisor)coefficient++;}
    else coefficient*=10n**BigInt(digits-scale);
    const padded=String(coefficient).padStart(digits+1,'0');let integral=digits?padded.slice(0,-digits):padded;
    if(format[0]!=='F')integral=integral.replace(/\B(?=(\d{3})+(?!\d))/g,group);
    return (negative&&coefficient!==0n?'-':'')+integral+(digits?decimal+padded.slice(-digits):'')+(format[0]==='P'?(locale==='de-DE'||locale==='fr-FR'?' %':'%'):'');
  }
  if(kind==='string'||kind==='bool'){
    if(format!=='G')throw new Error('Text and Bool support G only.');return String(value);
  }
  if(kind==='guid'){
    if(!['D','N','B','P'].includes(format))throw new Error('Guid format must be D, N, B or P.');
    const guid=parseScalar('core.Guid',value) as string;
    return format==='N'?guid.replaceAll('-',''):format==='B'?`{${guid}}`:format==='P'?`(${guid})`:guid;
  }
  if(kind==='timespan'){
    const source=parseScalar('core.TimeSpan',value) as string;
    if(format==='ticks')return source;
    if(!['c','g','G'].includes(format))throw new Error('TimeSpan format must be c, g, G or ticks.');
    let ticks=BigInt(source),sign=ticks<0n?'-':'';if(ticks<0n)ticks=-ticks;
    const fraction=String(ticks%10000000n).padStart(7,'0');let seconds=ticks/10000000n;
    const s=String(seconds%60n).padStart(2,'0');seconds/=60n;
    const m=String(seconds%60n).padStart(2,'0');seconds/=60n;
    const h=String(seconds%24n),days=seconds/24n;
    if(format==='c')return sign+(days?`${days}.`:'')+h.padStart(2,'0')+':'+m+':'+s+(fraction==='0000000'?'':'.'+fraction);
    if(format==='G')return sign+days+':'+h.padStart(2,'0')+':'+m+':'+s+decimal+fraction;
    return sign+(days?`${days}:`:'')+h+':'+m+':'+s+(fraction==='0000000'?'':decimal+fraction.replace(/0+$/,''));
  }
  if(kind==='datetimeoffset'){
    const source=parseScalar('core.DateTimeOffset',value) as string;
    if(format==='O')return source;
    const day=locale==='de-DE'?'dd.MM.yyyy':locale==='en-US'?'MM/dd/yyyy':'dd/MM/yyyy';
    const standards:Record<string,string>={d:day,t:'HH:mm',T:'HH:mm:ss',g:day+' HH:mm',G:day+' HH:mm:ss'};format=standards[format]??format;
    const tokens:Record<string,string>={yyyy:source.slice(0,4),MM:source.slice(5,7),dd:source.slice(8,10),HH:source.slice(11,13),mm:source.slice(14,16),ss:source.slice(17,19),zzz:source.slice(-6)};
    let result='';if(!format)throw new Error('Format cannot be empty.');
    for(let i=0;i<format.length;){
      if(format[i]==="'"){const end=format.indexOf("'",i+1);if(end<0)throw new Error('Unterminated date literal.');result+=format.slice(i+1,end);i=end+1;continue;}
      const token=/^(yyyy|MM|dd|HH|mm|ss|f{1,7}|zzz)/.exec(format.slice(i))?.[0];
      if(token){result+=token[0]==='f'?source.slice(20,20+token.length):tokens[token];i+=token.length;continue;}
      if(/\p{L}/u.test(format[i]!))throw new Error('Unsupported date token; quote literal letters.');result+=format[i++];
    }
    return result;
  }
  throw new Error('Unsupported value type.');
}
export function formatText(template:string,args:string[]):string{
  let result='';
  for(let i=0;i<template.length;){
    const c=template[i++];
    if(c==='{'||c==='}'){
      if(template[i]===c){result+=c;i++;continue;}
      if(c==='}')throw new Error('Unmatched closing brace.');
      const end=template.indexOf('}',i),token=template.slice(i,end),index=Number(token);
      if(end<0||!/^\d+$/.test(token)||!Number.isSafeInteger(index)||index>=args.length)throw new Error('Invalid or missing format argument.');
      result+=args[index];i=end+1;
    }else result+=c;
  }
  return result;
}
