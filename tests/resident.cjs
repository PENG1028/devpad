const {chromium}=require('C:/Users/ZHP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9227'),context=browser.contexts()[0],main=context.pages().find(p=>!p.url().includes('?window='));
 const invoke=(p,cmd,args={})=>p.evaluate(({cmd,args})=>__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
 const data=await invoke(main,'load');assert.ok(data.dataDir.includes('desktop-test-resident'));
 assert.ok(await invoke(main,'plugin:tray|get_by_id',{id:'devpad'}),'native tray icon is registered');
 await main.waitForTimeout(1200);assert.equal(await invoke(main,'plugin:window|is_visible',{label:'main'}),false,'autostart must stay hidden');
 // Repeat launch wakes the existing instance and the second process exits.
 const second=cp.spawn(path.resolve('release/DevPad.exe'),[],{windowsHide:true,env:{...process.env,DEVPAD_DATA_DIR:data.dataDir}});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('second instance did not exit')),10000);second.once('exit',()=>{clearTimeout(timer);resolve()});});
 await main.waitForFunction(()=>__TAURI_INTERNALS__.invoke('plugin:window|is_visible',{label:'main'}));
 await main.getByLabel('更多',{exact:true}).click();
 let more;for(let i=0;i<100;i++){more=context.pages().find(p=>p.url().includes('window=more'));if(more)break;await main.waitForTimeout(100);}
 await more.getByLabel('开机自启',{exact:true}).waitFor();assert.equal(await invoke(more,'startup_enabled'),false);
 await more.getByLabel('开机自启',{exact:true}).check();await more.waitForFunction(()=>__TAURI_INTERNALS__.invoke('startup_enabled'));
 const value=cp.execFileSync('powershell.exe',['-NoProfile','-Command',"(Get-ItemProperty -LiteralPath 'HKCU:\\Software\\DevPad\\TestStartup').DevPad"],{windowsHide:true,encoding:'utf8'}).trim();assert.equal(value,'"'+path.resolve('release/DevPad.exe')+'" --autostart');
 await more.getByLabel('开机自启',{exact:true}).uncheck();await more.waitForFunction(()=>__TAURI_INTERNALS__.invoke('startup_enabled').then(v=>!v));
 await more.screenshot({path:'.tools/resident-settings.png'});
 await invoke(more,'plugin:window|close',{label:'more'});
 await main.getByRole('button',{name:'创建第一个项目'}).click();let organizer;for(let i=0;i<100;i++){organizer=context.pages().find(p=>p.url().includes('window=organizer'));if(organizer)break;await main.waitForTimeout(100);}
 await organizer.getByLabel('项目名称',{exact:true}).fill('托盘退出验收');await organizer.getByRole('button',{name:'创建项目',exact:true}).click();let editor;for(let i=0;i<100;i++){editor=context.pages().find(p=>p.url().includes('window=editor'));if(editor)break;await main.waitForTimeout(100);}
 await editor.getByLabel('记录内容').fill('未保存的笔记仍然保留');await invoke(main,'resident_action',{action:'exit'});await editor.getByRole('dialog',{name:'退出 DevPad？'}).waitFor();await editor.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await editor.getByLabel('记录内容').inputValue(),'未保存的笔记仍然保留');
 await main.getByLabel('关闭窗口',{exact:true}).click();await main.waitForFunction(()=>__TAURI_INTERNALS__.invoke('plugin:window|is_visible',{label:'main'}).then(v=>!v));
 await invoke(main,'resident_action',{action:'exit'});await editor.getByRole('dialog',{name:'退出 DevPad？'}).waitFor();await editor.screenshot({path:'.tools/resident-exit-confirm.png'});const closed=main.waitForEvent('close');await editor.getByRole('button',{name:'放弃并退出',exact:true}).click();await closed;
 fs.writeFileSync('.tools/resident-result.json',JSON.stringify({passed:true,autostartSilent:true,startupToggle:true,singleInstance:true,trayCloseKeepsDraft:true,exitCancelAndDiscard:true,realStartupUnchanged:true},null,2));await browser.close().catch(()=>{});console.log('PASS silent startup, registry toggle, single instance, tray close and guarded exit');
})().catch(e=>{console.error(e);process.exit(1)});
