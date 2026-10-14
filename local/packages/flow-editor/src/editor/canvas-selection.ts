import type {Point} from './model.js';
export interface CanvasSelection {nodes:string[];comments:string[];groups:string[]}
export function selectionBounds(start:Point,end:Point){return {x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)};}
/** Hit-test rendered bounds to respect zoom, pan and variable element sizes. */
export function enclosedItems(canvas:HTMLElement,start:Point,end:Point):CanvasSelection{
 const area=selectionBounds(start,end),origin=canvas.getBoundingClientRect(),result:CanvasSelection={nodes:[],comments:[],groups:[]};
 for(const element of canvas.querySelectorAll<HTMLElement>('[data-selectable-node],[data-selectable-comment],[data-selectable-group]')){
  const box=element.getBoundingClientRect(),x=box.left-origin.left,y=box.top-origin.top;
  if(box.width<=0||x<area.x||y<area.y||x+box.width>area.x+area.width||y+box.height>area.y+area.height)continue;
  if(element.dataset.selectableNode!==undefined)result.nodes.push(element.dataset.selectableNode);
  else if(element.dataset.selectableComment!==undefined)result.comments.push(element.dataset.selectableComment);
  else if(element.dataset.selectableGroup!==undefined)result.groups.push(element.dataset.selectableGroup);
 }
 return result;
}
