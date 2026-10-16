import {writable} from 'svelte/store';

const initial={openKinds:[],activeId:null,tabs:[],statistics:null,diagnostics:[],activeGraphId:null};
export const workspaceBottomConsole=writable(initial);
function upsert(id,kind,title,data,{open=false}={}){workspaceBottomConsole.update(state=>{const tabs=[...state.tabs.filter(tab=>tab.id!==id),{id,kind,title,data}];return {...state,tabs,activeId:open?id:(state.activeId??id),openKinds:open?[kind]:state.openKinds};});}
export function openBottomTab(id){workspaceBottomConsole.update(state=>{const kind=state.tabs.find(tab=>tab.id===id)?.kind;return kind?{...state,openKinds:[kind],activeId:id}:state;});}
export function closeBottomTab(id){workspaceBottomConsole.update(state=>{const closing=state.tabs.find(tab=>tab.id===id),tabs=state.tabs.filter(tab=>tab.id!==id),openKinds=closing&&!tabs.some(tab=>tab.kind===closing.kind)?state.openKinds.filter(kind=>kind!==closing.kind):state.openKinds;return {...state,tabs,openKinds,activeId:state.activeId===id?(tabs.at(-1)?.id??null):state.activeId};});}
export function updateLogs(graphId,graphName,data,{open=false}={}){upsert(`logs:${graphId}`,'logs',`${graphName} · Logs`,data,{open});}
export function updateProfiler(graphId,graphName,data,{open=false}={}){upsert(`profiler:${graphId}`,'profiler',`${graphName} · Profiler`,data,{open});}
export function updateStatistics(data){workspaceBottomConsole.update(state=>({...state,activeGraphId:data.graphId??state.activeGraphId,statistics:data,tabs:state.tabs.some(tab=>tab.id==='statistics')?state.tabs:[...state.tabs,{id:'statistics',kind:'statistics',title:'Statistics'}]}));}
export function updateDiagnostics(data){workspaceBottomConsole.update(state=>({...state,diagnostics:data,tabs:state.tabs.some(tab=>tab.id==='diagnostics')?state.tabs:[...state.tabs,{id:'diagnostics',kind:'diagnostics',title:'Fehlerkonsole'}]}));}
export function openStatistics(){workspaceBottomConsole.update(value=>({...value,openKinds:['statistics'],activeId:'statistics',tabs:value.tabs.some(tab=>tab.id==='statistics')?value.tabs:[...value.tabs,{id:'statistics',kind:'statistics',title:'Statistics'}]}));}
export function openDiagnostics(){workspaceBottomConsole.update(value=>({...value,openKinds:['diagnostics'],activeId:'diagnostics',tabs:value.tabs.some(tab=>tab.id==='diagnostics')?value.tabs:[...value.tabs,{id:'diagnostics',kind:'diagnostics',title:'Fehlerkonsole'}]}));}
export function closeBottomWindow(kind){workspaceBottomConsole.update(state=>({...state,openKinds:state.openKinds.filter(item=>item!==kind)}));}
