<script lang="ts">
 import { t } from './i18n';
 import {onMount} from 'svelte';
 import {invoke,isTauri} from '@tauri-apps/api/core';
 import {listen} from '@tauri-apps/api/event';
 import ConfirmDialog from './ConfirmDialog.svelte';
 import Disclosure from './Disclosure.svelte';
 import Icon from './Icon.svelte';
 type Task={id:string;state:string;owner?:string;instructions:string;records:{text:string}[];result?:{text:string;completedAt:string}};
 let tasks:Task[]=$state([]),config=$state(''),error=$state(''),notice=$state(''),confirm:ConfirmDialog;
 const names:Record<string,string>={available:'可领取',claimed:'处理中',completed:'已完成',cancelled:'已撤回'};
 async function refresh(){try{tasks=await invoke<Task[]>('list_tasks');error='';}catch(e){error=String(e);}}
 async function cancel(id:string){if(!await confirm.ask('撤回后，当前 agent 的领取凭证立即失效。','撤回任务','撤回任务？','保留'))return;try{await invoke('cancel_task',{id});await refresh();}catch(e){error=String(e);}}
 onMount(()=>{let stopped=false,off:()=>void=()=>{};const timer=setInterval(()=>void refresh(),15000);void refresh();void invoke('mcp_config').then(c=>config=JSON.stringify(c,null,2)).catch(e=>error=String(e));if(isTauri())void listen('db-changed',()=>void refresh()).then(f=>{if(stopped)f();else off=f;});return()=>{stopped=true;clearInterval(timer);off();};});
</script>
<section class="agent-panel" aria-label={$t('Agent 与 MCP')}>
 <h3>{$t('连接 Agent')}</h3>
 <p>{$t('将下面的配置加入支持本地 MCP 的客户端。无需另外安装 Node，也可以在笔记窗口关闭时使用。客户端中启用 DevPad 后，agent 可以读取笔记、图片，领取与完成已发布的任务。')}</p>
 <p>{$t('连接后可访问本机全部笔记；尚未发布的笔记不会出现在可领取任务里。更新后请重连 MCP 客户端。')}</p>
 <Disclosure label={$t('MCP 配置')}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users scroll this code region.) -->
  <pre class="config-code" dir="ltr" tabindex="0" role="region" aria-label={$t('MCP 配置')}><code>{config}</code></pre></Disclosure>
 <button class="config-copy" disabled={!config} onclick={async()=>{try{await invoke('copy_text',{text:config});notice='配置已复制';}catch(e){error=String(e);}}}><Icon name="copy" size={15}/>{$t('复制 MCP 配置')}</button>
 <h3>{$t('已发布的任务')}</h3>
 <p>{$t('从笔记菜单或多选工具栏点击“发布任务”。发布内容快照后，后续编辑源笔记不会悄悄改变任务。')}</p>
 {#each tasks as task(task.id)}<article class="task"><header><strong>{$t(names[task.state]||task.state)}</strong>{#if task.owner}<span>{task.owner}</span>{/if}<span class="spacer"></span>{#if ['available','claimed'].includes(task.state)}<button onclick={()=>cancel(task.id)}>{$t('撤回')}</button>{/if}</header><p>{task.instructions||task.records[0]?.text.slice(0,100)||$t('图片任务')}</p><small>{task.id}</small>{#if task.result}<Disclosure label={$t('查看完成结果')}><pre>{task.result.text}</pre></Disclosure>{/if}</article>{:else}<p>{$t('还没有发布任务。')}</p>{/each}
 {#if error}<p role="alert">{error}</p>{/if}{#if notice}<p role="status">{$t(notice)}</p>{/if}
</section>
<ConfirmDialog bind:this={confirm}/>
<style>
 .config-code{direction:ltr;text-align:left;max-height:12rem;overflow:auto;margin:0;padding:12px;background:var(--surface);border:1px solid var(--line);border-radius:7px;font:12px/1.6 ui-monospace,Consolas,monospace;user-select:text}
 .config-copy{margin-block:6px 0;color:var(--blue)}
 .task{display:grid;gap:5px;border:1px solid var(--line);padding:12px;border-radius:8px;margin:8px 0}
 .task header{display:flex;gap:12px;align-items:center}.task small{color:var(--secondary);font-size:11px}.task pre{white-space:pre-wrap}
</style>
