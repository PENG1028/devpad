<script lang="ts">
 import { tick } from 'svelte';
 import Icon from './Icon.svelte';
 import SelectField from './SelectField.svelte';
 import { languages, languagePreference, setLanguagePreference, t } from './i18n';

 type Theme = 'light' | 'dark' | 'system';
 type Tool = 'templates' | 'agents' | 'help' | 'updates';
 type Tab = 'general' | 'tools' | 'about';
 const tabs: {id: Tab; label: string}[] = [
  {id:'general', label:'通用'}, {id:'tools', label:'工具'}, {id:'about', label:'关于'}
 ];
 let { theme, chooseTheme, startup, startupBusy, chooseStartup, notebookMode, chooseNotebook,
  notebookDelay, chooseDelay, pinned, pinBusy, choosePinned, modifier, dataDir, onopen, onwindows,
  onnew, ondraft, onexit }: {
  theme: Theme; chooseTheme: (value: Theme) => void;
  startup: boolean; startupBusy: boolean; chooseStartup: (value: boolean) => void;
  notebookMode: boolean; chooseNotebook: (value: boolean) => void;
  notebookDelay: number; chooseDelay: (value: number) => void;
  pinned: boolean; pinBusy: boolean; choosePinned: (value: boolean) => void;
  modifier: string; dataDir: string; onopen: (tool: Tool) => void;
  onwindows: () => void; onnew: () => void; ondraft: () => void; onexit: () => void;
 } = $props();
 const id = $props.id();
 let current = $state<Tab>('general');
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
{#snippet action(label: string, perform: () => void, shortcut = '')}
 <button class="setting-action" onclick={perform}><span>{$t(label)}</span>
  {#if shortcut}<kbd>{shortcut}</kbd>{:else}<Icon name="chevron" size={15}/>{/if}
 </button>
{/snippet}
<div class="settings">
 <div class="settings-tabs" role="tablist" aria-label={$t('设置分类')} bind:this={tabList}>
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
     {@render action('导出模板',()=>onopen('templates'))}
     {@render action('Agent 与 MCP',()=>onopen('agents'))}
    </section>
   {:else}
    <section><h3>{$t('帮助与更新')}</h3>
     {@render action('使用帮助',()=>onopen('help'))}
     {@render action('版本与更新',()=>onopen('updates'))}
    </section>
    <section><h3>{$t('应用内快捷键')}</h3>
     <dl class="key-list">
      {#each [['新建 / 继续输入',modifier+' N'],['保存笔记',modifier+' Enter'],['搜索',modifier+' F'],['全选筛选结果',modifier+' A'],['切换类型','Alt 1–6'],['连续选择',$t('Shift + 点击')]] as [label,keys]}
       <div><dt>{$t(label)}</dt><dd><kbd>{keys}</kbd></dd></div>
      {/each}
     </dl>
    </section>
    <section><h3>{$t('本机')}</h3>
     <details class="data-location"><summary>{$t('本地存储位置')}</summary><p>{dataDir}</p></details>
     <button class="setting-action exit-action" onclick={onexit}>{$t('退出 DevPad')}</button>
    </section>
   {/if}
  </div>
 {/each}
</div>

<style>
 .settings{--row-pad:4px;max-width:640px;margin-inline:auto;color:var(--text);font-size:14px;line-height:1.5}
 .settings-tabs{position:sticky;top:0;z-index:1;display:flex;gap:18px;padding-inline:var(--row-pad);border-bottom:1px solid var(--line);background:var(--bg)}
 .settings-tabs button{position:relative;min-height:40px;padding:6px 2px;color:var(--secondary);font-weight:400;border-radius:3px}
 .settings-tabs button[aria-selected=true]{color:var(--text)}
 .settings-tabs button[aria-selected=true]::after{position:absolute;content:'';inset:auto 0 -1px;height:2px;background:var(--blue);border-radius:2px}
 .settings-page[hidden]{display:none}
 .settings-page section{margin:23px 0 0}
 .settings-page h3{margin:0 0 5px;padding:0 var(--row-pad);font-size:13px;font-weight:500;line-height:20px;color:var(--secondary)}
 .preference-row,.setting-action,.key-list>div,.data-location{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:45px;width:100%;padding:8px var(--row-pad);text-align:start}
 .settings-page section>:is(.preference-row,.setting-action,.data-location)+:is(.preference-row,.setting-action){border-top:1px solid var(--line)}
 .row-copy{min-width:0;display:grid;gap:3px}
 .row-copy small,.data-location p{font-size:12px;line-height:1.5;color:var(--secondary)}
 .setting-action{border-radius:0;font-size:14px}
 .setting-action :global(svg){transform:rotate(-90deg);color:var(--secondary);flex:none}
 .preference-row :global(.select-field){flex:none;width:min(44%,180px);font-size:14px}
 .setting-toggle{appearance:none;box-sizing:border-box;flex:none;width:34px;height:20px;margin:0 2px 0 0;padding:2px;border:1px solid var(--secondary);border-radius:12px;background:var(--surface);cursor:pointer}
 .setting-toggle::before{content:'';display:block;width:14px;height:14px;border-radius:50%;background:var(--secondary);transition:transform var(--motion-feedback)}
 .setting-toggle:checked{background:var(--blue);border-color:var(--blue)}
 .setting-toggle:checked::before{transform:translateX(14px);background:#fff}
 .setting-toggle:focus-visible,.data-location summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
 .setting-toggle:disabled{opacity:.5}
 .key-list,.key-list dd{margin:0}
 .key-list>div{min-height:33px;padding-block:5px}
 .key-list kbd,.setting-action kbd{font:inherit;font-size:12px;color:var(--secondary);white-space:nowrap}
 .data-location{display:block}.data-location summary{cursor:pointer}.data-location p{overflow-wrap:anywhere;margin:8px 0}
 .exit-action{color:var(--danger)}
 @media(forced-colors:active){.setting-toggle{appearance:auto}}
</style>
