import type {Point} from './model.js';
export interface CommentCard {id:string;x:number;y:number;text:string;width?:number;height?:number;fontSize?:number}
export interface NodeGroup {id:string;name:string;color:string;x:number;y:number;width:number;height:number;nodeIds:string[];commentIds:string[]}
/** Presentation only: never part of a Flow or execution bundle. */
export interface EditorLayout {flowGroups?:import('./internal-groups.js').InternalFlowGroup[];positions:Record<string,Point>;comments:CommentCard[];groups:NodeGroup[];expressions?:Record<string,EditorLayout>}
export const emptyLayout=():EditorLayout=>({positions:{},comments:[],groups:[]});
/** Drop the center of the node heading inside a rectangle. Overlaps prefer the smallest group. */
export function assignGroups(layout:EditorLayout):EditorLayout {
  const groups=layout.groups.map(group=>({...group,nodeIds:[] as string[],commentIds:[] as string[]}));
  const containing=(x:number,y:number)=>[...groups].reverse().filter(group=>x>=group.x&&x<=group.x+group.width&&y>=group.y+40&&y<=group.y+group.height).sort((a,b)=>a.width*a.height-b.width*b.height)[0];
  for(const [id,point] of Object.entries(layout.positions))containing(point.x+120,point.y+22)?.nodeIds.push(id);
  for(const comment of layout.comments)containing(comment.x+(comment.width??260)/2,comment.y+20)?.commentIds.push(comment.id);
  return {...layout,groups};
}
export function moveGroup(layout:EditorLayout,id:string,dx:number,dy:number):EditorLayout {
  const group=layout.groups.find(group=>group.id===id);if(!group)return layout;
  return {...layout,groups:layout.groups.map(item=>item.id===id?{...item,x:item.x+dx,y:item.y+dy}:item),positions:Object.fromEntries(Object.entries(layout.positions).map(([key,point])=>[key,group.nodeIds.includes(key)?{x:point.x+dx,y:point.y+dy}:point])),comments:layout.comments.map(comment=>group.commentIds.includes(comment.id)?{...comment,x:comment.x+dx,y:comment.y+dy}:comment)};
}
export function resizeGroup(layout:EditorLayout,id:string,width:number,height:number):EditorLayout {
  return assignGroups({...layout,groups:layout.groups.map(group=>group.id===id?{...group,width:Math.max(320,width),height:Math.max(180,height)}:group)});
}

export function transformAnnotation(layout:EditorLayout,kind:string,id:string,dx:number,dy:number):EditorLayout {
  if(kind==='group')return moveGroup(layout,id,dx,dy);
  if(kind==='resize'){const group=layout.groups.find(item=>item.id===id);return group?resizeGroup(layout,id,group.width+dx,group.height+dy):layout;}
  return {...layout,comments:layout.comments.map(item=>item.id!==id?item:kind==='resizeComment'?{...item,width:Math.max(180,(item.width??260)+dx),height:Math.max(100,(item.height??160)+dy)}:{...item,x:item.x+dx,y:item.y+dy})};
}

/** A selected group carries its members; each selected/member item moves exactly once. */
export function moveSelection(layout:EditorLayout,selection:import('./canvas-selection.js').CanvasSelection,dx:number,dy:number):EditorLayout {
 const nodes=new Set(selection.nodes),comments=new Set(selection.comments),groups=new Set(selection.groups);
 for(const group of layout.groups)if(groups.has(group.id)){for(const id of group.nodeIds)nodes.add(id);for(const id of group.commentIds)comments.add(id);}
 return {...layout,positions:Object.fromEntries(Object.entries(layout.positions).map(([id,p])=>[id,nodes.has(id)?{x:p.x+dx,y:p.y+dy}:p])),comments:layout.comments.map(c=>comments.has(c.id)?{...c,x:c.x+dx,y:c.y+dy}:c),groups:layout.groups.map(g=>groups.has(g.id)?{...g,x:g.x+dx,y:g.y+dy}:g)};
}

/** Remove selected group frames, optionally including geometrically nested groups and assigned members. */
export function groupDeletion(layout:EditorLayout,ids:string[],contents:boolean):{groups:string[];nodes:string[];comments:string[]} {
 const current=assignGroups(layout),removing=new Set(ids);
 if(contents){let grew=true;while(grew){grew=false;for(const child of current.groups)if(!removing.has(child.id)&&current.groups.some(parent=>removing.has(parent.id)&&child.x>=parent.x&&child.y>=parent.y+40&&child.x+child.width<=parent.x+parent.width&&child.y+child.height<=parent.y+parent.height)){removing.add(child.id);grew=true;}}}
 const members=current.groups.filter(group=>removing.has(group.id));
 return {groups:[...removing],nodes:contents?[...new Set(members.flatMap(group=>group.nodeIds))]:[],comments:contents?[...new Set(members.flatMap(group=>group.commentIds))]:[]};
}
