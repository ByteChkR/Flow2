const quote=value=>`„${value}“`;
const types={object:'Objekt',array:'Liste',string:'Text',number:'Zahl',integer:'ganze Zahl',boolean:'Boolean (true/false)',null:'null'};
const typeName=value=>String(value).split(',').map(type=>types[type]??type).join(' oder ');

export function diagnosticMessage(error,schemaId){
 const p=error.params??{};
 switch(error.keyword){
  case 'additionalProperties':
  case 'unevaluatedProperties':{
   const property=p.additionalProperty??p.unevaluatedProperty;
   const location=error.instancePath?`im Objekt ${quote(error.instancePath)}`:'auf der obersten Ebene';
   let message=`Das Feld ${quote(property)} ist ${location} nicht erlaubt.`;
   if(property==='path'&&error.instancePath===''&&schemaId==='https://app.adam-crm.de/schemas/2.0/ui/Details/Options.json'){
    message+=' Der Uploadpfad gehört nach „dropZoneConfig.path“. Entferne das zusätzliche „path“ auf der obersten Ebene.';
   }else message+=' Prüfe den Feldnamen und ob das Feld an die richtige Stelle gesetzt wurde.';
   return message;
  }
  case 'required':return `Das Pflichtfeld ${quote(p.missingProperty)} fehlt.`;
  case 'type':return `Falscher Werttyp. Erwartet: ${typeName(p.type)}.`;
  case 'enum':return `Dieser Wert ist nicht erlaubt. Erlaubte Werte: ${p.allowedValues.map(value=>JSON.stringify(value)).join(', ')}.`;
  case 'const':return `Hier ist ausschließlich ${JSON.stringify(p.allowedValue)} erlaubt.`;
  case 'format':return `Der Wert muss dem Format ${quote(p.format)} entsprechen.`;
  case 'pattern':return `Der Text entspricht nicht dem vorgeschriebenen Muster: ${p.pattern}.`;
  case 'minLength':return `Der Text muss mindestens ${p.limit} Zeichen enthalten.`;
  case 'maxLength':return `Der Text darf höchstens ${p.limit} Zeichen enthalten.`;
  case 'minimum':return `Die Zahl muss mindestens ${p.limit} sein.`;
  case 'maximum':return `Die Zahl darf höchstens ${p.limit} sein.`;
  case 'exclusiveMinimum':return `Die Zahl muss größer als ${p.limit} sein.`;
  case 'exclusiveMaximum':return `Die Zahl muss kleiner als ${p.limit} sein.`;
  case 'multipleOf':return `Die Zahl muss ein Vielfaches von ${p.multipleOf} sein.`;
  case 'minItems':return `Die Liste muss mindestens ${p.limit} Einträge enthalten.`;
  case 'maxItems':return `Die Liste darf höchstens ${p.limit} Einträge enthalten.`;
  case 'uniqueItems':return 'Die Liste darf keine doppelten Einträge enthalten.';
  case 'minProperties':return `Das Objekt muss mindestens ${p.limit} Felder enthalten.`;
  case 'maxProperties':return `Das Objekt darf höchstens ${p.limit} Felder enthalten.`;
  case 'discriminator':return p.error==='mapping'
   ?`Unbekannte Variante ${quote(p.tagValue)} im Feld ${quote(p.tag)}. Wähle eine unterstützte Variante.`
   :`Das Feld ${quote(p.tag)} muss die Variante als Text angeben.`;
  case 'anyOf':return 'Der Wert entspricht keiner der erlaubten Varianten. Beachte die zugehörigen Detailfehler.';
  case 'oneOf':return 'Der Wert muss genau einer erlaubten Variante entsprechen. Beachte die zugehörigen Detailfehler.';
  case 'if':return 'Eine bedingte Vorgabe ist nicht erfüllt. Beachte die zugehörigen Detailfehler.';
  case 'not':return 'Diese Kombination von Werten ist nicht erlaubt.';
  case 'dependentRequired':return `Wenn ${quote(p.property)} gesetzt ist, wird auch ${quote(p.missingProperty)} benötigt.`;
  default:return `Der Wert erfüllt die Schema-Vorgabe ${quote(error.keyword)} nicht.`;
 }
}
