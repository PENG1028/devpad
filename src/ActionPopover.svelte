<script lang="ts">
 import { onMount, tick, type Snippet } from 'svelte';
 import { placePopover, focusPopoverItem } from './popover';

 let { id, label, children, open = $bindable(false) }: {
  id: string; label: string; children: Snippet; open?: boolean
 } = $props();
 let surface: HTMLDivElement, anchor: HTMLElement | undefined, pending: HTMLElement | undefined;
 const buttons = () => Array.from(surface.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));

 export function close(restore = false) {
  pending = undefined;
  if (!surface?.matches(':popover-open')) return;
  surface.hidePopover(); open = false;
  if (restore && anchor?.isConnected) anchor.focus({ preventScroll: true });
 }
 export async function show(trigger: HTMLElement) {
  if (pending === trigger || (anchor === trigger && surface?.matches(':popover-open'))) { close(true); return; }
  pending = trigger;
  await tick();
  if (pending !== trigger) return;
  pending = undefined;
  if (!trigger.isConnected || !surface?.isConnected) return;
  anchor = trigger;
  if (!surface.matches(':popover-open')) surface.showPopover();
  placePopover(surface, trigger, true);
  surface.scrollTop = 0;
  open = true;
  focusPopoverItem(buttons()[0], surface);
 }
 function key(event: KeyboardEvent) {
  if (event.key === 'Tab') { close(true); return; }
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
  const items = buttons(), index = items.indexOf(document.activeElement as HTMLButtonElement);
  if (!items.length) return;
  let next: number;
  if (event.key === 'ArrowDown') next = (index + 1) % items.length;
  else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else return;
  event.preventDefault(); event.stopPropagation(); focusPopoverItem(items[next], surface);
 }
 onMount(() => {
  const scroll = (event: Event) => { if (!(event.target instanceof Node) || !surface?.contains(event.target)) close(); };
  const resize = () => close();
  window.addEventListener('scroll', scroll, true);
  window.addEventListener('resize', resize);
  return () => { window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
 });
</script>
<div {id} class="action-popover menu-surface" bind:this={surface} popover="auto" role="menu" tabindex="-1" aria-label={label}
 ontoggle={event => open = event.currentTarget?.matches(':popover-open') ?? false} onkeydown={key}
 onclickcapture={e => { if (e.target instanceof Element && e.target.closest('button:not(:disabled)')) close(true); }}>
 {@render children()}
</div>
