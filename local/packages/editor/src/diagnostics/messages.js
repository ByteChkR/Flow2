import {diagnosticMessage} from './diagnostic-messages.js';

const definitions={
 schema:['Schema-Vorgabe nicht erfüllt','Die Konfiguration entspricht nicht dem erwarteten Schema.','Prüfe die betroffenen Felder und ihre Datentypen.'],
 validation:['Eingabe nicht gültig','Eine Eingabe erfüllt die fachliche Prüfung nicht.','Prüfe das betroffene Feld.'],
 save_failed:['Speichern fehlgeschlagen','Die Änderungen konnten nicht gespeichert werden.','Der Entwurf bleibt erhalten. Prüfe die gemeldete Ursache.'],
 missing_input:['Pflichteingabe fehlt','Ein benötigter Eingang ist nicht verbunden.','Verbinde den Eingang oder aktiviere einen konstanten Wert.'],
 type_mismatch:['Datentypen passen nicht zusammen','Ausgang und Eingang haben nicht kompatible Datentypen.','Passe den Eingangstyp an oder füge eine passende Konvertierung ein.'],
 value_type:['Ungültiger Eingabewert','Der Wert entspricht nicht dem erwarteten Datentyp.','Prüfe den angegebenen Typ und das Format des Wertes.'],
 start:['Startpunkt fehlt oder ist mehrfach vorhanden','Ein Graph benötigt genau eine Start-Node.','Füge eine Start-Node hinzu oder entferne überzählige Start-Nodes.'],
 missing_dependency:['Abhängigkeit fehlt','Eine benötigte Definition ist nicht verfügbar.','Prüfe die referenzierten Definitionen.'],
 unknown_node_type:['Node nicht verfügbar','Eine verwendete Node ist im aktuellen Katalog nicht vorhanden.','Prüfe den Node-Typ und seine Version.'],
 unknown_port:['Anschluss nicht verfügbar','Eine Verbindung verweist auf einen nicht vorhandenen Anschluss.','Erstelle die Verbindung mit einem vorhandenen Anschluss neu.'],
 environment:['Runtime nicht unterstützt','Eine Node kann in der gewählten Runtime nicht ausgeführt werden.','Wähle eine unterstützte Runtime.'],
 local_environment:['Lokale Ausführung nicht möglich','Der Graph oder ein Subgraph benötigt Backend-Ausführung.','Wähle Backend-Koordination oder ersetze die betroffenen Nodes durch Browser-Nodes.'],
 designation_environment:['Runtime widerspricht der Kennzeichnung','Die Kennzeichnung oder der aufrufende Graph erlaubt diese Runtime nicht.','Prüfe Kennzeichnung und Runtime der betroffenen Node.'],
 graph_signature:['Subgraph-Schnittstelle passt nicht','Die erwarteten Eingaben oder Ausgaben stimmen nicht mit dem Subgraphen überein.','Gleiche die Schnittstellen ab und prüfe die Verbindungen.'],
 cycle:['Zyklische Abhängigkeit','Der Graph enthält einen nicht ausführbaren Abhängigkeitskreis.','Löse den Kreis auf; verwende für Schleifen eine Steuerungs-Node.'],
 json:['Ungültiges JSON','Der Text enthält einen JSON-Syntaxfehler.','Korrigiere die Syntax. Ungültiges JSON kann nicht gespeichert werden.'],
 syntax:['Ungültiges JSON','Der Text enthält einen JSON-Syntaxfehler.','Korrigiere die Syntax. Ungültiges JSON kann nicht gespeichert werden.'],
 reference:['Referenz nicht gefunden','Der ausgewählte Datensatz ist nicht verfügbar.','Wähle eine vorhandene Referenz.'],
 system:['Prüfung nicht verfügbar','Die Validierung konnte nicht abgeschlossen werden.','Prüfe die Verbindung und die Verfügbarkeit des Schemas.'],
 unknown_schema:['Schema nicht verfügbar','Das benötigte Schema wurde nicht gefunden.','Prüfe die Schemaregistrierung.'],
 permission:['Keine Berechtigung','Die Aktion ist mit den aktuellen Berechtigungen nicht erlaubt.','Prüfe deine Zugriffsrechte.'],
 network:['Verbindung unterbrochen','Das Backend konnte nicht erreicht werden.','Prüfe die Verbindung und den Status der Aktion, bevor du sie erneut startest.'],
 timeout:['Zeitüberschreitung','Innerhalb der Wartezeit ist keine Antwort eingetroffen.','Die Backend-Aktion kann bereits ausgeführt worden sein. Prüfe ihren Status vor einem erneuten Start.'],
 session_lost:['Flow-Sitzung nicht mehr verfügbar','Die Ausführungssitzung ist verloren gegangen.','Prüfe bereits ausgeführte Änderungen, bevor du den Flow erneut startest.'],
 cancelled:['Ausführung abgebrochen','Die Ausführung wurde abgebrochen.',null],
 failed:['Ausführung fehlgeschlagen','Eine Aktion konnte nicht abgeschlossen werden.',null],
 unexpected:['Aktion fehlgeschlagen','Die Aktion konnte nicht abgeschlossen werden.',null],
};
const aliases={browser_failed:'failed',graph_environment:'environment',mode:'environment',hybrid_node:'environment',hybrid_graph:'environment',graph_binding:'graph_signature',graph_recursion:'cycle',session_required:'session_lost',forbidden:'permission',owner:'permission'};
/** Never serialize arbitrary exception/HTTP objects, payloads or stacks into UI details. */
export function safeText(value){
 return String(value??'')
  .replace(/\bBearer\s+\S+/gi,'Bearer [entfernt]')
  .replace(/(["']?(?:password|passwort|token|secret|authorization|cookie)["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,'$1[entfernt]')
  .slice(0,2000);
}
export function messageFromDiagnostic(d,context={}){
 d=d&&typeof d==='object'?d:{message:typeof d==='string'?d:undefined};
 const code=d.code??d.kind??'unexpected',key=aliases[code]??code;
 const originalSeverity=['error','warning','info'].includes(d.severity)?d.severity:key==='cancelled'?'info':'error';
 const severity=key==='schema'?'warning':originalSeverity;
 const known=definitions[key];
 const target=d.target??context.target;
 const categories=context.categories??d.categories??[];
 const params=d.params??{};
 let schema=null;try{if(d.keyword&&d.params)schema=diagnosticMessage({...d,params},d.schemaId);}catch{/* Incomplete legacy diagnostics retain their original message. */}
 const location=(context.location??d.location??[d.graphId,d.nodeId].filter(Boolean).join(' / '))+(d.line&&d.column?` · Zeile ${d.line}, Spalte ${d.column}`:'');
 const message={code,severity,source:context.source??d.source??'action',title:schema?'Schema-Vorgabe nicht erfüllt':known?.[0]??(severity==='error'?'Aktion fehlgeschlagen':severity==='warning'?'Hinweis prüfen':'Information'),description:schema??known?.[1]??(severity==='error'?'Die Aktion konnte nicht abgeschlossen werden.':safeText(d.message??'Weitere Informationen sind nicht verfügbar.')),hint:known?.[2]??null,location,target,categories,blocking:d.blocking??originalSeverity==='error',details:{code,...(d.line?{line:d.line,column:d.column}:{}),path:d.path??d.instancePath??'',...(context.executionId??d.executionId?{executionId:context.executionId??d.executionId}:{}),...(d.graphId?{graphId:d.graphId}:{}),...(d.nodeId?{nodeId:d.nodeId}:{}),...(d.correlationId?{correlationId:d.correlationId}:{}),...(context.status?{status:context.status}:{})}};
 if(d.message&&!schema){const text=safeText(d.message);if(text&&text!==message.description){message.cause=text;message.details.message=text;}}
 if(d.expectedType)message.description+=` Erwartet: ${safeText(d.expectedType)}.`;
 if(d.actualType)message.description+=` Vorhanden: ${safeText(d.actualType)}.`;
 message.id=JSON.stringify([message.source,code,categories,target??location,d.path??d.instancePath??'',params,d.expectedType,d.actualType,known||schema?undefined:message.cause]);
 return message;
}
export function errorMessages(error,context={}){
 if(error?.messages)return error.messages;
 const status=error?.status??error?.response?.status;
 const body=error?.response?.data;
 const diagnostics=error?.diagnostics??(Array.isArray(body?.errors)?body.errors:null);
 if(Array.isArray(diagnostics))return deduplicate(diagnostics.map(d=>messageFromDiagnostic(d,{...context,status})));
 const code=error instanceof SyntaxError?'syntax':error?.name==='AbortError'?'cancelled':error?.name==='TimeoutError'||error?.code==='ECONNABORTED'||status===408||status===504?'timeout':status===401||status===403?'permission':error?.name==='FlowSessionLostError'?'session_lost':error?.code==='ERR_NETWORK'?'network':body?.code??error?.code??'unexpected';
 return [messageFromDiagnostic({code,message:body?.message??error?.message??(typeof error==='string'?error:undefined),...(error?.nodeId?{nodeId:error.nodeId}:{}),...(error?.executionId?{executionId:error.executionId}:{}),...(error?.graphId?{graphId:error.graphId}:{}),...(error?.line?{line:error.line,column:error.column}:{})},{...context,status})];
}
export function deduplicate(messages){return [...new Map(messages.map(message=>[message.id,message])).values()].sort((a,b)=>['error','warning','info'].indexOf(a.severity)-['error','warning','info'].indexOf(b.severity));}
export function diagnosticDetails(message){return JSON.stringify(Object.fromEntries(Object.entries(message.details).map(([key,value])=>[key,safeText(value)])),null,2);}
export class MessageError extends Error {constructor(messages){super(messages.map(message=>message.title).join(' · '));this.messages=messages;}}

/** Only report a position when the JSON engine provides an unambiguous one. */
export function jsonSyntaxDiagnostic(text,error){
 const message=String(error?.message??error),match=/\(line (\d+) column (\d+)\)/.exec(message);
 const offset=/\bat position (\d+)\b/.exec(message);
 let line,column;
 if(match){line=Number(match[1]);column=Number(match[2]);}
 else if(offset&&Number(offset[1])<=String(text).length){const prefix=String(text).slice(0,Number(offset[1]));line=prefix.split('\n').length;column=prefix.length-prefix.lastIndexOf('\n');}
 return {code:'syntax',message,...(line&&column?{line,column}:{})};
}
