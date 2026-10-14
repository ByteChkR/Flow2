/** Hosts may assign accents to their provider IDs at application bootstrap. */
let colors:Readonly<Record<string,string>>={};
export function configureResourceColors(value:Readonly<Record<string,string>>){colors={...value};}
export function resourceColor(providerId?:string){return colors[providerId??'']??'var(--w-brand,#2563eb)';}
