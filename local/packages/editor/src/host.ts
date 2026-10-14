import {writable, type Readable} from 'svelte/store';
import type {ComponentType} from 'svelte';
export const darkModeStore=writable(false);
export const hostComponents=writable<Record<string,ComponentType>>({});
export type HostComponentLoader=()=>Promise<{default:ComponentType}>;
export const hostComponentLoaders=writable<Record<string,HostComponentLoader>>({});
const pending=new WeakMap<HostComponentLoader,Promise<ComponentType>>();
export function loadHostComponent(loader:HostComponentLoader){let result=pending.get(loader);if(!result){result=loader().then(module=>module.default);pending.set(loader,result);result.catch(()=>pending.delete(loader));}return result;}
let unsubscribe:(()=>void)|undefined;
/** Configure once at application bootstrap. Returns teardown for tests and independent hosts. */
export function configureEditorHost(host:{components?:Record<string,ComponentType>;loaders?:Record<string,HostComponentLoader>;darkMode?:Readable<boolean>}) {
 if(host.components)hostComponents.update(current=>({...current,...host.components}));
 if(host.loaders)hostComponentLoaders.update(current=>({...current,...host.loaders}));
 if(host.darkMode){unsubscribe?.();unsubscribe=host.darkMode.subscribe(darkModeStore.set);}
 return ()=>{unsubscribe?.();unsubscribe=undefined;};
}
