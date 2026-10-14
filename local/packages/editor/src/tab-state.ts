export function orderedTabs(ids:string[],pinned:string[]):string[]{return [...ids.filter(id=>pinned.includes(id)),...ids.filter(id=>!pinned.includes(id))];}
export function reorderTab(ids:string[],pinned:string[],source:string,target:string,after=false):string[]{
 if(source===target||!ids.includes(source)||!ids.includes(target)||pinned.includes(source)!==pinned.includes(target))return ids;
 const next=ids.filter(id=>id!==source);next.splice(next.indexOf(target)+(after?1:0),0,source);return orderedTabs(next,pinned);
}
export function tabsToClose(ids:string[],pinned:string[],id:string,side:'left'|'right'|'others'):string[]{
 const ordered=orderedTabs(ids,pinned),index=ordered.indexOf(id);
 return ordered.filter((item,i)=>item!==id&&!pinned.includes(item)&&(side==='others'||side==='left'&&i<index||side==='right'&&i>index));
}
