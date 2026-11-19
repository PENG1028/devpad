// Isolated, hidden Windows app. Never connects to the daily app or system pointer.
const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict');
const exe=process.env.DEVPAD_TEST_EXE||path.resolve('src-tauri/target/x86_64-pc-windows-msvc/release/devpad.exe');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'devpad-native-smoke-'));let app,browser,port;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function start(){port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});app=spawn(exe,['--autostart'],{windowsHide:true,stdio:'ignore',env:{...process.env,DEVPAD_DATA_DIR:root,DEVPAD_TEST_STARTUP:"1",WEBVIEW2_USER_DATA_FOLDER:path.join(root,"webview"),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});for(let i=0;i<120;i++){if(app.exitCode!==null)throw Error('Isolated app exited before startup');try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await delay(250);}}if(!browser)throw Error('Isolated WebView startup timeout');let main;for(let i=0;i<100;i++){main=browser.contexts().flatMap(c=>c.pages()).find(p=>!new URL(p.url()).searchParams.has('window')&&p.url().includes('tauri'));if(main){try{const loaded=await invoke(main,'load');assert.equal(path.resolve(loaded.dataDir),path.resolve(root));return main;}catch{}}await delay(100);}throw Error('Isolated main page not ready');}
async function invoke(page,cmd,args={}){return page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});}
async function auxiliary(main,kind,payload={}){const label=await invoke(main,'open_aux',{kind,payload});for(let i=0;i<100;i++){const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('instance='+label));if(page){await page.locator('body').waitFor();return page;}await delay(100);}throw Error('Missing '+kind);}
async function stop(){if(browser){await browser.close();browser=null;}if(app&&app.exitCode===null){app.kill();await new Promise(resolve=>app.once('exit',resolve));}await delay(400);}
(async()=>{try {
 let main=await start();assert.ok(['develop','stable'].includes((await invoke(main,'update_info')).channel));
 const settings=await auxiliary(main,'more');
 const tap=control=>control.evaluate(node=>node.click());
 const language=settings.locator('.settings-page:not([hidden]) [role=combobox]').nth(1);
 const setLanguage=async name=>{await tap(language);await tap(settings.getByRole('option',{name,exact:true}));};
 await setLanguage('English');
 await main.waitForFunction(()=>document.documentElement.lang==='en');
 await settings.waitForFunction(async()=>await window.__TAURI_INTERNALS__.invoke('get_locale')==='en');
 await tap(settings.getByRole('checkbox',{name:'Keep the main window on top'}));
 await main.waitForFunction(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|is_always_on_top',{label:'main'}));
 await tap(settings.getByRole('checkbox',{name:'Keep the main window on top'}));
 await main.waitForFunction(async()=>!(await window.__TAURI_INTERNALS__.invoke('plugin:window|is_always_on_top',{label:'main'})));
 for(const item of require('../src/locales/registry.json')){
  await setLanguage(item.label);
  await settings.waitForFunction(async code=>await window.__TAURI_INTERNALS__.invoke('get_locale')===code,item.code);
  await main.waitForFunction(code=>document.documentElement.lang===code,item.code);
  const dictionary=item.code==='zh-CN'?{}:require('../src/locales/messages/'+item.code+'.json');
  const invalid='请输入 1–200 字节的项目名称';
  const result=await settings.evaluate(()=>window.__TAURI_INTERNALS__.invoke('create_project',{name:''}).then(()=>null,String));
  assert.equal(result,dictionary[invalid]??invalid);
  const titleKey='设置 · DevPad';
  await settings.waitForFunction(async title=>(await window.__TAURI_INTERNALS__.invoke('plugin:window|title',{label:'more'}))===title,dictionary[titleKey]??titleKey);
 }
 await setLanguage('简体中文');
 await main.waitForFunction(()=>document.documentElement.lang==='zh-CN');
 await settings.waitForFunction(async()=>await window.__TAURI_INTERNALS__.invoke('get_locale')==='zh-CN');
 const help=await auxiliary(main,'help');await help.getByRole('region',{name:'帮助'}).waitFor();
 const updates=await auxiliary(main,'updates');await updates.getByRole('button',{name:'检查并更新',exact:true}).waitFor();
 const templates=await auxiliary(main,'templates');await templates.getByRole('button',{name:'保存模板'}).waitFor();
 const agents=await auxiliary(main,'agents');await agents.getByRole('textbox',{name:'MCP 配置'}).waitFor();assert.ok((await agents.getByRole('textbox',{name:'MCP 配置'}).inputValue()).includes('--mcp'));
 const editor=await auxiliary(main,'editor',{projectId:'inbox'});await editor.locator('.composer textarea').fill('关闭之后也要恢复的草稿\n带上完整正文');await editor.getByText('草稿已保存',{exact:true}).waitFor();
 // Simulate process interruption after autosave; the daily application is untouched.
 await stop();main=await start();const drafts=await invoke(main,'list_drafts');assert.equal(await invoke(main,'get_locale'),'zh-CN');assert.equal(drafts.length,1);assert.equal(drafts[0].payload.text,'关闭之后也要恢复的草稿\n带上完整正文');
 const restored=await auxiliary(main,'editor',{projectId:'inbox',draft:drafts[0].payload,draftId:drafts[0].id});await restored.locator('.composer textarea').waitFor();assert.equal(await restored.locator('.composer textarea').inputValue(),drafts[0].payload.text);
 await restored.getByRole('button',{name:'保存',exact:true}).click();for(let i=0;i<100;i++){const loaded=await invoke(main,'load');if(loaded.entries.length){assert.equal(loaded.entries[0].text,drafts[0].payload.text);assert.equal(loaded.entries[0].type,'Note');break;}if(i===99)throw Error('Restored draft not saved');await delay(100);}
 assert.equal((await invoke(main,'list_drafts')).length,0);
 await main.getByRole('button',{name:'记一条',exact:false}).evaluate(button=>button.click());
 const inline=main.getByRole('textbox',{name:'记录正文'});
 await inline.fill('主窗草稿在进程中断后仍可恢复');
 await main.getByText('草稿已保存',{exact:true}).waitFor();
 assert.equal((await invoke(main,'load')).entries.length,1);
 await stop();main=await start();
 await main.getByRole('button',{name:'继续写草稿',exact:false}).evaluate(button=>button.click());
 assert.equal(await main.getByRole('textbox',{name:'记录正文'}).inputValue(),'主窗草稿在进程中断后仍可恢复');
 await main.getByRole('button',{name:'保存',exact:true}).evaluate(button=>button.click());
 await main.locator('article').getByText('主窗草稿在进程中断后仍可恢复',{exact:true}).waitFor();
 assert.equal(await main.getByRole('textbox',{name:'记录正文'}).inputValue(),'');
 await stop();main=await start();
 await main.getByRole('button',{name:'记一条',exact:false}).waitFor();
 assert.equal((await invoke(main,'load')).entries.length,2);
 assert.equal((await invoke(main,'list_drafts')).length,0);

 const other=await invoke(main,'create_project',{name:'原生导航验收'});
 await main.reload();
 const click=locator=>locator.evaluate(button=>button.click());
 const picker=main.locator('.project-picker');
 await click(picker);
 const navigation=main.getByRole('dialog',{name:'项目',exact:true});
 await click(navigation.getByRole('button',{name:'收件箱',exact:true}));
 await click(main.getByRole('button',{name:'记一条'}));
 const currentEditor=main.getByRole('textbox',{name:'记录正文'});
 await currentEditor.fill('留在收件箱的输入');
 await click(navigation.getByRole('button',{name:'原生导航验收',exact:true}));
 await main.getByText('存到 收件箱',{exact:true}).waitFor();
 await click(main.getByRole('button',{name:'保存',exact:true}));
 await main.waitForFunction(()=>document.querySelector('#entry-text')?.value==='');
 assert.equal((await picker.innerText()).trim(),'原生导航验收');
 await currentEditor.fill('新项目中的记录');
 await click(main.getByRole('button',{name:'保存',exact:true}));
 await main.locator('article').getByText('新项目中的记录',{exact:true}).waitFor();
 const saved=(await invoke(main,'load')).entries;
 assert.equal(saved.find(note=>note.text==='留在收件箱的输入').projectId,'inbox');
 assert.equal(saved.find(note=>note.text==='新项目中的记录').projectId,other.id);
 assert.equal(await picker.getAttribute('aria-expanded'),'true');
 await click(navigation.getByRole('button',{name:'收起项目列表'}));
 await navigation.waitFor({state:'hidden'});
 console.log('PASS hidden native app: draft recovery, persistent navigation, project changes and saved ownership');
}finally{await stop();const resolved=fs.realpathSync(root),temp=fs.realpathSync(os.tmpdir());assert.ok(resolved.startsWith(temp+path.sep)&&path.basename(resolved).startsWith('devpad-native-smoke-'));fs.rmSync(resolved,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
