/** Image values are SVG-store paths or image data URLs. Raw base64 uses mimeType. */
export function imageData(value:string,mimeType=''):string {
  if(!value)return '';
  const match=/^data:(image\/(?:png|jpeg|gif|webp|svg\+xml|avif|bmp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  const data=match?.[2]??value;
  const mime=match?.[1]??mimeType;
  if(!/^image\/(png|jpeg|gif|webp|svg\+xml|avif|bmp)$/.test(mime)||!data||/\s/.test(data)||data.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error('Bild benötigt gültiges Base64 und einen unterstützten image-MIME-Typ.');
  return `data:${mime};base64,${data}`;
}
/** Raw base64 icons carry their MIME type through recognizable image signatures. */
export function normalizeIcon(value:string):string {
  if(!value)return '';
  if(value.startsWith('data:'))return imageData(value);
  if(value.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(value)){
    const bytes=atob(value),head=bytes.slice(0,512);
    const mime=head.startsWith('\x89PNG\r\n\x1a\n')?'image/png':head.startsWith('\xff\xd8\xff')?'image/jpeg':/^GIF8[79]a/.test(head)?'image/gif':head.startsWith('RIFF')&&head.slice(8,12)==='WEBP'?'image/webp':head.startsWith('BM')?'image/bmp':head.slice(4,12)==='ftypavif'?'image/avif':/^(?:\s|\xef\xbb\xbf)*(?:<\?xml[^>]*>\s*)?<svg[\s/>]/.test(head)?'image/svg+xml':undefined;
    if(mime)return imageData(value,mime);
  }
  return value;
}
export interface DialogOptions {fullscreen?:boolean;size?:string;allowCancel?:boolean;cancelLabel?:string}
export interface Presentation {title?:string;text?:string;icon?:string;dialogOptions?:DialogOptions}
export interface ChoiceButton {id:string;label:string;icon?:string;disabled?:boolean;visible?:boolean}
export function validatePresentation(value:Presentation):Presentation {
  const options=value.dialogOptions;
  if(options?.size&&!['small','medium','large'].includes(options.size))throw new Error('Dialoggröße muss small, medium oder large sein.');
  return {...value,...(value.icon===undefined?{}:{icon:normalizeIcon(value.icon)})};
}
export function validateButtons(buttons:ChoiceButton[]):ChoiceButton[] {
  if(!buttons.length)throw new Error('Mindestens eine Auswahloption ist erforderlich.');
  const ids=new Set<string>();
  for(const button of buttons){
    if(!button.id.trim()||button.id==='cancel'||ids.has(button.id)||!button.label.trim())throw new Error('Buttons benötigen eindeutige IDs (nicht cancel) und eine Beschriftung.');
    ids.add(button.id);if(button.icon)normalizeIcon(button.icon);
  }
  return buttons.map(button=>({...button,...(button.icon===undefined?{}:{icon:normalizeIcon(button.icon)})}));
}
