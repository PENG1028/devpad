<script lang="ts">
 import { onMount } from 'svelte';
 import { invoke, isTauri } from '@tauri-apps/api/core';
 import ActionPopover from './ActionPopover.svelte';
 import { openContextMenu } from './context-menu';
 import { t } from './i18n';

 type Field = HTMLInputElement | HTMLTextAreaElement;
 let menu: ActionPopover, field = $state<Field>(), start = 0, end = 0, original = '';
 let selected = $state(false), problem = $state(''), label=$state('');

 onMount(() => {
  let prior: { field: Field; start: number; end: number } | undefined;
  function rememberSelection(event: PointerEvent) {
   prior=undefined;
   const input=event.target;
   if (!(input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement)) return;
   if ((event.button===2 || event.ctrlKey) && input.selectionStart!==null && input.selectionEnd!==null && input.selectionStart!==input.selectionEnd) {
    prior={field:input,start:input.selectionStart,end:input.selectionEnd};
   }
  }
  function editMenu(event: MouseEvent) {
   const target = event.target;
   if (!(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) return;
   if (target.disabled || target.selectionStart === null) return;
   field = target; original = target.value; start = target.selectionStart; end = target.selectionEnd ?? start;
   if (prior?.field===target) {start=prior.start;end=prior.end;}
   prior=undefined;
   selected = start !== end; problem = ''; label=target.getAttribute('aria-label')||target.labels?.[0]?.textContent?.trim()||$t('记录操作');
   openContextMenu(()=>void menu.show(target, event.clientX || event.clientY ? {x:event.clientX,y:event.clientY} : undefined, true));
  }
  document.addEventListener('pointerdown', rememberSelection, true);
  document.addEventListener('contextmenu', editMenu);
  return () => {document.removeEventListener('pointerdown', rememberSelection, true);document.removeEventListener('contextmenu', editMenu);};
 });

 async function act(action: 'cut'|'copy'|'paste'|'all') {
  const input = field;
  if (!input?.isConnected) return;
  input.focus({preventScroll:true});
  if (action === 'all') { input.select(); return; }
  try {
   if (input.value !== original) return;
   input.setSelectionRange(start,end);
   let replacement = '';
   if (action === 'paste') {
    if (input.id === 'entry-text' && isTauri()) {
     input.dispatchEvent(new Event('devpad-paste-note',{bubbles:true}));return;
    }
    replacement = isTauri() ? await invoke<string>('clipboard_text') : await navigator.clipboard.readText();
    if (!replacement) return;
   } else {
    const text = original.slice(start,end);
    if (!text) return;
    if (isTauri()) await invoke('copy_text',{text}); else await navigator.clipboard.writeText(text);
    if (action === 'copy') return;
   }
   if (!input.isConnected || input.readOnly || input.value !== original || document.activeElement !== input) return;
   input.setRangeText(replacement,start,end,'end');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  } catch (error) { problem = String(error); }
 }
</script>
<ActionPopover id="edit-actions" {label} bind:this={menu}>
 <button role="menuitem" disabled={!selected||field?.readOnly} onclick={()=>act('cut')}>{$t('剪切')}</button>
 <button role="menuitem" disabled={!selected} onclick={()=>act('copy')}>{$t('复制')}</button>
 <button role="menuitem" disabled={field?.readOnly} onclick={()=>act('paste')}>{$t('粘贴')}</button>
 <hr/>
 <button role="menuitem" onclick={()=>act('all')}>{$t('全选')}</button>
</ActionPopover>
{#if problem}<p class="edit-menu-error" role="alert">{problem}</p>{/if}
