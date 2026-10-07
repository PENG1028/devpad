<script lang="ts">
 import { onMount } from 'svelte';
 import Icon from './Icon.svelte';
 let {hasImages=false,disabled=false,label='',oncopy}:{hasImages?:boolean;disabled?:boolean;label?:string;oncopy:(mode:'raw'|'text'|'images')=>void}=$props();
 let opened=$state(false),group:HTMLDivElement,anchor:HTMLButtonElement;
 let timer:ReturnType<typeof setTimeout>,suppressFocus=false;
 function show(){clearTimeout(timer);if(!disabled&&!suppressFocus)opened=true;}
 function hide(){clearTimeout(timer);opened=false;}
 function leave(){clearTimeout(timer);timer=setTimeout(()=>{if(!group?.contains(document.activeElement))hide();},130);}
 function copy(mode:'raw'|'text'|'images'){hide();oncopy(mode);}
 function key(event:KeyboardEvent){if(event.key==='Escape'){event.stopPropagation();event.preventDefault();hide();suppressFocus=true;anchor.focus({preventScroll:true});queueMicrotask(()=>suppressFocus=false);}if(event.key==='ArrowLeft'){event.preventDefault();show();group.querySelector<HTMLButtonElement>('.satellite')?.focus();}}
 onMount(()=>{window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('dismiss-note-popovers',hide);return()=>{clearTimeout(timer);window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);window.removeEventListener('dismiss-note-popovers',hide);};});
</script>
<div class="copy-control" class:expanded={opened} data-copy-expanded={opened} bind:this={group} role="group" aria-label="复制操作" onmouseenter={show} onmouseleave={leave} onfocusin={show} onfocusout={(event)=>{if(!group.contains(event.relatedTarget as Node))hide();}}>
 <button onkeydown={key} bind:this={anchor} class="copy-anchor copy-action" {disabled} aria-label="复制 Agent 提示词" aria-expanded={opened} data-label="复制 Agent 提示词" onclick={()=>copy('text')}><Icon name={opened?'send':'copy'} size={15}/>{#if label}<span>{label}</span>{/if}</button>
 <button onkeydown={key} class="satellite copy-action" style:--offset={hasImages?'-72px':'-36px'} disabled={disabled||!opened} tabindex={opened?0:-1} aria-hidden={!opened} aria-label="复制原文" data-label="复制原文" onclick={()=>copy('raw')}><Icon name="text" size={15}/></button>
 {#if hasImages}<button onkeydown={key} class="satellite copy-action" style:--offset="-36px" disabled={disabled||!opened} tabindex={opened?0:-1} aria-hidden={!opened} aria-label="复制图片" data-label="复制图片" onclick={()=>copy('images')}><Icon name="image" size={15}/></button>{/if}
</div>
<style>
 .copy-control{position:relative;display:inline-flex;flex-shrink:0;isolation:isolate;z-index:2}
 .copy-action{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;min-height:28px;padding:0;border:1px solid var(--line);border-radius:50%;background:var(--surface);color:var(--secondary);transition:transform .2s cubic-bezier(.2,.8,.2,1),opacity .16s,background .16s,box-shadow .16s}
 .copy-anchor{z-index:3}.copy-anchor:has(span){width:auto;border-radius:16px;padding:0 10px;gap:5px;font-size:12px}
 .copy-action:hover:not(:disabled),.copy-action:focus-visible{background:var(--bg);color:var(--blue);box-shadow:0 3px 10px #0002}
 .satellite{position:absolute;right:0;top:0;opacity:0;transform:translateX(0) scale(.65);pointer-events:none;z-index:2}
 .expanded .satellite{transform:translateX(var(--offset)) scale(1);opacity:1;pointer-events:auto}
 .expanded .copy-anchor{background:var(--bg);color:var(--blue)}
 .copy-action::after{content:attr(data-label);position:absolute;top:calc(100% + 7px);right:0;padding:5px 8px;background:var(--text);color:var(--bg);border-radius:6px;font-size:11px;white-space:nowrap;opacity:0;pointer-events:none;transform:translateY(-3px);transition:opacity .12s,transform .12s}
 .copy-action:hover::after,.copy-action:focus-visible::after{opacity:1;transform:translateY(0)}
 @media(prefers-reduced-motion:reduce){.copy-action,.copy-action::after{transition:none}}
</style>
