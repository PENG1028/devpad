<script lang="ts">
 import { tick } from 'svelte';
 import Icon from './Icon.svelte';
 import SelectField from './SelectField.svelte';
 import Disclosure from './Disclosure.svelte';
 import ShortcutList from './ShortcutList.svelte';
 import { searchShortcuts, shortcutLabel, type SearchShortcut } from './shortcuts';
 import { languages, languagePreference, setLanguagePreference, t } from './i18n';

 type Theme = 'light' | 'dark' | 'system';
 type Tool = 'templates' | 'agents' | 'help' | 'updates';
 type Tab = 'general' | 'tools' | 'about';
 const tabs: {id: Tab; label: string}[] = [
  {id:'general', label:'通用'}, {id:'tools', label:'工具'}, {id:'about', label:'关于'}
 ];
 let { theme, chooseTheme, startup, startupBusy, chooseStartup, notebookMode, chooseNotebook,
  notebookDelay, chooseDelay, pinned, pinBusy, choosePinned, modifier, dataDir, onopen, onwindows,
  onnew, ondraft, onexit, current = $bindable('general'), searchShortcut, chooseSearch }: {
  theme: Theme; chooseTheme: (value: Theme) => void;
  startup: boolean; startupBusy: boolean; chooseStartup: (value: boolean) => void;
  notebookMode: boolean; chooseNotebook: (value: boolean) => void;
  notebookDelay: number; chooseDelay: (value: number) => void;
  pinned: boolean; pinBusy: boolean; choosePinned: (value: boolean) => void;
  modifier: string; dataDir: string; onopen: (tool: Tool) => void;
  onwindows: () => void; onnew: () => void; ondraft: () => void; onexit: () => void;
  current?: Tab; searchShortcut: SearchShortcut; chooseSearch: (shortcut: SearchShortcut) => void;
 } = $props();
 const id = $props.id();
 let tabList: HTMLDivElement;

 async function tabKey(event: KeyboardEvent) {
  const index = tabs.findIndex(tab => tab.id === current);
  let next: number;
  const forward = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  if (event.key === forward) next = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = (index + tabs.length - 1) % tabs.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.length - 1;
  else return;
  event.preventDefault();
  current = tabs[next].id;
  await tick();
  tabList.querySelector<HTMLElement>('[aria-selected=true]')?.focus();
 }
 const themes: {value:Theme; label:string}[] = [
  {value:'system', label:'跟随系统'}, {value:'light', label:'浅色'}, {value:'dark', label:'深色'}
 ];
</script>

{#snippet toggle(label: string, value: boolean, change: (value:boolean) => void, hint = '', disabled = false)}
 <label class="preference-row">
  <span class="row-copy"><span>{$t(label)}</span>{#if hint}<small>{$t(hint)}</small>{/if}</span>
  <input class="setting-toggle" type="checkbox" aria-label={$t(label)} checked={value} {disabled}
   onchange={event => change(event.currentTarget.checked)}/>
 </label>
{/snippet}
{#snippet action(label: string, perform: () => void, shortcut = '', tool = '')}
 <button class="setting-action" data-settings-tool={tool || undefined} onclick={perform}><span>{$t(label)}</span>
  {#if shortcut}<kbd>{shortcut}</kbd>{:else}<Icon name="chevron" size={15}/>{/if}
 </button>
{/snippet}
<div class="settings">
 <div class="settings-tabs" style:--tab={tabs.findIndex(item=>item.id===current)} role="tablist" aria-label={$t('设置分类')} bind:this={tabList}>
  {#each tabs as tab}
   <button id={id+'-'+tab.id} role="tab" aria-selected={current===tab.id} aria-controls={id+'-page-'+tab.id}
    tabindex={current===tab.id ? 0 : -1} onclick={()=>current=tab.id} onkeydown={tabKey}>{$t(tab.label)}</button>
  {/each}
 </div>
 {#each tabs as tab}
  <div class="settings-page" id={id+'-page-'+tab.id} role="tabpanel" aria-labelledby={id+'-'+tab.id} hidden={current!==tab.id}>
   {#if tab.id==='general'}
    <section><h3>{$t('外观与语言')}</h3>
     <div class="preference-row"><span>{$t('主题')}</span>
      <SelectField label={$t('主题')} value={theme} options={themes.map(o=>({...o,label:$t(o.label)}))}
       onchange={v=>chooseTheme(v as Theme)}/>
     </div>
     <div class="preference-row"><span>{$t('界面语言')}</span>
      <SelectField label={$t('界面语言')} value={$languagePreference}
       options={[{value:'system',label:$t('跟随系统')},...languages.map(language=>({value:language.code,label:language.label}))]}
       onchange={setLanguagePreference}/>
     </div>
    </section>
    <section><h3>{$t('桌面行为')}</h3>
     {@render toggle('开机自启',startup,chooseStartup,'登录后在系统托盘运行。',startupBusy)}
     {@render toggle('主窗口置顶',pinned,choosePinned,'',pinBusy)}
     {@render toggle('笔记本模式',notebookMode,chooseNotebook,'鼠标离开后自动收成悬浮笔记本。')}
     {#if notebookMode}
      <div class="preference-row"><span>{$t('离开多久收起')}</span>
       <SelectField label={$t('自动收起等待时间')} value={String(notebookDelay)}
        options={[{value:'15',label:$t('15 秒')},{value:'30',label:$t('30 秒')},{value:'60',label:$t('1 分钟')}]}
        onchange={v=>chooseDelay(Number(v))}/>
      </div>
     {/if}
    </section>
   {:else if tab.id==='tools'}
    <section><h3>{$t('记录')}</h3>
     {@render action('记一条',onnew,modifier+' N')}
     {@render action('新建引用草稿',ondraft)}
     {@render action('已打开的独立编辑窗口',onwindows)}
    </section>
    <section><h3>{$t('导出与集成')}</h3>
     {@render action('导出模板',()=>onopen('templates'),'','templates')}
     {@render action('Agent 与 MCP',()=>onopen('agents'),'','agents')}
    </section>
   {:else}
    <section><h3>{$t('帮助与更新')}</h3>
     {@render action('使用帮助',()=>onopen('help'),'','help')}
     {@render action('版本与更新',()=>onopen('updates'),'','updates')}
    </section>
    <section><h3>{$t('应用内快捷键')}</h3>
     <div class="preference-row"><span>{$t('搜索快捷键')}</span>
      <SelectField label={$t('搜索快捷键')} value={searchShortcut}
       options={searchShortcuts.map(value=>({value,label:shortcutLabel(value,modifier)}))}
       onchange={value=>chooseSearch(value as SearchShortcut)}/>
     </div>
     <ShortcutList {modifier}/>
    </section>
    <section><h3>{$t('本机')}</h3>
     <Disclosure label={$t('本地存储位置')}><p class="storage-path" dir="auto">{dataDir}</p></Disclosure>
     <button class="setting-action exit-action" onclick={onexit}>{$t('退出 DevPad')}</button>
    </section>
   {/if}
  </div>
 {/each}
</div>

<style>
 .settings{display:flex;flex-direction:column;width:100%;height:100%;--row-pad:4px;max-width:640px;margin-inline:auto;color:var(--text);font-size:14px;line-height:1.5}
 .settings-tabs{position:relative;display:grid;flex:none;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--line)}
 .settings-tabs::after{content:'';position:absolute;pointer-events:none;inset-inline-start:0;bottom:-1px;width:calc(100% / 3);height:2px;background:var(--blue);border-radius:2px;transform:translateX(calc(var(--tab) * 100%));transition:transform 150ms var(--ease-surface)}
 .settings-tabs:dir(rtl)::after{transform:translateX(calc(var(--tab) * -100%))}
 .settings-tabs button{min-width:0;min-height:40px;padding:6px 2px;color:var(--secondary);font-size:14px;font-weight:400;border-radius:4px}
 .settings-tabs button[aria-selected=true]{color:var(--text)}
 .settings-page{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-bottom:12px}
 @media(prefers-reduced-motion:no-preference){.settings-page:not([hidden]){animation:tab-appear 120ms ease-out}@keyframes tab-appear{from{opacity:.55}to{opacity:1}}}
 @media(prefers-reduced-motion:reduce){.settings-tabs::after{transition:none}}
 .settings-page[hidden]{display:none}
 .settings-page section{margin:23px 0 0}
 .settings-page h3{margin:0 0 5px;padding:0 var(--row-pad);font-size:13px;font-weight:500;line-height:20px;color:var(--secondary)}
 .preference-row,.setting-action{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:45px;width:100%;padding:8px var(--row-pad);text-align:start}
 .settings-page section>:is(.preference-row,.setting-action)+:is(.preference-row,.setting-action){border-top:1px solid var(--line)}
 .row-copy{min-width:0;display:grid;gap:3px}
 .row-copy small{font-size:12px;line-height:1.5;color:var(--secondary)}
 .setting-action{border-radius:0;font-size:14px}
 .setting-action :global(svg){transform:rotate(-90deg);color:var(--secondary);flex:none}
 .preference-row :global(.select-field){flex:none;width:min(44%,180px);font-size:14px}
 .setting-toggle{appearance:none;box-sizing:border-box;flex:none;width:34px;height:20px;margin:0 2px 0 0;padding:2px;border:1px solid var(--secondary);border-radius:12px;background:var(--surface);cursor:pointer}
 .setting-toggle::before{content:'';display:block;width:14px;height:14px;border-radius:50%;background:var(--secondary);transition:transform var(--motion-feedback)}
 .setting-toggle:checked{background:var(--blue);border-color:var(--blue)}
 .setting-toggle:checked::before{transform:translateX(14px);background:#fff}
 .setting-toggle:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
 .setting-toggle:disabled{opacity:.5}
 .setting-action kbd{font:inherit;font-size:12px;color:var(--secondary);white-space:nowrap}
 .exit-action{color:var(--danger)}
 @media(forced-colors:active){.setting-toggle{appearance:auto}}
</style>
