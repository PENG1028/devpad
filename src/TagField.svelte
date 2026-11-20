<script lang="ts">
 import { t } from './i18n';
 import { fieldTags } from './core';
 let {value=$bindable(''),options,disabled=false}:{value?:string;options:string[];disabled?:boolean}=$props();
 let input:HTMLInputElement, focused=$state(false);
 const last=$derived(value.split(/[\s,，]+/u).at(-1)?.replace(/^#/,'')??'');
 const used=$derived(fieldTags(value.replace(/[^\s,，]+$/u,'')));
 const matches=$derived(options.filter(tag=>!used.includes(tag)&&tag.toLowerCase().startsWith(last.toLowerCase())&&tag!==last).slice(0,6));
 function pick(tag:string){value=value.replace(/[^\s,，]*$/u,'#'+tag+' ');input.focus();}
</script>
<div class="tags-field" onfocusin={()=>focused=true} onfocusout={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))focused=false;}}>
 <label><span>{$t('标签')}</span><input bind:this={input} aria-label={$t('笔记标签')} bind:value {disabled} placeholder={$t('用空格分隔多个 #标签')}/></label>
 {#if focused&&matches.length}<div class="tag-suggestions" aria-label={$t('所有标签')} role="group">
  {#each matches as tag}<button type="button" onmousedown={e=>e.preventDefault()} onclick={()=>pick(tag)}>#{tag}</button>{/each}
 </div>{/if}
</div>
