import type {TypeRef} from './model.js';
import {canonicalJson} from './transport.js';

/** The same port contracts are used by inference and the expression editor. */
export const stringExpressions={
  stringIsNullOrEmpty:{label:'Ist null oder leer',inputs:['value'],description:'Prüft auf null oder einen leeren Text.'},
  stringIsNullOrWhiteSpace:{label:'Ist null, leer oder Leerraum',inputs:['value'],description:'Prüft auf null, leeren Text oder ausschließlich Leerraum. Auch Tabs, Zeilenumbrüche und Unicode-Leerraum werden berücksichtigt.'},
  stringContains:{label:'Text enthält',inputs:['value','search'],description:'Prüft auf einen Teiltext. Ein fehlender Ausgangstext ergibt false.'},
  stringStartsWith:{label:'Text beginnt mit',inputs:['value','search'],description:'Prüft den Textanfang. Ein fehlender Ausgangstext ergibt false.'},
  stringEndsWith:{label:'Text endet mit',inputs:['value','search'],description:'Prüft das Textende. Ein fehlender Ausgangstext ergibt false.'},
  coalesce:{label:'Ersatzwert bei null (??)',inputs:['value','fallback'],description:'Liefert bei null den Ersatzwert. Unterstützt auch andere Typen; der Ersatz wird nur bei Bedarf ausgewertet.'},
  stringLength:{label:'Textlänge',inputs:['value'],description:'Liefert die Textlänge, bei null ebenfalls null.'},
  stringTrim:{label:'Leerraum entfernen',inputs:['value'],description:'Entfernt Leerraum an beiden Enden. Einschließlich Tabs, Zeilenumbrüchen und Unicode-Leerraum.'},
  stringToLower:{label:'In Kleinbuchstaben',inputs:['value'],description:'Wandelt Text nach den Regeln des Datenbankproviders um.'},
  stringToUpper:{label:'In Großbuchstaben',inputs:['value'],description:'Wandelt Text nach den Regeln des Datenbankproviders um.'},
  stringReplace:{label:'Text ersetzen',inputs:['value','search','replacement'],description:'Ersetzt einen Teiltext. Ein leerer Suchtext lässt den Text unverändert.'},
  stringSubstring:{label:'Teiltext',inputs:['value','start','length'],description:'Teiltext mit Startindex ab 0 und Länge. Indizes müssen innerhalb des Textes liegen.'},
  stringConcat:{label:'Texte verbinden',inputs:['left','right'],description:'Verbindet zwei Texte. Ist einer null, ist das Ergebnis null; für leeren Ersatz vorher ?? verwenden.'},
  stringDefaultIfEmpty:{label:'Ersatzwert bei leerem Text',inputs:['value','fallback'],description:'Verwendet den Ersatzwert bei null oder leerem Text.'},
  stringDefaultIfWhiteSpace:{label:'Ersatzwert bei Leerraum',inputs:['value','fallback'],description:'Verwendet den Ersatzwert bei null, leerem Text oder ausschließlich Leerraum.'},
  stringIndexOf:{label:'Textposition suchen',inputs:['value','search'],description:'Liefert den Index ab 0 oder -1, wenn der Text nicht enthalten ist. Bei null: null.'},
  stringTrimStart:{label:'Leerraum am Anfang entfernen',inputs:['value'],description:'Entfernt führenden Leerraum einschließlich Tabs, Zeilenumbrüchen und Unicode-Leerraum.'},
  stringTrimEnd:{label:'Leerraum am Ende entfernen',inputs:['value'],description:'Entfernt abschließenden Leerraum einschließlich Tabs, Zeilenumbrüchen und Unicode-Leerraum.'},
  stringLike:{label:'LIKE-Muster prüfen',inputs:['value','pattern'],description:'Datenbankmuster: % für beliebig viele Zeichen, _ für ein Zeichen. Groß-/Kleinschreibung folgt der Datenbank. Nur für Datenbankabfragen.'},
} as const;
export type StringExpressionOperation=keyof typeof stringExpressions;
export function isStringExpression(operation:string):operation is StringExpressionOperation {return Object.hasOwn(stringExpressions,operation);}
export function stringExpressionType(operation:StringExpressionOperation,input:(name:string)=>TypeRef):TypeRef {
  const eq=(a:TypeRef,b:TypeRef)=>canonicalJson(a)===canonicalJson(b);
  if(operation==='coalesce'){
    const value=input('value'),fallback=input('fallback');
    if(value.kind!=='nullable'||!eq(value.inner,fallback)&&!eq(value,fallback))throw new Error('?? benötigt Nullable<T> und einen Ersatzwert vom Typ T oder Nullable<T>.');
    return fallback;
  }
  const text=(name:string,nullable=false)=>{const type=input(name);if(type.kind!=='string'&&!(nullable&&type.kind==='nullable'&&type.inner.kind==='string'))throw new Error(`${name}: Text${nullable?' (ggf. nullable)':''} erforderlich.`);return type;};
  let absent=false;
  if(operation==='stringConcat'){absent=[text('left',true),text('right',true)].some(t=>t.kind==='nullable');}
  else absent=text('value',true).kind==='nullable';
  for(const port of stringExpressions[operation].inputs){
    if(['search','replacement','fallback','pattern'].includes(port))text(port);
    if(['start','length'].includes(port)&&!eq(input(port),{kind:'scalar',name:'core.Integer'}))throw new Error(`${port}: Integer erforderlich.`);
  }
  if(['stringIsNullOrEmpty','stringIsNullOrWhiteSpace','stringContains','stringStartsWith','stringEndsWith','stringLike'].includes(operation))return {kind:'scalar',name:'core.Bool'};
  if(['stringDefaultIfEmpty','stringDefaultIfWhiteSpace'].includes(operation))return {kind:'string'};
  const result:TypeRef=['stringLength','stringIndexOf'].includes(operation)?{kind:'scalar',name:'core.Integer'}:{kind:'string'};
  return absent?{kind:'nullable',inner:result}:result;
}
