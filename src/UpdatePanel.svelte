<script lang="ts">
 import {onMount} from 'svelte';
 import {invoke,isTauri} from '@tauri-apps/api/core';
 import {listen} from '@tauri-apps/api/event';
 import SelectField from './SelectField.svelte';
 let info=$state({version:'',channel:'develop',platform:'',repository:'PENG1028/devpad'});
 let pending=$state<{version:string;notes?:string}|null>(null),busy=$state(false),message=$state(''),error=$state('');
 let downloaded=$state(0),total=$state(0);
 onMount(()=>{if(!isTauri()){info.version='浏览器预览';return;}let disposed=false,off:(()=>void)|undefined;void invoke<typeof info>('update_info').then(value=>info=value).catch(e=>error=String(e));void listen<{downloaded:number;total?:number}>('update-progress',e=>{downloaded=e.payload.downloaded;total=e.payload.total||0;message='正在下载并验证更新…';}).then(stop=>{if(disposed)stop();else off=stop;});return()=>{disposed=true;off?.();};});
 async function channel(value:string){if(busy)return;error='';try{await invoke('set_update_channel',{channel:value});info.channel=value;pending=null;message='更新通道已切换';}catch(e){error=String(e);}}
 async function check(install=false){if(busy)return;busy=true;error='';message='正在检查更新…';downloaded=0;total=0;try{pending=await invoke<typeof pending>('check_update');if(!pending){message='当前已是该通道的最新版本';return;}message=`发现 ${pending.version}`;if(install){message='正在保存草稿并准备更新…';await invoke('install_update');message='更新已安装，正在重启…';}}catch(e){error=String(e);message='';}finally{busy=false;}}
 async function install(){if(!pending||busy)return;busy=true;error='';message='正在保存草稿并准备更新…';try{await invoke('install_update');message='更新已安装，正在重启…';}catch(e){error=String(e);message='';}finally{busy=false;}}
</script>
<section class="update-panel" aria-label="应用更新">
 <h3>版本与更新</h3>
 <p>DevPad {info.version} <span class="secondary">{info.platform}</span></p>
 <label>更新通道<SelectField label="更新通道" disabled={busy} value={info.channel} onchange={channel} options={[{value:'develop',label:'开发版 · 日常测试'},{value:'stable',label:'稳定版'}]}/></label>
 <p class="secondary">更新沿用安装位置、快捷方式和本地笔记。安装前保存草稿并备份数据库，完成后重新打开。</p>
 <div class="update-actions"><button class="blue-button" disabled={busy||!isTauri()} onclick={()=>pending?install():check(true)}>{busy?'正在更新…':pending?`更新到 ${pending.version}`:'检查并更新'}</button><button disabled={busy||!isTauri()} onclick={()=>check()}>仅检查</button></div>
 {#if message}<p role="status">{message}</p>{/if}
 {#if total}<progress value={downloaded} max={total} aria-label="更新下载进度"></progress><p class="secondary">{(downloaded/1024/1024).toFixed(1)} / {(total/1024/1024).toFixed(1)} MB</p>{/if}
 {#if error}<p class="update-error" role="alert">{error}</p>{/if}
 {#if pending?.notes}<details><summary>更新内容</summary><pre>{pending.notes}</pre></details>{/if}
</section>
<style>.update-panel label{display:flex;align-items:center;gap:12px}.update-actions{display:flex;gap:8px;flex-wrap:wrap}.update-panel p{font-size:13px;line-height:1.6}.update-error{color:var(--danger,#e66666)}progress{width:100%}pre{white-space:pre-wrap;font:inherit;font-size:12px}</style>
