import {parseScalar} from './scalars.js';

const maximum=79228162514264337593543950335n;
const power=(scale:number)=>10n**BigInt(scale);
function parts(value:string):{coefficient:bigint;scale:number}{
  const text=parseScalar('core.Decimal',value) as string;
  const [whole,fraction='']=text.split('.');
  return {coefficient:BigInt(whole!+fraction),scale:fraction.length};
}
function format(coefficient:bigint,scale:number):string {
  const negative=coefficient<0n,absolute=negative?-coefficient:coefficient;
  const digits=String(absolute).padStart(scale+1,'0');
  return parseScalar('core.Decimal',(negative?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits)) as string;
}
function rounded(numerator:bigint,denominator:bigint,mode:'toEven'|'awayFromZero'='toEven'):bigint {
  if(denominator===0n)throw new RangeError('Division by zero.');
  const negative=(numerator<0n)!==(denominator<0n);
  const n=numerator<0n?-numerator:numerator,d=denominator<0n?-denominator:denominator;
  let quotient=n/d;const remainder=n%d;
  if(remainder*2n>d||(remainder*2n===d&&(mode==='awayFromZero'||quotient%2n!==0n)))quotient++;
  return negative?-quotient:quotient;
}
/** Reduce precision only when required by the 96-bit coefficient or maximum scale.
 * Every attempt rounds from the original rational value, avoiding double rounding. */
function fit(numerator:bigint,denominator:bigint,preferredScale:number):string {
  for(let scale=Math.min(28,preferredScale);scale>=0;scale--){
    const coefficient=rounded(numerator*power(scale),denominator);
    if(coefficient>=-maximum&&coefficient<=maximum)return format(coefficient,scale);
  }
  throw new RangeError('Decimal overflow.');
}
function aligned(a:string,b:string){
  const left=parts(a),right=parts(b),scale=Math.max(left.scale,right.scale);
  return {a:left.coefficient*power(scale-left.scale),b:right.coefficient*power(scale-right.scale),scale};
}
function int(value:number):bigint{return BigInt(parseScalar('core.Integer',value) as number);}
function checked(value:bigint):number {
  if(value< -2147483648n||value>2147483647n)throw new RangeError('Integer overflow.');
  return Number(value);
}
export const decimalMath={
  add(a:string,b:string):string{const v=aligned(a,b);return fit(v.a+v.b,power(v.scale),v.scale);},
  subtract(a:string,b:string):string{const v=aligned(a,b);return fit(v.a-v.b,power(v.scale),v.scale);},
  multiply(a:string,b:string):string{const x=parts(a),y=parts(b);return fit(x.coefficient*y.coefficient,power(x.scale+y.scale),x.scale+y.scale);},
  divide(a:string,b:string):string{const x=parts(a),y=parts(b);return fit(x.coefficient*power(y.scale),y.coefficient*power(x.scale),28);},
  modulo(a:string,b:string):string{const v=aligned(a,b);if(v.b===0n)throw new RangeError('Division by zero.');return fit(v.a%v.b,power(v.scale),v.scale);},
  compare(a:string,b:string):number{const v=aligned(a,b);return v.a<v.b?-1:v.a>v.b?1:0;},
  round(value:string,digits:number,mode:'toEven'|'awayFromZero'='toEven'):string{
    if(!Number.isInteger(digits)||digits<0||digits>28||(mode!=='toEven'&&mode!=='awayFromZero'))throw new RangeError('Invalid decimal rounding parameters.');
    const v=parts(value);if(digits>=v.scale)return format(v.coefficient,v.scale);
    return format(rounded(v.coefficient,power(v.scale-digits),mode),digits);
  },
  toInt(value:string):number{const v=parts(value);return checked(v.coefficient/power(v.scale));},
  pow(value:string,exponent:number):string{
    let n=int(exponent),factor=parseScalar('core.Decimal',value) as string,result='1';
    if(n<0n){factor=decimalMath.divide('1',factor);n=-n;}
    while(n>0n){if(n%2n)result=decimalMath.multiply(result,factor);n/=2n;if(n>0n)factor=decimalMath.multiply(factor,factor);}
    return result;
  },
  min(a:string,b:string):string{return parseScalar('core.Decimal',decimalMath.compare(a,b)<=0?a:b) as string;},
  max(a:string,b:string):string{return parseScalar('core.Decimal',decimalMath.compare(a,b)>=0?a:b) as string;},
  clamp(value:string,min:string,max:string):string{
    if(decimalMath.compare(min,max)>0)throw new RangeError('Minimum exceeds maximum.');
    return decimalMath.min(decimalMath.max(value,min),max);
  },
};
export const integerMath={
  add:(a:number,b:number)=>checked(int(a)+int(b)),
  subtract:(a:number,b:number)=>checked(int(a)-int(b)),
  multiply:(a:number,b:number)=>checked(int(a)*int(b)),
  divide:(a:number,b:number)=>checked(int(a)/int(b)),
  modulo:(a:number,b:number)=>checked(int(a)%int(b)),
  compare:(a:number,b:number)=>{const x=int(a),y=int(b);return x<y?-1:x>y?1:0;},
  pow(value:number,exponent:number):number{
    let n=int(exponent),factor=int(value),result=1n;if(n<0n)throw new RangeError('Integer exponent must be non-negative.');
    while(n>0n){if(n%2n)result=BigInt(checked(result*factor));n/=2n;if(n>0n)factor=BigInt(checked(factor*factor));}
    return checked(result);
  },
  min:(a:number,b:number)=>checked(int(a)<int(b)?int(a):int(b)),
  max:(a:number,b:number)=>checked(int(a)>int(b)?int(a):int(b)),
  clamp(value:number,min:number,max:number):number{
    if(int(min)>int(max))throw new RangeError('Minimum exceeds maximum.');
    return integerMath.min(integerMath.max(value,min),max);
  },
};
