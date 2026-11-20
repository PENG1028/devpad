<script lang="ts">
 import { t } from './i18n';
 import { onMount, tick } from 'svelte';
 import Icon from './Icon.svelte';
 import { placePopover, focusPopoverItem } from './popover';

 type Option = { value:string; label:string; group?:string };
 let {value=$bindable(''),options,label,disabled=false,resetAfterPick=false,onchange,oncreate,multiple,emptyLabel}:{
  value?:string; options:Option[]; label:string; disabled?:boolean; resetAfterPick?:boolean;
  multiple?:string[]; emptyLabel?:string; onchange?:(value:string)=>void; oncreate?:(name:string)=>Promise<void>;
 }=$props();
 const uid=$props.id();
 let openRequest=0, opening=false;
 let trigger:HTMLButtonElement, menu:HTMLDivElement, list:HTMLDivElement;
 let input=$state<HTMLInputElement>();
 let opened=$state(false), query=$state(''), pending=$state(false), problem=$state('');
 const searchable=$derived(!!oncreate || options.length>=9);
 const filtered=$derived(options.filter(o=>o.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
 const exact=$derived(options.find(o=>o.label.toLocaleLowerCase()===query.trim().toLocaleLowerCase()));
 const selectedLabel=$derived(multiple ? options.filter(o=>multiple.includes(o.value)).map(o=>o.label).join(', ') || emptyLabel : options.find(o=>o.value===value)?.label);
 function isSelected(id:string){return multiple ? (id ? multiple.includes(id) : multiple.length===0) : id===value;}
 const buttons=()=>Array.from(list.querySelectorAll<HTMLButtonElement>('[role=option]'));
 function close(restore=false) {
  openRequest++;opening=false;
  if (menu?.matches(':popover-open')) menu.hidePopover();
  opened=false;
  if (restore && trigger?.isConnected) trigger.focus({preventScroll:true});
 }
 async function show() {
  if(disabled || pending) return;
  if(opening || menu?.matches(':popover-open')) { close(true); return; }
  const request=++openRequest;opening=true;
  query='';problem='';await tick();
  if(request!==openRequest)return;
  opening=false;
  if(!menu?.isConnected||!trigger?.isConnected)return;
  menu.showPopover(); placePopover(menu,trigger); opened=true;
  const active=buttons()[Math.max(0,options.findIndex(o=>isSelected(o.value)))];
  list.scrollTop=0;
  focusPopoverItem(active,list);
  if(searchable) input?.focus({preventScroll:true});
 }
 function choose(next:string) {
  if(multiple){onchange?.(next);return;}
  value=resetAfterPick?'':next; onchange?.(next); close(true);
 }
 async function create() {
  if(!oncreate || pending || !query.trim()) return;
  if(exact) {choose(exact.value);return;}
  pending=true; problem='';
  try {await oncreate(query.trim().normalize('NFC'));close(true);}
  catch(error) {problem=String(error);}
  finally {pending=false;}
 }
 function key(e:KeyboardEvent) {
  if(e.isComposing) return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  if(e.key==='Tab') {
   const footer=menu.querySelector<HTMLButtonElement>('.create-option:not(:disabled)');
   if(!e.shiftKey && footer && document.activeElement!==footer){e.preventDefault();footer.focus();return;}
   close(true);return;
  }
  const rows=buttons(), index=rows.indexOf(document.activeElement as HTMLButtonElement);
  const fromInput=e.target===input;
  if(fromInput && e.key==='Enter'){
   e.preventDefault();e.stopPropagation();
   if(oncreate && query.trim() && !exact)void create();
   else if(exact || filtered[0])choose((exact || filtered[0]).value);
   return;
  }
  let next:number;
  if(e.key==='ArrowDown')next=index<0?0:(index+1)%rows.length;
  else if(e.key==='ArrowUp')next=index<=0?rows.length-1:index-1;
  else if(!fromInput && e.key==='Home')next=0;
  else if(!fromInput && e.key==='End')next=rows.length-1;
  else return;
  e.preventDefault();e.stopPropagation();focusPopoverItem(rows[next],list);
 }
 onMount(()=>{
  const scroll=(e:Event)=>{if(!menu?.contains(e.target as Node))close();};
  const dismiss=()=>close();
  window.addEventListener('resize',dismiss);window.addEventListener('scroll',scroll,true);window.addEventListener('dismiss-note-popovers',dismiss);
  return()=>{window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',scroll,true);window.removeEventListener('dismiss-note-popovers',dismiss);};
 });
</script>

<button type="button" class="select-field" role="combobox" aria-label={label} aria-expanded={opened} aria-controls={uid+'-list'} aria-haspopup="listbox" {disabled} bind:this={trigger}
 popovertarget={uid} onclick={e=>{e.preventDefault();void show();}} onkeydown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();void show();}}}>
 <span>{selectedLabel||$t('请选择')}</span><Icon name="chevron" size={14}/>
</button>
<div id={uid} class="select-options menu-surface" popover="auto" role="group" aria-label={label} bind:this={menu} ontoggle={event=>opened=event.currentTarget?.matches(':popover-open') ?? false}>
 {#if searchable}
  <div class="option-search"><Icon name="search" size={15}/><input bind:this={input} bind:value={query} type="text" onkeydown={key} aria-label={oncreate?$t('类型名称'):$t('搜索选项')}
   placeholder={oncreate?$t('使用已有类型或输入新名称'):$t('搜索选项')} oninput={()=>{list.scrollTop=0;problem='';}}/></div>
 {/if}
 <div id={uid+'-list'} class="options-scroll" role="listbox" tabindex="-1" onkeydown={key} aria-multiselectable={multiple?true:undefined} aria-label={label} bind:this={list}>
  {#each filtered as option,i (option.value)}
   {#if option.group && filtered[i-1]?.group!==option.group}<div class="option-heading" aria-hidden="true">{option.group}</div>{/if}
   <button type="button" role="option" aria-selected={isSelected(option.value)} tabindex="-1" onclick={()=>choose(option.value)}>
    <span>{option.label}</span>{#if isSelected(option.value)}<Icon name="check" size={14}/>{/if}
   </button>
  {:else}<span class="empty-options">{$t('暂无选项')}</span>{/each}
 </div>
 {#if oncreate && query.trim() && !exact}
  <button class="create-option" type="button" disabled={pending} onkeydown={key} onclick={create}><Icon name="plus" size={15}/><span>{$t('新建类型')} · {query.trim()}</span></button>
 {/if}
 {#if problem}<p class="option-error" role="alert">{problem}</p>{/if}
</div>
