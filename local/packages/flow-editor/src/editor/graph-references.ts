export function mapReferences<T>(input:T,resolve:(id:string)=>string,referenceVersion?:((id:string)=>number)|null):T {
  const result=structuredClone(input);
  const visit=(value:unknown,parentKey?:string)=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){value.forEach(child=>visit(child));return;}
    const object=value as Record<string,unknown>;
    if(typeof object.graphId==='string'&&(parentKey==='config'||typeof object.operation==='string'||Object.keys(object).every(key=>key==='graphId'||key==='revision'))){
      const original=object.graphId;
      const reference=Object.keys(object).every(key=>key==='graphId'||key==='revision');
      object.graphId=resolve(original);
      if(reference&&referenceVersion===null)delete object.revision;
      else if(reference&&referenceVersion)object.revision=referenceVersion(original);
    }
    Object.entries(object).filter(([key])=>key!=='graphId').forEach(([key,child])=>visit(child,key));
  };
  visit(result);return result;
}

export function graphReferences(value:unknown,parentKey?:string):string[] {
  if(!value||typeof value!=='object')return [];
  if(Array.isArray(value))return value.flatMap(child=>graphReferences(child));
  const item=value as Record<string,unknown>;
  return [...(typeof item.graphId==='string'&&(parentKey==='config'||typeof item.operation==='string'||Object.keys(item).every(key=>key==='graphId'||key==='revision'))?[item.graphId]:[]),...Object.entries(item).filter(([key])=>key!=='graphId').flatMap(([key,value])=>graphReferences(value,key))];
}
