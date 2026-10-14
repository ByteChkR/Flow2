import {validateConfig} from '@adam-flow/core/flow-core/config.js';
import {inputFieldsType,resolveInputFields} from '../ui/input-fields.js';
import {options,validateOptions} from '../ui/step-values.js';
import {resolveColumns,validateSelection} from '../ui/table-model.js';
import type {ConfigField,FlowNode,NodeDefinition,TypeRef} from '@adam-flow/core/flow-core/model.js';
import type {NodeContext} from '../runtime-browser/index.js';
import {isTransportable} from '@adam-flow/core/flow-core/transport.js';
import {requirePage,type PagePanel} from '../ui/page-contract.js';
import type {FlowInteractionHost,Interaction} from '../ui/interactions.js';
import {validateButtons,normalizeIcon,type ChoiceButton,type DialogOptions} from '../ui/presentation.js';

const text:TypeRef={kind:'string'},bool:TypeRef={kind:'scalar',name:'core.Bool'},guid:TypeRef={kind:'scalar',name:'core.Guid'};
const optional=(inner:TypeRef):TypeRef=>({kind:'optional',inner});
export const dialogOptionsType:TypeRef={kind:'object',fields:{fullscreen:optional(bool),size:optional(text),allowCancel:optional(bool),cancelLabel:optional(text)}};
export const buttonType:TypeRef={kind:'object',fields:{id:text,label:text,icon:optional(text),disabled:optional(bool),visible:optional(bool)}};
export const buttonsType:TypeRef={kind:'array',items:buttonType};
export const tableColumnsType:TypeRef={kind:'array',items:{kind:'object',fields:{field:text,label:optional(text),readonly:optional(bool),required:optional(bool),width:optional({kind:'scalar',name:'core.Integer'})}}};
export const isTableStep=(type:string)=>type==='Frontend.UI.Table'||type==='Frontend.UI.EditTable';
export const optionType:TypeRef={kind:'object',fields:{id:text,label:text,description:optional(text),disabled:optional(bool),required:optional(bool)}};
export const fileType:TypeRef={kind:'object',fields:{name:text,mimeType:text,size:{kind:'scalar',name:'core.Integer'},content:text}};
export const stepNames={SelectOptions:'Optionen auswählen',SelectFiles:'Dateien auswählen',Signature:'Unterschrift erfassen',Checklist:'Checkliste bestätigen',Table:'Tabelle anzeigen',EditTable:'Tabelle bearbeiten',Message:'Hinweis anzeigen',Confirm:'Ja/Nein abfragen',ChooseAction:'Aktion auswählen',Input:'Werte eingeben',SelectRecord:'Datensatz auswählen',SelectRecords:'Datensätze auswählen',RecordDetails:'Datensatzmaske öffnen',Preview:'Vorschau anzeigen'};
export const isStep=(type:string)=>Object.keys(stepNames).some(name=>type===`Frontend.UI.${name}`);
const configText=(label:string,value:string,options?:string[]):ConfigField=>({type:'string',label,default:value,...(options?{options}:{})});
export function stepDefinition(node:FlowNode):NodeDefinition {
  if(!isStep(node.type)||node.environment!=='browser'||node.typeVersion!==1)throw new Error('Ungültiger Interaktionsschritt.');
  const operation=node.type.slice('Frontend.UI.'.length) as keyof typeof stepNames;
  const inputs:Record<string,TypeRef>={title:text,subtitle:optional(text),htmlContent:optional(text),icon:optional(text),dialogOptions:optional(dialogOptionsType)};
  const outputs:Record<string,TypeRef>={action:text,cancelled:bool};
  const config:Record<string,ConfigField>={display:configText('Darstellung','page',['page','dialog']),allowCancel:{type:'boolean',label:'Benutzerabbruch erlauben',default:true},dialogSize:configText('Dialoggröße','large',['small','medium','large']),fullscreen:{type:'boolean',label:'Dialog im Vollbild',default:false}};
  if(operation==='SelectOptions'||operation==='Checklist'){
    inputs.options={kind:'array',items:optionType};inputs.selected=optional({kind:'array',items:text});outputs.ids=optional({kind:'array',items:text});
    if(operation==='SelectOptions')config.multiple={type:'boolean',label:'Mehrfachauswahl',default:false};
    config.required={type:'boolean',label:'Auswahl erforderlich',default:true};
  }
  if(operation==='SelectFiles'){
    outputs.files=optional({kind:'array',items:fileType});config.accept=configText('Dateitypen (z. B. .pdf,image/*)','');
    config.maxFiles={type:'number',label:'Maximale Dateianzahl',default:1};config.maxBytes={type:'number',label:'Maximale Bytes pro Datei',default:10485760};
    config.required={type:'boolean',label:'Datei erforderlich',default:true};
  }
  if(operation==='Signature'){outputs.image=optional(text);config.required={type:'boolean',label:'Unterschrift erforderlich',default:true};}
  if(operation==='Confirm')outputs.confirmed=optional(bool);
  if(operation==='ChooseAction'||operation==='Preview'){
    inputs.buttons=operation==='ChooseAction'?buttonsType:optional(buttonsType);
  }
  if(operation==='Input'||isTableStep(node.type)){
    const data=node.ui?.dataType;
    if(!data||data.kind!=='object'||!isTransportable(data))throw new Error('Eingabe benötigt einen transportierbaren Record-Vertrag.');
    if(operation==='Input'){inputs.data=optional(data);inputs.fields=optional(inputFieldsType);outputs.data=optional(data);config.fields=configText('Felder','[]');}
    else {
      const rows:TypeRef={kind:'array',items:data},indices:TypeRef={kind:'array',items:{kind:'scalar',name:'core.Integer'}};
      inputs.rows=rows;inputs.columns=optional(tableColumnsType);inputs.buttons=buttonsType;outputs.rows=optional(rows);
      config.columns=configText('Spalten','[]');config.pageSize={type:'number',label:'Zeilen pro Seite',default:25};
      if(operation==='Table'){
        config.selection=configText('Zeilenauswahl','none',['none','single','multiple']);config.required={type:'boolean',label:'Auswahl erforderlich',default:false};
        inputs.selectedIndices=optional(indices);outputs.selectedIndices=optional(indices);outputs.selectedRows=optional(rows);
      }
    }
  }
  if(operation==='SelectRecord'||operation==='SelectRecords'){
    config.searchName=configText('Suchkonfiguration','');inputs.filter=optional(text);
    const multiple=operation==='SelectRecords',type:TypeRef=multiple?{kind:'array',items:guid}:guid;
    inputs.selected=optional(type);outputs[multiple?'ids':'id']=optional(type);
    config.required={type:'boolean',label:'Auswahl erforderlich',default:true};
  }
  if(operation==='RecordDetails'){
    config.detailsName=configText('Detail-/Teilmaske','');config.mode=configText('Modus','read',['read','edit','new']);
    inputs.id=optional(guid);outputs.id=optional(guid);
  }
  if(operation==='Preview'){inputs.content=text;inputs.subject=optional(text);config.format=configText('Format','html',['html','pdf','email','sms']);}
  for(const [key,field] of Object.entries(config))if(!inputs[key])inputs[key]=optional(field.type==='boolean'?bool:field.type==='number'?{kind:'scalar',name:'core.Integer'}:text);
  const labels:Record<string,string>={fields:'Feldkonfiguration',options:'Optionen / Prüfpunkte',files:'Dateien',image:'Unterschrift (PNG)',rows:'Zeilen',columns:'Spalten',selectedRows:'Ausgewählte Zeilen',selectedIndices:'Ausgewählte Zeilenindizes',title:'Titel',subtitle:'Untertitel',htmlContent:'HTML-Inhalt',icon:'Icon',dialogOptions:'Dialogoptionen',buttons:'Aktionsbuttons',data:'Daten',filter:'Filter',selected:'Vorauswahl',id:'Datensatz-ID',ids:'Datensatz-IDs',content:'Inhalt',subject:'Betreff',action:'Aktion',cancelled:'Abgebrochen',confirmed:'Bestätigt'};
  return {type:node.type,version:1,nodeId:node.id,environments:['browser'],inputs,outputs,config,control:{input:true,output:true,start:false},...(operation==='Input'||isTableStep(node.type)?{ui:structuredClone(node.ui)}:{}),metadata:{label:stepNames[operation],category:'Frontend/Prozessschritte',description:'Wartet auf die Abschlussaktion des Benutzers. Abbrechen liefert cancelled=true; ein Laufabbruch beendet die Ausführung.',inputs:Object.fromEntries(Object.keys(inputs).map(key=>[key,{label:labels[key]??config[key]?.label??key,...(key==='htmlContent'?{editor:{kind:'html' as const,editors:['monaco' as const,'tinymce' as const]}}:{})}])),outputs:Object.fromEntries(Object.keys(outputs).map(key=>[key,{label:labels[key]??key}]))}};
}
/** Only these nodes construct the presentation; authors configure ports and typed fields. */
export function stepInteraction(definition:NodeDefinition,inputs:Readonly<Record<string,unknown>>,config:Readonly<Record<string,unknown>>):Interaction {
  // Absent optional ports preserve config; false, zero and empty strings are explicit values.
  const overrides=Object.fromEntries(Object.keys(definition.config??{}).filter(key=>!['fields','columns'].includes(key)&&inputs[key]!==undefined).map(key=>[key,inputs[key]]));
  config={...config,...overrides};
  const errors=validateConfig(definition.config,config as Record<string,import('@adam-flow/core/flow-core/model.js').JsonValue>);
  if(errors.length)throw new Error(errors.map(error=>error.message).join(' '));
  const operation=definition.type.slice('Frontend.UI.'.length);
  const panels:PagePanel[]=[];
  if(inputs.icon)panels.push({type:'FlowImage',value:normalizeIcon(String(inputs.icon))});
  if(!String(inputs.title??'').trim())throw new Error('Ein Titel ist erforderlich.');
  if(inputs.title)panels.push({type:'FlowText',heading:1,text:String(inputs.title)});
  if(inputs.subtitle)panels.push({type:'FlowText',text:String(inputs.subtitle)});
  if(inputs.htmlContent)panels.push({type:'FlowText',text:String(inputs.htmlContent),html:true});
  let data:Record<string,unknown>={},dataType:TypeRef={kind:'object',fields:{}};
  let buttons:ChoiceButton[]=[{id:'continue',label:'Weiter'}];
  if(isTableStep(definition.type)){
    const rowType=definition.ui!.dataType,columns=resolveColumns(rowType,inputs.columns??JSON.parse(String(config.columns)));
    const rows=structuredClone(inputs.rows as Record<string,unknown>[]),indices=structuredClone((inputs.selectedIndices??[]) as number[]);
    const selection=operation==='Table'?String(config.selection) as 'none'|'single'|'multiple':'none';
    validateSelection(indices,rows.length,selection);
    const pageSize=Number(config.pageSize);if(!Number.isInteger(pageSize)||pageSize<1||pageSize>200)throw new Error('Zeilen pro Seite müssen zwischen 1 und 200 liegen.');
    dataType={kind:'object',fields:{rows:{kind:'array',items:rowType},selectedIndices:{kind:'array',items:{kind:'scalar',name:'core.Integer'}}}};data={rows,selectedIndices:indices};
    panels.push({type:'FlowTable',field:['rows'],selectionField:['selectedIndices'],columns,editable:operation==='EditTable',selection,required:config.required===true,pageSize});
    buttons=validateButtons(inputs.buttons as ChoiceButton[]);
  }
  if(operation==='SelectOptions'||operation==='Checklist'){
    const items=options(inputs.options),selected=structuredClone((inputs.selected??[]) as string[]),multiple=operation==='Checklist'||config.multiple===true;
    validateOptions(items,selected,multiple,false);
    dataType={kind:'object',fields:{ids:{kind:'array',items:text}}};data={ids:selected};
    panels.push({type:'FlowOptions',field:['ids'],options:items,multiple,required:config.required===true,checklist:operation==='Checklist'});
    buttons=[{id:'select',label:'Bestätigen'}];
  }
  if(operation==='SelectFiles'){
    const maxFiles=Number(config.maxFiles),maxBytes=Number(config.maxBytes);
    if(!Number.isSafeInteger(maxFiles)||maxFiles<1||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new Error('Dateigrenzen müssen positive ganze Zahlen sein.');
    dataType={kind:'object',fields:{files:{kind:'array',items:fileType}}};data={files:[]};
    panels.push({type:'FlowFiles',field:['files'],accept:String(config.accept??''),maxFiles,maxBytes,required:config.required===true});
  }
  if(operation==='Signature'){
    dataType={kind:'object',fields:{image:optional(text)}};
    panels.push({type:'FlowSignature',field:['image'],required:config.required===true});
    buttons=[{id:'sign',label:'Unterschrift übernehmen'}];
  }
  if(operation==='Confirm')buttons=[{id:'yes',label:'Ja'},{id:'no',label:'Nein'}];
  if(operation==='ChooseAction'||operation==='Preview')buttons=validateButtons((inputs.buttons??(operation==='Preview'?[{id:'continue',label:'Weiter'}]:[])) as ChoiceButton[]);
  if(operation==='Input'){
    dataType=definition.ui!.dataType;data=structuredClone((inputs.data??{}) as Record<string,unknown>);
    if(dataType.kind!=='object')throw new Error('Eingabe benötigt einen Record.');
    for(const {field,...options} of resolveInputFields(dataType,inputs.fields??JSON.parse(String(config.fields??'[]'))))panels.push({type:'FlowField',field:[field],...options});
    buttons=[{id:'submit',label:'Bestätigen'}];
  }
  if(operation==='SelectRecord'||operation==='SelectRecords'){
    if(!String(config.searchName??'').trim())throw new Error('Bitte eine Suchkonfiguration auswählen.');
    const multiple=operation==='SelectRecords',key=multiple?'ids':'id';
    dataType={kind:'object',fields:{[key]:multiple?{kind:'array',items:guid}:optional(guid)}};
    data=multiple?{ids:inputs.selected??[]}:inputs.selected?{id:inputs.selected}:{};
    panels.push({type:'FlowSearch',searchName:String(config.searchName),field:[key],multiple,required:config.required===true,...(inputs.filter?{customFilter:String(inputs.filter)}:{})});
    buttons=[{id:'select',label:'Auswahl bestätigen'}];
  }
  if(operation==='RecordDetails'){
    if(!String(config.detailsName??'').trim())throw new Error('Bitte eine Detail-/Teilmaske auswählen.');
    if(config.mode!=='new'&&!inputs.id)throw new Error('Zum Anzeigen oder Bearbeiten ist eine Datensatz-ID erforderlich.');
    dataType={kind:'object',fields:{id:guid}};data=inputs.id?{id:inputs.id}:{};
    panels.push({type:'FlowDetails',detailsName:String(config.detailsName),field:['id'],mode:String(config.mode),...(config.mode==='read'?{}:{action:'save'})});
    if(config.mode!=='read')buttons=[];
  }
  if(operation==='Preview')panels.push({type:'FlowTemplatePreview',templateType:String(config.format),data:String(inputs.content),...(inputs.subject?{subject:String(inputs.subject)}:{})});
  if(buttons.length)panels.push({type:'FlowActions',buttons});
  return {kind:config.display==='dialog'?'dialog':'page',page:requirePage({name:String(inputs.title??definition.metadata!.label),content:{panelColumns:'1fr',full:true,panels}}),dataType,data,dialogOptions:{allowCancel:config.allowCancel!==false,size:String(config.dialogSize),fullscreen:config.fullscreen===true,...Object.fromEntries(Object.entries(inputs.dialogOptions as DialogOptions??{}).filter(([,value])=>value!==undefined)),...(inputs.allowCancel!==undefined?{allowCancel:inputs.allowCancel===true}:{}),...(inputs.dialogSize!==undefined?{size:String(inputs.dialogSize)}:{}),...(inputs.fullscreen!==undefined?{fullscreen:inputs.fullscreen===true}:{})}};
}
export function stepImplementation(definition:NodeDefinition,host?:FlowInteractionHost){return {definition,execute:async(inputs:Readonly<Record<string,unknown>>,context:NodeContext)=>{
  if(!host)throw new Error('Flow-Interaktion ist nicht verfügbar.');
  const result=await host.request(context.nodeId,stepInteraction(definition,inputs,context.config),context.signal,context.onWait);
  const output:Record<string,unknown>={action:result.action,cancelled:result.cancelled};
  if(!result.cancelled){
    if(isTableStep(definition.type)){
      output.rows=result.data!.rows;
      if(definition.type==='Frontend.UI.Table'){const indices=result.data!.selectedIndices as number[];output.selectedIndices=indices;output.selectedRows=indices.map(index=>(result.data!.rows as unknown[])[index]);}
    }
    if(definition.type==='Frontend.UI.SelectOptions'||definition.type==='Frontend.UI.Checklist')output.ids=result.data!.ids;
    if(definition.type==='Frontend.UI.SelectFiles')output.files=result.data!.files;
    if(definition.type==='Frontend.UI.Signature'&&result.data?.image!==undefined)output.image=result.data.image;
    if(definition.type==='Frontend.UI.Confirm')output.confirmed=result.action==='yes';
    if(definition.type==='Frontend.UI.Input')output.data=result.data;
    if(definition.type==='Frontend.UI.SelectRecords')output.ids=result.data?.ids;
    if(definition.type==='Frontend.UI.SelectRecord'||definition.type==='Frontend.UI.RecordDetails')if(result.data?.id!==undefined)output.id=result.data.id;
  }
  return output;
}};}
export function stepNodes(host?:FlowInteractionHost){return Object.keys(stepNames).map(name=>{
  const {nodeId,...definition}=stepDefinition({id:'prototype',type:`Frontend.UI.${name}`,typeVersion:1,environment:'browser',config:{},...(['Input','Table','EditTable'].includes(name)?{ui:{dataType:{kind:'object' as const,fields:{value:text}}}}:{})});
  return stepImplementation(definition,host);
});}

/** Buttons are data: their values and the final list can be assembled by any flow. */
export const buttonNode={
  definition:{type:'Frontend.UI.Button',version:1,environments:['browser'],inputs:{id:text,label:text,icon:optional(text),disabled:optional(bool),visible:optional(bool)},outputs:{value:buttonType},metadata:{label:'Aktionsbutton erstellen',category:'Frontend/Prozessschritte',description:'Erzeugt ein Button-Objekt. Mehrere Buttons mit Liste erstellen zusammenstellen und an eine Interaktions-Node übergeben.',inputs:{id:{label:'Aktions-ID'},label:{label:'Beschriftung'},icon:{label:'Icon'},disabled:{label:'Deaktiviert'},visible:{label:'Sichtbar'}},outputs:{value:{label:'Button'}}}} as NodeDefinition,
  execute:(inputs:Readonly<Record<string,unknown>>)=>({value:validateButtons([{id:inputs.id as string,label:inputs.label as string,...(inputs.icon!==undefined?{icon:String(inputs.icon)}:{}),disabled:inputs.disabled===true,visible:inputs.visible!==false}])[0]})
};
