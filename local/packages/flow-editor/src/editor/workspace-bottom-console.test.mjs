import {test} from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {workspaceBottomConsole, openStatistics, openDiagnostics, updateLogs, updateProfiler, openBottomTab, closeBottomWindow} from './workspace-bottom-console.js';

test('all bottom panels replace the visible panel while retaining flow tabs', () => {
  workspaceBottomConsole.set({openKinds:[],activeId:null,tabs:[],statistics:null,diagnostics:[],activeGraphId:null});
  openStatistics();
  openDiagnostics();
  assert.deepEqual(get(workspaceBottomConsole).openKinds, ['diagnostics']);
  updateLogs('a', 'Flow A', {entries:[]}, {open:true});
  assert.deepEqual(get(workspaceBottomConsole).openKinds, ['logs']);
  updateProfiler('a', 'Flow A', {}, {open:true});
  assert.deepEqual(get(workspaceBottomConsole).openKinds, ['profiler']);
  updateLogs('b', 'Flow B', {});
  assert.deepEqual(get(workspaceBottomConsole).openKinds, ['profiler']);
  openBottomTab('logs:a');
  assert.deepEqual(get(workspaceBottomConsole).openKinds, ['logs']);
  openStatistics();
  assert.deepEqual(get(workspaceBottomConsole).openKinds, ['statistics']);
  assert.equal(get(workspaceBottomConsole).tabs.length, 5);
  closeBottomWindow('statistics');
  assert.deepEqual(get(workspaceBottomConsole).openKinds, []);
  openBottomTab('logs:a');
  assert.equal(get(workspaceBottomConsole).activeId, 'logs:a');
});
