import type {Catalog,Flow} from './model.js';
const extensions=new Map<string,(flow:Flow,catalog:Catalog)=>Catalog>();
export function registerGraphCatalogExtension(id:string,extension:(flow:Flow,catalog:Catalog)=>Catalog){extensions.set(id,extension);return ()=>{if(extensions.get(id)===extension)extensions.delete(id);};}
export function extendGraphCatalog(flow:Flow,catalog:Catalog){for(const extension of extensions.values())catalog=extension(flow,catalog);return catalog;}
