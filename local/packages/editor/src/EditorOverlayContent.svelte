<script>
 import {onDestroy} from 'svelte';
 export let editor;export let overlay;
 let instance,unsubscribers=[];
 function subscribe(target,events){for(const unsubscribe of unsubscribers)unsubscribe();unsubscribers=[];if(target)for(const [name,handler] of Object.entries(events??{}))unsubscribers.push(target.$on(name,event=>handler(event.detail)));}
 $: subscribe(instance,overlay.events);
 function close(){overlay.props?.close?.();editor.closeOverlay(overlay.id);}
 onDestroy(()=>{for(const unsubscribe of unsubscribers)unsubscribe();});
</script>
<svelte:component this={overlay.component} bind:this={instance} {...overlay.props} {editor} {close}/>
