<script lang="ts">
 import { onMount, tick } from 'svelte';
 import { isTauri, invoke } from '@tauri-apps/api/core';
 import { getCurrentWindow } from '@tauri-apps/api/window';
 import App from './App.svelte';
 import Bubble from './Bubble.svelte';
 type Surface = {phase:'expanded'|'collapsing'|'compact'|'expanding';right:boolean;bottom:boolean;width:number;height:number};
 let surface=$state<Surface>({phase:'expanded',right:false,bottom:false,width:innerWidth,height:innerHeight});
 const suspended=$derived(surface.phase!=='expanded');
 const moving=$derived(surface.phase==='collapsing'||surface.phase==='expanding');
 onMount(()=>{
  if(!isTauri())return;
  let disposed=false,stop:(()=>void)|undefined;
  let scrollPositions:{element:HTMLElement;top:number;left:number}[]=[];
  void getCurrentWindow().listen<Surface>('notebook-surface',async event=>{
   if(event.payload.phase==='collapsing')scrollPositions=Array.from(document.querySelectorAll<HTMLElement>('.expanded-content *')).filter(element=>element.scrollTop||element.scrollLeft).map(element=>({element,top:element.scrollTop,left:element.scrollLeft}));
   surface=event.payload;
   await tick();
   if(surface.phase==='expanded')for(const {element,top,left} of scrollPositions){element.scrollTop=top;element.scrollLeft=left;}
   if(moving)await invoke('notebook_surface_ready');
  }).then(off=>{if(disposed)off();else stop=off;});
  return()=>{disposed=true;stop?.();};
 });
</script>

<div class="notebook-surface" class:compact={surface.phase==='compact'} class:moving class:right={surface.right} class:bottom={surface.bottom}>
 <div class="expanded-content" class:suspended inert={suspended} style:width={suspended?`${surface.width}px`:'100%'} style:height={suspended?`${surface.height}px`:'100%'}>
  <App {suspended}/>
 </div>
 {#if suspended}<div class="compact-content" class:moving><Bubble embedded={true} {moving}/></div>{/if}
</div>

<style>
 :global(.notebook-document),:global(.notebook-document body),:global(.notebook-document #app){background:transparent}
 .notebook-surface{position:relative;width:100%;height:100%;overflow:hidden;background:var(--bg);border-radius:10px}
 .expanded-content{position:absolute;top:0;left:0;opacity:1;transition:opacity 90ms ease}
 .expanded-content :global(.app-shell){height:100%}
 .right .expanded-content{left:auto;right:0}.bottom .expanded-content{top:auto;bottom:0}
 .expanded-content.suspended{opacity:0;pointer-events:none}
 .compact-content{position:absolute;inset:0;opacity:1;transition:opacity 90ms ease}
 .compact-content.moving{opacity:0;pointer-events:none}
 .compact{background:transparent;border-radius:8px}
 @media(prefers-reduced-motion:reduce){.expanded-content,.compact-content{transition:none}}
</style>
