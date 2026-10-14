import descriptions from '../contracts/node-descriptions.json';
import type {NodeDefinition} from './model.js';
type Documentation={description:string;inputs:Record<string,string>};
/** Shared standard metadata. Host descriptions and other metadata always win. */
export function describeNode(definition:NodeDefinition):NodeDefinition {
  const entry=(descriptions as Record<string,Documentation>)[definition.type];
  if(!entry)return definition;
  const metadata=definition.metadata??{};
  const inputs={...metadata.inputs};
  for(const key of Object.keys(definition.inputs)){
    const existing=inputs[key]??{};
    const description=entry.inputs[key]??(key.startsWith('field_')?`Wert für das Feld ${key.slice(6)}; ohne Wert bleibt es unverändert, sofern die Operation einen bestehenden Datensatz bearbeitet.`:
      key.startsWith('item_')?`Listenelement an Position ${key.slice(5)}.`:
      key.startsWith('arg_')?`Wert für den Abfrageparameter ${key.slice(4)}.`:
      key.startsWith('in_')?`Wert für den Graph-Eingang ${existing.label??key.slice(3)} gemäß der angezeigten Schnittstelle.`:
      key.startsWith('case_')?`Graph für den Fall ${existing.label??key.slice(5)}.`:undefined);
    if(description)inputs[key]={...existing,description:existing.description||description};
  }
  return {...definition,metadata:{...metadata,description:metadata.description||entry.description,inputs}};
}
