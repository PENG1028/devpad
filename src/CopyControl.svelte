<script lang="ts">
 import { tick } from 'svelte';
 import Icon from './Icon.svelte';
 import { defaultCopyMode, type CopyMode } from './core';
 import { t } from './i18n';

 let { hasText, hasImages, disabled, copied, open, onopen, oncopy }: {
  hasText:boolean; hasImages:boolean; disabled:boolean; copied:boolean; open:boolean;
  onopen:(open:boolean)=>void; oncopy:(mode:CopyMode)=>void;
 } = $props();
 const mode=$derived(defaultCopyMode(hasText,hasImages));
 const label=$derived(mode==='bundle'?$t('复制图文'):mode==='raw'?$t('复制正文'):$t('复制图片'));
 const multiple=$derived(hasText && hasImages);
 const optionsId=$props.id();
 let anchor:HTMLButtonElement, first=$state<HTMLButtonElement>(null!);

 function offer() { if(multiple && !disabled) onopen(true); }
 async function key(event:KeyboardEvent) {
  if(event.key==='Escape' && open) {
   event.stopPropagation(); event.preventDefault(); anchor.focus({preventScroll:true}); onopen(false);
  } else if(event.key==='ArrowDown' && event.target===anchor && multiple && !disabled) {
   event.preventDefault(); offer(); await tick(); first.focus({preventScroll:true});
  }
 }
</script>

<div class="copy-control" class:open role="group" aria-label={label}
 onpointerenter={event=>{if(event.pointerType==='mouse')offer();}}
 onpointerleave={event=>{if(!event.currentTarget.matches(':has(:focus-visible)'))onopen(false);}}
 onfocusout={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))onopen(false);}}>
 <button class="icon-button journal-copy" class:copied {disabled} bind:this={anchor} aria-label={label} data-tip={label}
  aria-expanded={multiple?open:undefined} aria-controls={multiple?optionsId:undefined}
  onfocus={event=>{if(event.currentTarget.matches(':focus-visible'))offer();}}
  onkeydown={key} onclick={()=>oncopy(mode)}><Icon name={copied?'check':'copy'} size={16}/></button>
 {#if multiple}
  <div id={optionsId} class="copy-options" inert={!open}>
   <button bind:this={first} disabled={disabled||!open} aria-label={$t('仅复制正文')} data-tip={$t('仅复制正文')} onkeydown={key} onclick={()=>oncopy('raw')}><Icon name="text" size={15}/></button>
   <button disabled={disabled||!open} aria-label={$t('仅复制图片')} data-tip={$t('仅复制图片')} onkeydown={key} onclick={()=>oncopy('images')}><Icon name="image" size={15}/></button>
  </div>
 {/if}
</div>

<style>
 .copy-control{position:relative;display:inline-flex;align-items:center;isolation:isolate}
 .copy-options{position:absolute;inset-inline-end:100%;top:0;display:flex;align-items:center;height:100%;padding-inline:3px;gap:3px;pointer-events:none;visibility:hidden}
 .copy-options button{width:28px;height:28px;min-height:28px;padding:0;border-radius:50%;background:var(--bg);color:var(--secondary);box-shadow:inset 0 0 0 1px var(--line);opacity:0;transform:translateX(var(--slide,12px)) scale(.8);transition:transform 210ms cubic-bezier(.2,.9,.32,1.35),opacity 110ms ease-out}
 :global([dir=rtl]) .copy-control{--slide:-12px}
 .open .copy-options{pointer-events:auto;visibility:visible}
 .open .copy-options button{opacity:1;transform:none}
 .open .copy-options button:first-child{transition-delay:18ms}
 .open .journal-copy,.copy-options button:is(:hover,:focus-visible),.journal-copy.copied{color:var(--blue)}
 .journal-copy.copied :global(svg){animation:copy-done 240ms ease-out}
 @keyframes copy-done{0%{transform:scale(.76)}55%{transform:scale(1.15)}100%{transform:none}}
 @media(prefers-reduced-motion:reduce){.copy-options button{transition:none}.journal-copy.copied :global(svg){animation:none}}
</style>
