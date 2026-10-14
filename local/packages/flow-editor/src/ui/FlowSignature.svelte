<script>
 export let panel;export let flow;
 let canvas,active=null,last;
 const point=event=>{const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};};
 function draw(a,b){const ctx=canvas.getContext('2d');ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
 function start(event){if(event.button!==0||active!==null)return;event.preventDefault();active=event.pointerId;canvas.setPointerCapture(active);last=point(event);draw(last,{x:last.x+.1,y:last.y+.1});}
 function move(event){if(event.pointerId!==active)return;const next=point(event);draw(last,next);last=next;}
 function end(event){if(event.pointerId!==active)return;move(event);active=null;flow.write(panel.field,canvas.toDataURL('image/png'));}
 function clear(){active=null;canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);flow.write(panel.field,undefined);}
</script>
<p>Mit Maus, Stift oder Finger unterschreiben.</p>
<canvas bind:this={canvas} width="900" height="300" aria-label="Unterschriftsfeld" on:pointerdown={start} on:pointermove={move} on:pointerup={end} on:pointercancel={clear}>Unterschriftsfeld</canvas>
<button on:click={clear}>Unterschrift löschen</button>
<style>canvas{display:block;width:100%;max-width:900px;height:auto;background:white;border:1px solid #999;touch-action:none}button{margin-top:8px;padding:6px;font:inherit}</style>
