export type TemplatePreviewType='email'|'html'|'sms'|'pdf';
export function templatePreviewType(value:string):TemplatePreviewType {
  const type=value.trim().toLowerCase();
  if(type!=='email'&&type!=='html'&&type!=='sms'&&type!=='pdf')throw new Error('Vorlagen-Vorschau unterstützt email, html, sms und pdf.');
  return type;
}
export function templatePdf(data:string):Uint8Array {
  const raw=data.replace(/^data:application\/pdf;base64,/i,'').replace(/\s/g,'');
  let decoded:string;
  try{decoded=atob(raw);}catch{throw new Error('PDF-Vorschau benötigt gültige Base64-Daten.');}
  if(!decoded.startsWith('%PDF-'))throw new Error('Die Vorlagendaten enthalten kein PDF.');
  return Uint8Array.from(decoded,char=>char.charCodeAt(0));
}
/** No script execution, external resources or access to the application origin. */
export function templateHtml(data:string):string {
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer">${data}`;
}
