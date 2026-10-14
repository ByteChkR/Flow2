import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../contracts/page-config.schema.json';
const validator=new Ajv2020({strict:false,allErrors:true,validateFormats:false,ownProperties:true}).compile(schema);
export function pageConfigErrors(value:unknown):{code:string;path:string;message:string}[]{
  return validator(value)?[]:(validator.errors??[]).map(e=>({code:'page_config',path:e.instancePath,message:e.message??'Ungültige Page-Config'}));
}
