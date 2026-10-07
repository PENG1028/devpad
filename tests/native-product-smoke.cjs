// Isolated, hidden Windows app. Never connects to the daily app or system pointer.
const {chromium}=require('@playwright/test');
const {spawn}=require('node:child_process');const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict');
const exe=process.env.DEVPAD_TEST_EXE||path.resolve('src-tauri/target/x86_64-pc-windows-msvc/release/devpad.exe');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'devpad-native-smoke-'));let app,browser,port;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function start(){port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});app=spawn(exe,['--autostart'],{windowsHide:true,stdio:'ignore',env:{...process.env,DEVPAD_DATA_DIR:root,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});for(let i=0;i<120;i++){if(app.exitCode!==null)throw Error('Isolated app exited before startup');try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await delay(250);}}if(!browser)throw Error('Isolated WebView startup timeout');let main;for(let i=0;i<100;i++){main=browser.contexts().flatMap(c=>c.pages()).find(p=>!new URL(p.url()).searchParams.has('window')&&p.url().includes('tauri'));if(main){try{const loaded=await invoke(main,'load');assert.equal(path.resolve(loaded.dataDir),path.resolve(root));return main;}catch{}}await delay(100);}throw Error('Isolated main page not ready');}
async function invoke(page,cmd,args={}){return page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});}
async function auxiliary(main,kind,payload={}){const label=await invoke(main,'open_aux',{kind,payload});for(let i=0;i<100;i++){const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('instance='+label));if(page){await page.locator('body').waitFor();return page;}await delay(100);}throw Error('Missing '+kind);}
async function stop(){if(browser){await browser.close();browser=null;}if(app&&app.exitCode===null){app.kill();await new Promise(resolve=>app.once('exit',resolve));}await delay(400);}
(async()=>{try {
 let main=await start();assert.ok(['develop','stable'].includes((await invoke(main,'update_info')).channel));
 const help=await auxiliary(main,'help');await help.getByRole('region',{name:'帮助'}).waitFor();
 const updates=await auxiliary(main,'updates');await updates.getByRole('button',{name:'检查并更新',exact:true}).waitFor();
 const templates=await auxiliary(main,'templates');await templates.getByRole('button',{name:'保存模板'}).waitFor();
 const agents=await auxiliary(main,'agents');await agents.getByRole('textbox',{name:'MCP 配置'}).waitFor();assert.ok((await agents.getByRole('textbox',{name:'MCP 配置'}).inputValue()).includes('--mcp'));
 const editor=await auxiliary(main,'editor',{projectId:'inbox'});await editor.locator('.composer textarea').fill('关闭之后也要恢复的草稿\n带上完整正文');await editor.getByText('草稿已保存',{exact:true}).waitFor();
 // Simulate process interruption after autosave; the daily application is untouched.
 await stop();main=await start();const drafts=await invoke(main,'list_drafts');assert.equal(drafts.length,1);assert.equal(drafts[0].payload.text,'关闭之后也要恢复的草稿\n带上完整正文');
 const restored=await auxiliary(main,'editor',{projectId:'inbox',draft:drafts[0].payload,draftId:drafts[0].id});await restored.locator('.composer textarea').waitFor();assert.equal(await restored.locator('.composer textarea').inputValue(),drafts[0].payload.text);
 await restored.getByRole('button',{name:'保存',exact:true}).click();for(let i=0;i<100;i++){const loaded=await invoke(main,'load');if(loaded.entries.length){assert.equal(loaded.entries[0].text,drafts[0].payload.text);assert.equal(loaded.entries[0].type,'Note');break;}if(i===99)throw Error('Restored draft not saved');await delay(100);}
 assert.equal((await invoke(main,'list_drafts')).length,0);
 console.log('PASS hidden native app: new window permissions, help, update info, templates, MCP config, autosave, interrupted-process recovery, normal note save');
}finally{await stop();const resolved=fs.realpathSync(root),temp=fs.realpathSync(os.tmpdir());assert.ok(resolved.startsWith(temp+path.sep)&&path.basename(resolved).startsWith('devpad-native-smoke-'));fs.rmSync(resolved,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
