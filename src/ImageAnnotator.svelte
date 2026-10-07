<script lang="ts">
 import {onMount} from 'svelte';
 import {convertFileSrc} from '@tauri-apps/api/core';
 import type {Attachment} from './core';
 import ConfirmDialog from './ConfirmDialog.svelte';
 let {attachment,onsave,onclose}:{attachment:Attachment;onsave:(data:string)=>Promise<void>;onclose:()=>void}=$props();
 type Point={x:number;y:number};type Mark={tool:string;color:string;width:number;points:Point[]};
 let dialog:HTMLDialogElement,canvas:HTMLCanvasElement,confirmation:ConfirmDialog;
 let tool=$state('circle'),color=$state('#ff453a'),marks:Mark[]=$state([]),current:Mark|null=null,ready=$state(false),busy=$state(false),error=$state('');
 const original=new Image();
 onMount(()=>{dialog.showModal();original.crossOrigin='anonymous';original.onload=()=>{canvas.width=original.naturalWidth;canvas.height=original.naturalHeight;ready=true;draw();};original.onerror=()=>error='图片加载失败，请关闭后重试';original.src=convertFileSrc(attachment.path);return()=>{original.onload=null;original.onerror=null;};});
 function draw(){const c=canvas.getContext('2d')!;c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(original,0,0);for(const m of [...marks,...(current?[current]:[])]){const a=m.points[0],b=m.points[m.points.length-1];c.strokeStyle=m.color;c.lineWidth=m.width;c.lineCap='round';c.lineJoin='round';c.beginPath();if(m.tool==='circle'){c.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2);}else{c.moveTo(a.x,a.y);for(const p of m.points.slice(1))c.lineTo(p.x,p.y);if(m.tool==='arrow'){const angle=Math.atan2(b.y-a.y,b.x-a.x),head=m.width*5;c.moveTo(b.x-head*Math.cos(angle-.5),b.y-head*Math.sin(angle-.5));c.lineTo(b.x,b.y);c.lineTo(b.x-head*Math.cos(angle+.5),b.y-head*Math.sin(angle+.5));}}c.stroke();}}
 function point(e:PointerEvent){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};}
 function down(e:PointerEvent){if(!ready||busy||e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);current={tool,color,width:Math.max(2,canvas.width/canvas.getBoundingClientRect().width*3),points:[point(e)]};}
 function move(e:PointerEvent){if(!current)return;const p=point(e);current.points=current.tool==='pen'?[...current.points,p]:[current.points[0],p];draw();}
 function up(e:PointerEvent){if(!current)return;move(e);if(current.points.length>1)marks=[...marks,current];current=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);draw();}
 function cancelStroke(){current=null;if(ready)draw();}
 function undo(){marks=marks.slice(0,-1);draw();}
 async function close(){if(busy)return;if(marks.length&&!await confirmation.ask('关闭后将丢弃这次未应用的标注。','放弃标注','关闭图片标注？','继续标注'))return;onclose();}
 async function save(){if(!ready||busy||!marks.length)return;busy=true;error='';try{await onsave(canvas.toDataURL('image/png').split(',')[1]);onclose();}catch(e){error=String(e);}finally{busy=false;}}
</script>
<dialog class="annotator" bind:this={dialog} aria-label="图片标注" oncancel={e=>{e.preventDefault();void close();}}>
 <header><strong>图片标注</strong><button disabled={busy} onclick={close}>关闭</button></header>
 <div class="annotation-tools" inert={busy}>{#each [{id:'circle',label:'画圈'},{id:'pen',label:'画笔'},{id:'arrow',label:'箭头'}] as item}<button aria-pressed={tool===item.id} onclick={()=>tool=item.id}>{item.label}</button>{/each}<label>颜色 <input type="color" aria-label="标注颜色" bind:value={color}/></label><button disabled={!marks.length} onclick={undo}>撤销</button></div>
 <div class="canvas-area"><canvas aria-label="标注画布" bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={cancelStroke} onlostpointercapture={cancelStroke}></canvas></div>
 {#if error}<p role="alert">{error}</p>{/if}
 <footer><span>原图保留，应用后请保存笔记。</span><button class="blue-button" disabled={!ready||busy||!marks.length} onclick={save}>{busy?'保存中…':'应用标注'}</button></footer>
</dialog>
<ConfirmDialog bind:this={confirmation}/>
<style>
 .annotator{width:min(900px,calc(100vw - 24px));height:min(760px,calc(100dvh - 24px));max-width:none;max-height:none;margin:auto;padding:0;border:1px solid var(--line);border-radius:14px;background:var(--bg);color:var(--text)}.annotator[open]{display:flex;flex-direction:column}.annotator::backdrop{background:#0008}.annotator header,.annotator footer{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;gap:8px;flex-shrink:0}.annotation-tools{display:flex;align-items:center;gap:4px;padding:6px 12px;flex-wrap:wrap;border-block:1px solid var(--line)}.annotation-tools button[aria-pressed=true]{background:var(--selected);color:var(--blue)}.annotation-tools label{display:flex;align-items:center;font-size:12px;gap:5px}.annotation-tools input{width:32px;height:28px;padding:2px}.canvas-area{flex:1;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;background:var(--surface);padding:12px;overflow:hidden}.canvas-area canvas{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;touch-action:none;cursor:crosshair}.annotator footer span{font-size:12px;color:var(--secondary)}.annotator p{padding:8px 16px;color:#d74747}.annotator footer .blue-button{background:var(--blue);color:white}
</style>
