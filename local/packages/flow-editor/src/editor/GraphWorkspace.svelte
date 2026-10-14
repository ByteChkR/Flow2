<script>
 import EditorWorkspace from '@adam/editor/EditorWorkspace.svelte';
 import Flow2Provider from './Flow2Provider.svelte';
 import {emptyWorkspace} from './graph-workspace.js';
 export let state=emptyWorkspace();
 export let identityKey='local';
 export let title='Flow2';
</script>
<EditorWorkspace {identityKey} {title} let:editor>
 <Flow2Provider {editor} bind:state/>
 <slot {editor}/>
</EditorWorkspace>
