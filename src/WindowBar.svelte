<script lang="ts">
 import { onMount } from 'svelte';
 import { getCurrentWindow } from '@tauri-apps/api/window';
 import Icon from './Icon.svelte';
 let { title }:{title:string}=$props();
 let maximized=$state(false), pinned=$state(false), problem=$state('');
 onMount(()=>{let disposed=false;let stop:(()=>void)|undefined;const win=getCurrentWindow();void (async()=>{maximized=await win.isMaximized();pinned=await win.isAlwaysOnTop();const unlisten=await win.onResized(async()=>maximized=await win.isMaximized());if(disposed)unlisten();else stop=unlisten;})();return()=>{disposed=true;stop?.();};});
 async function action(kind:string){try{const win=getCurrentWindow();if(kind==='drag')await win.startDragging();if(kind==='minimize')await win.minimize();if(kind==='maximize'){await win.toggleMaximize();maximized=await win.isMaximized();}if(kind==='close')await win.close();if(kind==='pin'){await win.setAlwaysOnTop(!pinned);pinned=!pinned;}}catch(e){problem=String(e);}}
</script>
<header class="aux-titlebar" aria-label="窗口标题栏">
 <div class="aux-drag" role="presentation" onmousedown={(event)=>{if(event.button===0&&event.detail===1)void action('drag');}} ondblclick={()=>action('maximize')}><span>{problem||title}</span></div>
 <button class="icon-button" class:pressed={pinned} aria-label="窗口置顶" aria-pressed={pinned} title={pinned?'取消置顶':'窗口置顶'} onclick={()=>action('pin')}><Icon name="pin" size={16}/></button>
 <div class="window-controls"><button aria-label="最小化" title="最小化" onclick={()=>action('minimize')}><Icon name="minimize" size={15}/></button><button aria-label={maximized?'还原窗口':'最大化'} title={maximized?'还原窗口':'最大化'} onclick={()=>action('maximize')}><Icon name={maximized?'restore':'maximize'} size={13}/></button><button class="window-close" aria-label="关闭窗口" title="关闭" onclick={()=>action('close')}><Icon name="close" size={17}/></button></div>
</header>
