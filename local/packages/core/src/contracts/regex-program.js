// Canonical simple case folding keeps UTF-16 width and therefore match indices.
function regexFoldText(text){return Array.from(text).map(function(c){return regexFold[c.codePointAt(0)]||c;}).join('');}
function normalizeRegexPattern(pattern,fold){
 var pos=0,result='',space='\\u{9}-\\u{d}\\u{20}\\u{a0}\\u{1680}\\u{2000}-\\u{200a}\\u{2028}\\u{2029}\\u{202f}\\u{205f}\\u{3000}\\u{feff}';
 function encoded(code){return '\\u{'+code.toString(16)+'}';}
 function folded(code){return fold&&regexFold[code]?regexFold[code].codePointAt(0):code;}
 function atom(inClass){
  var c=pattern[pos++];if(c!=='\\'){var cp=pattern.codePointAt(pos-1);if(cp>0xffff)pos++;return {code:cp};}
  var escape=pattern[pos++];
  if(/[dwsDWS]/.test(escape||''))return {set:escape};
  if((escape==='b'||escape==='B')&&!inClass)return {boundary:escape};
  var controls={n:10,r:13,t:9,f:12,v:11,b:8,'0':0};if(Object.prototype.hasOwnProperty.call(controls,escape))return {code:controls[escape]};
  if(escape==='c'){var control=pattern[pos++];if(!/^[A-Za-z]$/.test(control||''))throw new Error('pattern: Invalid control escape.');return {code:control.toUpperCase().charCodeAt(0)%32};}
  if(escape==='u'||escape==='x'){
   var hex;if(escape==='u'&&pattern[pos]==='{'){var end=pattern.indexOf('}',++pos);if(end<0)throw new Error('pattern: Invalid Unicode escape.');hex=pattern.slice(pos,end);pos=end+1;}
   else{var length=escape==='x'?2:4;hex=pattern.slice(pos,pos+length);pos+=length;if(hex.length!==length)throw new Error('pattern: Invalid character escape.');}
   if(!/^[0-9a-fA-F]+$/.test(hex)||parseInt(hex,16)>0x10ffff)throw new Error('pattern: Invalid character escape.');
   var cp=parseInt(hex,16);
   if(cp>=0xd800&&cp<=0xdbff&&/^\\u[dD][c-fC-F][0-9a-fA-F]{2}/.test(pattern.slice(pos))){var low=parseInt(pattern.slice(pos+2,pos+6),16);pos+=6;cp=0x10000+(cp-0xd800)*1024+low-0xdc00;}
   return {code:cp};
  }
  if(!escape||!'^$\\.*+?()[]{}|/-'.includes(escape))throw new Error('pattern: Unsupported escape.');return {code:escape.charCodeAt(0)};
 }
 function setBody(name){return name.toLowerCase()==='d'?'0-9':name.toLowerCase()==='w'?'A-Za-z0-9_':space;}
 function range(a,b){
  if(a>b)throw new Error('pattern: Invalid character range.');
  var text=encoded(a)+(a===b?'':'-'+encoded(b));
  if(fold)for(var code in regexFold){var n=Number(code);if(n>=a&&n<=b)text+=encoded(regexFold[code].codePointAt(0));}
  return text;
 }
 while(pos<pattern.length){
  var c=pattern[pos];
  if(c==='['){
   pos++;var negative=pattern[pos]==='^';if(negative)pos++;
   var terms=[],body='';
   while(pos<pattern.length&&pattern[pos]!==']'){
    var left=atom(true);
    if(left.set){if(pattern[pos]==='-'&&pattern[pos+1]!==']')throw new Error('pattern: Invalid character range.');if(left.set===left.set.toUpperCase())terms.push('[^'+setBody(left.set)+']');else body+=setBody(left.set);continue;}
    if(pattern[pos]==='-'&&pattern[pos+1]!==']'&&pos+1<pattern.length){pos++;var right=atom(true);if(right.code===undefined)throw new Error('pattern: Invalid character range.');body+=range(left.code,right.code);}
    else body+=range(left.code,left.code);
   }
   if(pattern[pos++]!==']')throw new Error('pattern: Unclosed character class.');
   if(body)terms.push('['+body+']');
   if(!terms.length)result+=negative?'[\\s\\S]':'(?!)';
   else result+=negative?'(?:(?!'+terms.join('|')+')[\\s\\S])':'(?:'+terms.join('|')+')';
   continue;
  }
  if(c==='('&&pattern[pos+1]==='?'){result+=pattern.slice(pos,pos+3);pos+=3;continue;}
  if(c==='{'){
   var end=pattern.indexOf('}',pos),quantifier=pattern.slice(pos+1,end);
   if(end<0||!/^\d+(?:,\d*)?$/.test(quantifier))throw new Error('pattern: Invalid quantifier.');
   if(quantifier.split(',').some(function(n){return n!==''&&Number(n)>100000;}))throw new Error('pattern: Quantifier limit is 100000.');
   result+=pattern.slice(pos,end+1);pos=end+1;continue;
  }
  if('^$.*+?()|'.includes(c)){result+=c;pos++;continue;}
  if(c===']'||c==='}')throw new Error('pattern: Unexpected closing delimiter.');
  var value=atom(false);
  if(value.set)result+='['+(value.set===value.set.toUpperCase()?'^':'')+setBody(value.set)+']';
  else if(value.boundary){var word='[A-Za-z0-9_]',boundary='(?:(?<!'+word+')(?='+word+')|(?<='+word+')(?!'+word+'))';result+=value.boundary==='b'?boundary:'(?!'+boundary+')';}
  else result+=encoded(folded(value.code));
 }
 return result;
}
function runRegex(requestText) {
 var r=JSON.parse(requestText),value=r.value,pattern=r.pattern,flags=r.flags||'',operation=r.operation;
 if(value.length>1048576)throw new Error('value: Regex text limit is 1,048,576 characters.');
 if(pattern.length>4096)throw new Error('pattern: Regex pattern limit is 4096 characters.');
 if(!/^[ims]*$/.test(flags)||new Set(flags).size!==flags.length)throw new Error('flags: Only distinct i, m and s flags are supported; Unicode mode is always enabled.');
 function valid(text){for(var i=0;i<text.length;i++){var c=text.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){var next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw new Error('value: Invalid Unicode surrogate.');}else if(c>=0xdc00&&c<=0xdfff)throw new Error('value: Invalid Unicode surrogate.');}}
 valid(value);valid(pattern);
 // Portable subset: ordinal captures, no backreferences/named groups/lookbehind,
 // and no repetition of groups containing captures (CLR retains old captures).
 var stack=[],inClass=false;
 for(var pos=0;pos<pattern.length;pos++){
  var token=pattern[pos];
  if(token==='\\'){
   var escape=pattern[++pos];
   if(!inClass&&(/[1-9]/.test(escape||'')||escape==='k')||escape==='p'||escape==='P')throw new Error('pattern: Backreferences and Unicode property escapes are not supported.');
   continue;
  }
  if(token==='['&&!inClass){inClass=true;continue;}if(token===']'&&inClass){inClass=false;continue;}if(inClass)continue;
  if(token==='('){
   if(pattern[pos+1]==='?'&&![':', '=', '!'].includes(pattern[pos+2]))throw new Error('pattern: Only captures, noncapturing groups and lookahead are supported.');
   var captures=pattern[pos+1]!=='?';if(captures)for(var n=0;n<stack.length;n++)stack[n].captures=true;
   stack.push({captures:captures});
  }
  if(token===')'&&stack.length){var group=stack.pop();if(group.captures&&/[+*{]/.test(pattern[pos+1]||''))throw new Error('pattern: Repeated groups containing captures are not supported; place the repetition inside the capture.');}
 }

 var fold=flags.includes('i'),search=fold?regexFoldText(value):value;
 var regex=new RegExp(normalizeRegexPattern(pattern,fold),flags.replace('i','')+'dgu');
 if(operation==='test')return JSON.stringify({value:regex.test(search)});
 var results=[],parts=[],size=0,previous=0,count=0,match,pointIndex=0,pointEnd=0,resultSize=0;
 function append(text){size+=text.length;if(size>1048576)throw new Error('replacement: Regex output limit exceeded.');parts.push(text);}
 function points(text){return Array.from(text).length;}
 function replacement(text,match){
  var tokens=/\$(\$|&|[1-9][0-9]?)/g,token,start=0;
  while((token=tokens.exec(text))!==null){
   append(text.slice(start,token.index));var part=token[1],index=Number(part),result=token[0];
   if(part==='$')result='$';else if(part==='&')result=match[0];
   else if(index<match.length)result=match[index]===undefined?'':match[index];
   else if(part.length===2&&Number(part[0])<match.length)result=(match[Number(part[0])]||'')+part[1];
   append(result);start=token.index+token[0].length;
  }
  append(text.slice(start));
 }
 if(operation==='replace'){
  valid(r.replacement);if(r.replacement.length>1048576)throw new Error('replacement: Regex replacement limit exceeded.');
  var unsupported=/\$\$|\$[<>`']/g,part;while((part=unsupported.exec(r.replacement))!==null)if(part[0]!=='$$')throw new Error('replacement: Use $$, $&, or numbered $1–$99 captures.');
 }
 while((match=regex.exec(search))!==null){
  if(!match.indices&&match.length===1)match.indices=[[match.index,match.index+match[0].length]];
  for(var group=0;group<match.length;group++)match[group]=match.indices[group]?value.slice(match.indices[group][0],match.indices[group][1]):undefined;
  if(++count>10000)throw new Error('pattern: Regex match limit is 10000.');
  if(operation==='extract'){
   pointIndex+=points(value.slice(pointEnd,match.index));var length=points(match[0]);
   var item={value:match[0],index:pointIndex,length:length,groups:match.slice(1).map(function(v){return v===undefined?null:v;})};
   resultSize+=JSON.stringify(item).length+1;if(resultSize>4194200)throw new Error('pattern: Regex result limit exceeded.');
   results.push(item);pointIndex+=length;pointEnd=match.index+match[0].length;
  }
  else if(operation==='replace'){append(value.slice(previous,match.index));replacement(r.replacement,match);previous=match.index+match[0].length;}
  else throw new Error('Unknown regex operation.');
  if(match[0].length===0){if(regex.lastIndex>=value.length)break;regex.lastIndex+=value.codePointAt(regex.lastIndex)>0xffff?2:1;}
 }
 if(operation==='replace'){append(value.slice(previous));return JSON.stringify({value:parts.join('')});}
 var encoded=JSON.stringify({value:results});if(encoded.length>4194304)throw new Error('pattern: Regex result limit exceeded.');return encoded;
}
