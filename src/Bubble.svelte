<script lang="ts">
 import { invoke } from '@tauri-apps/api/core';
 import { getCurrentWindow } from '@tauri-apps/api/window';
 import { onMount } from 'svelte';
 import appIcon from './assets/devpad-icon.png';
 let {embedded=false,moving=false}=$props<{embedded?:boolean;moving?:boolean}>();
 let dot=$state(false),dragging=$state(false),failed=$state(false);
 let press:{x:number;y:number}|null=null;
 onMount(()=>{
  if(!embedded)document.documentElement.classList.add('floating-document');
  let disposed=false,stop:(()=>void)|undefined;
  void (async()=>{dot=await invoke<boolean>('bubble_status');const off=await getCurrentWindow().listen<boolean>('bubble-style',e=>dot=e.payload);if(disposed)off();else stop=off;})().catch(()=>failed=true);
  return()=>{disposed=true;stop?.();press=null;};
 });
 async function restore(){if(moving||dragging)return;press=null;try{await invoke('edge_restore',{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});failed=false;}catch{failed=true;}}
 function down(e:PointerEvent){if(moving||dragging||e.button!==0)return;e.preventDefault();press={x:e.screenX,y:e.screenY};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}
 async function move(e:PointerEvent){
  if(!press||dragging||moving)return;
  if(!(e.buttons&1)){press=null;return;}
  if(Math.abs(e.screenX-press.x)+Math.abs(e.screenY-press.y)<4)return;
  press=null;dragging=true;
  const target=e.currentTarget as HTMLElement;if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);
  try{dot=await invoke<boolean>('notebook_drag');failed=false;}catch{failed=true;}finally{dragging=false;}
 }
 function up(e:PointerEvent){const click=!!press;press=null;const target=e.currentTarget as HTMLElement;if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);if(click&&!dragging)void restore();}
</script>
<button class="floating-notebook" class:dot class:dragging class:failed aria-label={failed?'操作失败，点击重试展开笔记本':'展开笔记本'} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={()=>press=null} onlostpointercapture={()=>press=null} onclick={e=>{if(e.detail===0)void restore();}}>
 {#if dot}<span class="notebook-dot"></span>{:else}
 <img src={appIcon} alt="" draggable="false"/>
 {/if}
</button>
<style>
 .floating-notebook,.floating-notebook:hover:not(:disabled),.floating-notebook:active{display:flex;width:100%;height:100%;min-width:0;min-height:0;margin:0;padding:0;border:0;border-radius:8px;background:transparent;box-shadow:none;outline:none;animation:none;transition:none;overflow:hidden;user-select:none;touch-action:none;cursor:grab}
 .floating-notebook.dragging{cursor:grabbing}
 .floating-notebook img,.floating-notebook:hover img{display:block;width:100%;height:100%;min-width:0;transform:none!important;transition:none!important;pointer-events:none}
 .floating-notebook:focus-visible img{filter:brightness(1.2)}
 .floating-notebook.failed img{opacity:.7}
 .notebook-dot,.notebook-dot:hover{transform:none!important}
</style>
