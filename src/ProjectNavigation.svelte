<script lang="ts">
 import { projectLabel, t } from './i18n';
 import { tick, untrack, type Snippet } from 'svelte';
 import { slide } from 'svelte/transition';
 import Icon from './Icon.svelte';
 import type { Entry, Project } from './core';

 let { open, docked, projects, entries, current, matched, filterCount, creating = $bindable(false),
  onselect, oncreate, onclose, onclosed, filters }: {
  open: boolean; docked: boolean; projects: Project[]; entries: Entry[]; current: string;
  matched: number; filterCount: number; creating?: boolean;
  onselect: (id: string) => void; oncreate: (name: string) => Promise<void>;
  onclose: () => void; onclosed: () => void; filters: Snippet;
 } = $props();

 let drawer = $state<HTMLDialogElement>();
 let nameInput = $state<HTMLInputElement>(null!);
 let name = $state(''), problem = $state(''), saving = $state(false), showFilters = $state(false);
 const counts = $derived.by(() => {
  const result = new Map<string, number>();
  for (const entry of entries) result.set(entry.projectId, (result.get(entry.projectId) ?? 0) + 1);
  return result;
 });
 const options = $derived([{ id: '', name: $t('全部记录') }, ...projects]);
 const duration = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
 let movement: Animation | undefined;

 function moveDrawer(node: HTMLDialogElement, entering: boolean, resized: boolean) {
  node.toggleAttribute('data-leaving', !entering);
  const style = getComputedStyle(node);
  const time = style.getPropertyValue('--motion-navigation').trim();
  const milliseconds = parseFloat(time) * (time.endsWith('ms') ? 1 : 1000);
  const finish = () => {
   if (!entering) { node.close(); onclosed(); }
   movement?.cancel(); movement = undefined;
  };
  if (resized || !milliseconds) { finish(); return; }
  if (!movement) {
   movement = node.animate([
    { transform: style.direction==='rtl'?'translateX(100%)':'translateX(-100%)', opacity: 0 },
    { transform: 'translateX(0)', opacity: 1 },
   ], { duration: milliseconds, easing: style.getPropertyValue('--ease-navigation').trim(), fill: 'both' });
   movement.pause();
   movement.currentTime = entering ? 0 : milliseconds;
  }
  movement.onfinish = finish;
  movement.playbackRate = entering ? 1 : -1;
  movement.play();
 }

 $effect(() => {
  const node = drawer, overlay = !docked, visible = open;
  if (!node) return;
  if (!visible) { if (node.open) moveDrawer(node, false, false); return; }
  const resized = node.open && node.matches(':modal') !== overlay;
  if (node.open && !resized) {
   if (node.hasAttribute('data-leaving')) moveDrawer(node, true, false);
   return;
  }
  const previous = document.activeElement;
  const focusedInside = previous instanceof HTMLElement && node.contains(previous);
  if (node.open) node.close();
  if (overlay) node.showModal(); else node.show();
  if (focusedInside) previous.focus({ preventScroll: true });
  else if (untrack(() => creating)) nameInput?.focus();
  else node.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus({ preventScroll: true });
  moveDrawer(node, true, resized);
 });

 async function startCreating() {
  problem = ''; creating = true; await tick(); nameInput.focus();
 }
 async function cancelCreating() {
  if (saving) return;
  creating = false; name = ''; problem = ''; await tick();
  drawer?.querySelector<HTMLButtonElement>('#new-project-button')?.focus();
 }
 async function create() {
  if (saving || !name.trim()) return;
  saving = true; problem = '';
  try {
   await oncreate(name.trim());
   name = ''; creating = false; await tick();
   drawer?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus();
  } catch (error) { problem = String(error); } finally { saving = false; }
 }
 function navigateKeys(event: KeyboardEvent) {
  if (event.isComposing) return;
  const rows = Array.from(drawer?.querySelectorAll<HTMLButtonElement>('.project-row') ?? []);
  const index = rows.indexOf(event.currentTarget as HTMLButtonElement);
  if (index < 0) return;
  let next = index;
  if (event.key === 'ArrowDown') next = Math.min(rows.length - 1, index + 1);
  else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = rows.length - 1;
  else return;
  event.preventDefault(); rows[next].focus();
 }
</script>

<dialog id="project-navigation" class="project-navigation" class:docked bind:this={drawer}
 aria-labelledby="project-nav-title" oncancel={e => { e.preventDefault(); onclose(); }}
 onclick={e => { if (e.target === drawer && !docked && drawer) {
  const rect = drawer.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) onclose();
 } }}>
 <header class="nav-heading">
  <h2 id="project-nav-title">{$t('项目')}</h2>
  <button id="new-project-button" class="icon-button" aria-label={$t('新建项目')} data-tip={$t('新建项目')} onclick={startCreating}><Icon name="plus" size={18}/></button>
 </header>
 <div class="nav-scroll">
  {#if creating}
   <form class="nav-create" onsubmit={e => { e.preventDefault(); void create(); }}>
    <label for="nav-project-name">{$t('项目名称')}</label>
    <input id="nav-project-name" bind:this={nameInput} bind:value={name} maxlength="60" required disabled={saving}
     onkeydown={e => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); void cancelCreating(); } }}/>
    {#if problem}<p role="alert">{problem}</p>{/if}
    <div><button type="button" disabled={saving} onclick={cancelCreating}>{$t('取消')}</button>
     <button class="blue-button" disabled={saving || !name.trim()}>{$t('创建项目')}</button></div>
   </form>
  {/if}
  <nav aria-label={$t('项目列表')}>
   {#each options as project (project.id)}
    <button class="project-row" aria-label={projectLabel(project, $t)} aria-current={current === project.id ? 'page' : undefined}
     onclick={event => { event.currentTarget.focus({preventScroll:true}); onselect(project.id); }} onkeydown={navigateKeys}>
     <Icon name={project.id ? 'folder' : 'notebook'} size={17}/>
     <span class="project-name">{projectLabel(project, $t)}</span>
     <span class="project-count">{project.id ? counts.get(project.id) ?? 0 : entries.length}</span>
    </button>
   {/each}
  </nav>
  <div class="nav-filter">
   <button class="filter-disclosure" aria-expanded={showFilters} onclick={() => showFilters = !showFilters}>
    <Icon name="filter" size={16}/><span>{$t('筛选记录')}</span>
    {#if filterCount}<span class="project-count">{filterCount}</span>{/if}<Icon name="chevron" size={14}/>
   </button>
   {#if showFilters}<div class="nav-filter-fields" transition:slide={{duration:duration()}}>{@render filters()}</div>{/if}
  </div>
 </div>
 {#if !docked}<footer class="nav-footer"><button class="blue-button" onclick={onclose}>{$t('查看 {count} 条记录', { count: matched })}</button></footer>{/if}
</dialog>
