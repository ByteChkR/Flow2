<script>
 import {workspaceBottomConsole,openBottomTab,openDiagnostics,openStatistics,closeBottomWindow} from './workspace-bottom-console.js';
 $: state=$workspaceBottomConsole;
 $: activeKind=state.openKinds[0];
 function toggle(kind,open){if(activeKind===kind)closeBottomWindow(kind);else open();}
 $: graphId=state.activeGraphId;
 $: logId=graphId?`logs:${graphId}`:null;
 $: profilerId=graphId?`profiler:${graphId}`:null;
 $: hasLog=!!logId&&state.tabs.some(tab=>tab.id===logId);
 $: hasProfiler=!!profilerId&&state.tabs.some(tab=>tab.id===profilerId);
</script>
<div class="buttons" aria-label="Untere Flow-Panels">
 <button aria-label="Statistics" title="Statistics" aria-pressed={activeKind==='statistics'} on:click={()=>toggle('statistics',openStatistics)}>▤</button>
 <button aria-label="Profiler" title="Profiler" disabled={!hasProfiler&&activeKind!=='profiler'} aria-pressed={activeKind==='profiler'} on:click={()=>toggle('profiler',()=>openBottomTab(profilerId))}>◴</button>
 <button aria-label="Logs" title="Logs" disabled={!hasLog&&activeKind!=='logs'} aria-pressed={activeKind==='logs'} on:click={()=>toggle('logs',()=>openBottomTab(logId))}>≡</button>
 <button aria-label="Fehlerkonsole" title="Fehlerkonsole" aria-pressed={activeKind==='diagnostics'} on:click={()=>toggle('diagnostics',openDiagnostics)}>!</button>
</div>
<style>.buttons{display:flex;flex-direction:column;align-items:center;gap:4px}.buttons button{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:1px solid var(--w-border);border-radius:5px;background:var(--w-panel);color:inherit;font:700 16px system-ui;cursor:pointer}.buttons button[aria-pressed=true]{border-color:var(--w-brand);background:color-mix(in srgb,var(--w-brand) 14%,var(--w-panel))}.buttons button:hover{border-color:var(--w-brand)}.buttons button:disabled{opacity:.45;cursor:default}.buttons button:last-child{color:var(--w-danger,#b42318)}.buttons button:focus-visible{outline:2px solid var(--w-brand);outline-offset:2px}</style>
