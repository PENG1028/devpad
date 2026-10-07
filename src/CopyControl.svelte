<script lang="ts">
 import { onMount, tick } from 'svelte';
 import Icon from './Icon.svelte';
 let {hasImages=false,disabled=false,label='',oncopy}:{hasImages?:boolean;disabled?:boolean;label?:string;oncopy:(mode:'raw'|'text'|'images'|'export'|'bundle')=>void}=$props();
 let opened=$state(false),group:HTMLDivElement,anchor:HTMLButtonElement,menu=$state<HTMLDivElement>();
 let x=$state(0),y=$state(0);
 function hide(){opened=false;}
 async function toggle(){if(opened){hide();return;}const r=group.getBoundingClientRect();x=Math.max(8,Math.min(innerWidth-170,r.right-162));y=Math.max(8,Math.min(innerHeight-(hasImages?210:180),r.bottom+4));opened=true;await tick();menu?.querySelector<HTMLButtonElement>('button')?.focus();}
 function copy(mode:'raw'|'text'|'images'|'export'|'bundle'){hide();oncopy(mode);}
 function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();anchor.focus();}if(opened&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();const buttons=Array.from(menu?.querySelectorAll<HTMLButtonElement>('button')||[]);const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}
 onMount(()=>{const outside=(e:PointerEvent)=>{if(!group.contains(e.target as Node))hide();};window.addEventListener('pointerdown',outside);window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('dismiss-note-popovers',hide);return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);window.removeEventListener('dismiss-note-popovers',hide);};});
</script>
<div class="copy-control" data-copy-expanded={opened} bind:this={group} role="group" aria-label="复制与导出">
 <button bind:this={anchor} class="copy-anchor" {disabled} aria-label="复制正文" title="复制正文" onclick={()=>copy('raw')}><Icon name="copy" size={15}/>{#if label}<span>{label}</span>{/if}</button>
 <button class="copy-options" {disabled} aria-label="复制与导出选项" aria-haspopup="menu" aria-expanded={opened} onclick={toggle}><Icon name="down" size={12}/></button>
 {#if opened}<div bind:this={menu} class="copy-menu" style:left={x+'px'} style:top={y+'px'} role="menu" tabindex="-1" onkeydown={key} aria-label="复制与导出选项">
  <button role="menuitem" onclick={()=>copy('raw')}>复制正文</button>
  {#if hasImages}<button role="menuitem" onclick={()=>copy('images')}>复制图片</button>{/if}
  <button role="menuitem" onclick={()=>copy('bundle')}>复制图文</button>
  <button role="menuitem" onclick={()=>copy('text')}>按默认模板复制</button>
  <button role="menuitem" onclick={()=>copy('export')}>选择模板与完整导出</button>
 </div>{/if}
</div>
<style>
 .copy-control{display:inline-flex;flex-shrink:0;gap:0;border:1px solid var(--line);border-radius:7px;background:var(--surface)}
 .copy-control>button{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0;border:0;background:transparent;color:var(--secondary)}
 .copy-anchor{width:28px;border-radius:6px 0 0 6px}.copy-anchor:has(span){width:auto;padding:0 8px;gap:5px}
 .copy-options{width:20px;border-left:1px solid var(--line)!important;border-radius:0 6px 6px 0}
 .copy-control>button:hover{background:var(--bg);color:var(--text)}
 .copy-menu{position:fixed;z-index:1000;width:162px;padding:5px;border:1px solid var(--line);border-radius:8px;background:var(--surface);box-shadow:0 6px 20px #0003}
 .copy-menu button{display:block;width:100%;padding:7px 9px;min-height:32px;text-align:left;font-size:12px;border:0;background:transparent;border-radius:4px}
 .copy-menu button:hover,.copy-menu button:focus-visible{background:var(--bg)}
</style>
