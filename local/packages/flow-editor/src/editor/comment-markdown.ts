/** Small presentation-only Markdown subset. Text is rendered by Svelte, never as HTML. */
export interface InlineToken {kind:'text'|'strong'|'em'|'code'|'del';text:string;children?:InlineToken[]}
export function inlineMarkdown(text:string):InlineToken[]{
 const tokens:InlineToken[]=[],pattern=/(`+)([^`]+?)\1|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*([^*]+?)\*|_([^_]+?)_/g;
 let offset=0;
 for(const match of text.matchAll(pattern)){
  if(match.index!>offset)tokens.push({kind:'text',text:text.slice(offset,match.index)});
  const kind=match[1]?'code':match[3]||match[4]?'strong':match[5]?'del':'em';
  const value=match[2]??match[3]??match[4]??match[5]??match[6]??match[7]!;
  tokens.push({kind,text:value,...(kind==='code'?{}:{children:inlineMarkdown(value)})});offset=match.index!+match[0].length;
 }
 if(offset<text.length)tokens.push({kind:'text',text:text.slice(offset)});
 return tokens;
}
export interface MarkdownBlock {kind:'heading'|'paragraph'|'code'|'quote'|'list';text:string;level?:number;ordered?:boolean;start?:number;items?:string[]}
export function commentMarkdown(source:string):MarkdownBlock[]{
 const lines=source.replace(/\r\n?/g,'\n').split('\n'),blocks:MarkdownBlock[]=[];
 const list=(line:string)=>/^\s*(?:([-+*])|([0-9]+)[.)])\s+(.+)$/.exec(line);
 const special=(line:string)=>/^\s*$|^#{1,6}\s|^```|^>\s?/.test(line)||!!list(line);
 for(let i=0;i<lines.length;){
  const line=lines[i++]!;if(!line.trim())continue;
  if(/^```/.test(line)){const content=[];while(i<lines.length&&!/^```/.test(lines[i]!))content.push(lines[i++]!);if(i<lines.length)i++;blocks.push({kind:'code',text:content.join('\n')});continue;}
  const heading=/^(#{1,6})\s+(.*)$/.exec(line);
  if(heading){blocks.push({kind:'heading',level:heading[1]!.length,text:heading[2]!.replace(/\s+#+\s*$/,'')});continue;}
  const item=list(line);
  if(item){const ordered=!!item[2],items=[item[3]!];while(i<lines.length){const next=list(lines[i]!);if(!next||!!next[2]!==ordered)break;items.push(next[3]!);i++;}blocks.push({kind:'list',text:'',ordered,...(ordered?{start:Number(item[2])}:{}),items});continue;}
  if(/^>\s?/.test(line)){const content=[line.replace(/^>\s?/,'')];while(i<lines.length&&/^>\s?/.test(lines[i]!))content.push(lines[i++]!.replace(/^>\s?/,''));blocks.push({kind:'quote',text:content.join('\n')});continue;}
  const content=[line];while(i<lines.length&&!special(lines[i]!))content.push(lines[i++]!);blocks.push({kind:'paragraph',text:content.join('\n')});
 }
 return blocks;
}
