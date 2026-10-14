/** Keep an editor mounted while a route change is being approved. */
const guards=new Set<()=>Promise<boolean>>();
export function registerNavigationGuard(guard:()=>Promise<boolean>){guards.add(guard);return ()=>{guards.delete(guard);};}
interface Location {pathname:string;search?:string;hash?:string;state?:unknown;_key?:string}
interface Navigation {location:Location;action:string}
interface History {readonly location:Location;listen:(listener:(event:Navigation)=>void)=>()=>void;navigate:(to:string|number,options?:unknown)=>unknown}
export function createGuardedHistory(source:History){
 let accepted=source.location,pending:Navigation|undefined,checking=false,reverting=false;
 const listeners=new Set<(event:Navigation)=>void>();let unsubscribe:(()=>void)|undefined;
 const publish=(event:Navigation)=>{accepted=event.location;for(const listener of listeners)listener(event);};
 async function resolve(){checking=true;let allowed=true;try{for(const guard of [...guards])if(!await guard()){allowed=false;break;}}catch{allowed=false;}
  const next=pending;pending=undefined;checking=false;if(!next)return;
  if(allowed)publish(next);else{reverting=true;try{source.navigate(accepted.pathname+(accepted.search??'')+(accepted.hash??''),{replace:true,state:accepted.state});}finally{reverting=false;}}
 }
 return {
  get location(){return accepted;},navigate:source.navigate.bind(source),
  listen(listener:(event:Navigation)=>void){listeners.add(listener);listener({location:accepted,action:'POP'});
   if(!unsubscribe)unsubscribe=source.listen(event=>{if(reverting)return;if(event.location===accepted)return;if(!guards.size){publish(event);return;}pending=event;if(!checking)void resolve();});
   return ()=>{listeners.delete(listener);if(!listeners.size){unsubscribe?.();unsubscribe=undefined;}};
  }
 };
}
