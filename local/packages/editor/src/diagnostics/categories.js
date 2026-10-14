// Category dimensions are independent; values within a dimension are alternatives.
export function categoryGroups(messages){
 const dimensions=new Map();
 for(const message of messages)for(const category of message.categories??[]){
  if(!dimensions.has(category.id))dimensions.set(category.id,{id:category.id,label:category.label,values:new Map()});
 }
 for(const group of dimensions.values())for(const message of messages){
  const category=message.categories?.find(category=>category.id===group.id);
  const value=category?.value??null,key=JSON.stringify([group.id,value]);
  if(!group.values.has(key))group.values.set(key,{key,label:category?.valueLabel??value??'Ohne Zuordnung',count:0});
  group.values.get(key).count++;
 }
 return [...dimensions.values()].map(group=>({...group,values:[...group.values.values()]}));
}
export function matchesCategories(message,groups,excluded){
 return groups.every(group=>!excluded.has(JSON.stringify([group.id,message.categories?.find(category=>category.id===group.id)?.value??null])));
}
