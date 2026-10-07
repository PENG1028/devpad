// Native acceptance: launch an isolated build with DEVPAD_DATA_DIR containing 78F1BC58.
const {chromium}=require('C:/Users/ZHP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path');
const clipboard=script=>cp.execFileSync('powershell.exe',['-NoProfile','-STA','-Command','Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [Console]::OutputEncoding=[Text.Encoding]::UTF8; '+script],{windowsHide:true,encoding:'utf8',env:{...process.env,DEVPAD_TEST_IMAGE:path.resolve('.tools/redesign-fixture.png')}});
const port=process.env.DEVPAD_TEST_PORT||'9238';
const invoke=(p,cmd,args={})=>p.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port),context=browser.contexts()[0];
 context.setDefaultTimeout(10000);const errors=[];const watch=p=>p.on('pageerror',e=>errors.push(e.message));context.pages().forEach(watch);context.on('page',watch);
 const main=context.pages().find(p=>!p.url().includes('?window='));await main.getByRole('button',{name:'多选',exact:true}).waitFor();
 const data=await invoke(main,'load');assert.ok(data.dataDir.includes('78F1BC58'));assert.equal(data.entries.length,0,'Use fresh isolated data');
 const a=await invoke(main,'create_project',{name:'项目 A'}),b=await invoke(main,'create_project',{name:'项目 B'});
 const attachment=await invoke(main,'add_image',{name:'测试.png',data:fs.readFileSync('.tools/redesign-fixture.png').toString('base64')});
 const notes=Array.from({length:20},(_,i)=>({id:'batch78-'+i,projectId:a.id,type:i===0?'Draft':'Note',text:'记录 '+i+'\n'+(i===0?'长文本内容。'.repeat(250):'独立笔记'),createdAt:new Date(1700000000000+i*1000).toISOString(),updatedAt:new Date().toISOString(),tags:['测试'],attachments:i===0?[attachment]:[],references:i===0?['batch78-1']:[],status:'Open'}));
 for(const entry of notes)await invoke(main,'save_entry',{entry});
 const refresh=()=>invoke(main,'plugin:event|emit',{event:'db-changed',payload:null});await refresh();await main.locator('article').first().waitFor();
 async function win(label){for(let i=0;i<100;i++){const p=context.pages().find(p=>p.url().includes('instance='+label));if(p){await p.locator('.aux-titlebar').waitFor();await p.waitForFunction(()=>!document.body.innerText.includes('正在读取'));return p;}await sleep(100);}throw Error('Missing window '+label);}
 async function editor(projectId,entry){const label=await invoke(main,'open_aux',{kind:'editor',payload:{projectId,...(entry?{entry}:{})}});const p=await win(label);await p.getByLabel('记录内容').waitFor();return {p,label};}
 async function emitAction(action,data){await invoke(main,'plugin:event|emit_to',{target:{kind:'WebviewWindow',label:'main'},event:'main-action',payload:{action,data}});}
 const session={project:a,selected:[notes[0].id],records:[notes[0],notes[1]],batch:'78F1BC58'};
 const deliveryLabel=await invoke(main,'open_aux',{kind:'delivery',payload:{session}}),delivery=await win(deliveryLabel);
 const preview=delivery.getByLabel('Agent 提示词预览');await preview.waitFor();const original=await preview.inputValue();assert.ok(original.includes('78F1BC58'));assert.ok(original.includes('记录 02'));
 const secondLabel=await invoke(main,'open_aux',{kind:'delivery',payload:{session:{project:a,selected:[notes[2].id],records:[notes[2]],batch:'11112222'}}}),secondDelivery=await win(secondLabel);const secondPreview=secondDelivery.getByLabel('Agent 提示词预览');await secondPreview.waitFor();const secondOriginal=await secondPreview.inputValue();assert.notEqual(secondLabel,deliveryLabel);
 await delivery.getByRole('button',{name:/复制图片文件/}).click();await delivery.getByText('已复制 1 张图片文件',{exact:true}).waitFor();
 await emitAction('project',{id:b.id});await main.getByRole('button',{name:'切换项目'}).filter({hasText:'项目 B'}).waitFor();
 const editors=[];for(let i=0;i<5;i++){const e=await editor(i%2?a.id:b.id);await e.p.getByLabel('记录内容').fill('独立草稿 '+i);editors.push(e);}
 assert.equal(new Set(editors.map(e=>e.label)).size,5);assert.equal(await preview.inputValue(),original);
 for(let i=0;i<5;i++)assert.equal(await editors[i].p.getByLabel('记录内容').inputValue(),'独立草稿 '+i);
 // Native bitmap and text pastes affect only the active editor, exactly once.
 clipboard('$img=[System.Drawing.Image]::FromFile($env:DEVPAD_TEST_IMAGE); [System.Windows.Forms.Clipboard]::SetImage($img); $img.Dispose()');
 await editors[4].p.getByLabel('记录内容').focus();await editors[4].p.keyboard.press('Control+v');await editors[4].p.locator('.attachment').waitFor();assert.equal(await editors[4].p.locator('.attachment').count(),1);assert.equal(await editors[3].p.locator('.attachment').count(),0);assert.equal(await main.locator('.composer').count(),0);
 await delivery.getByRole('heading',{name:'交给 Agent',exact:true}).click();await delivery.keyboard.press('Control+v');assert.equal((await invoke(main,'editor_windows')).length,5);assert.equal(await preview.inputValue(),original);
 await editors[3].p.locator('input[type=file]').setInputFiles({name:'invalid.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')});await editors[3].p.getByRole('alert').waitFor();assert.equal(await editors[3].p.getByLabel('记录内容').inputValue(),'独立草稿 3');assert.equal(await editors[3].p.locator('.attachment').count(),0);await editors[3].p.getByLabel('关闭提示',{exact:true}).click();
 await editors[3].p.getByLabel('所属项目').evaluate(select=>{const option=new Option('已删除项目','missing-project');select.add(option);select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));});await editors[3].p.keyboard.press('Control+Enter');await editors[3].p.getByText('目标项目不存在，请重新选择所属项目',{exact:true}).waitFor();assert.equal(await editors[3].p.getByLabel('记录内容').inputValue(),'独立草稿 3');assert.equal((await invoke(main,'load')).entries.length,20);await editors[3].p.getByLabel('所属项目').selectOption(a.id);await editors[3].p.getByLabel('关闭提示',{exact:true}).click();
 const existing=await editor(a.id,notes[0]);await existing.p.getByLabel('记录内容').fill('修改后迁移 '+notes[0].text);
 assert.equal((await editor(a.id,notes[0])).label,existing.label);assert.ok((await existing.p.getByLabel('记录内容').inputValue()).startsWith('修改后迁移'));
 // Related updates notify without changing the snapshot; unrelated updates do neither.
 await invoke(main,'save_entry',{entry:{...notes[2],text:'无关修改'}});await refresh();await secondDelivery.locator('.source-warning').waitFor();assert.equal(await delivery.locator('.source-warning').count(),0);assert.equal(await secondPreview.inputValue(),secondOriginal);
 await existing.p.getByLabel('所属项目',{exact:true}).selectOption(b.id);await existing.p.keyboard.press('Control+Enter');await existing.p.getByText('已保存到 项目 B',{exact:true}).waitFor();await delivery.locator('.source-warning').waitFor();
 assert.equal(await preview.inputValue(),original);const moved=(await invoke(main,'load')).entries.find(e=>e.id===notes[0].id);assert.equal(moved.projectId,b.id);assert.deepEqual(moved.references,[notes[1].id]);assert.equal(moved.attachments.length,1);
 const reopened=await editor(b.id,moved);assert.notEqual(reopened.label,existing.label);assert.ok((await reopened.p.getByLabel('记录内容').inputValue()).startsWith('修改后迁移'));
 await reopened.p.getByLabel('所属项目').selectOption(a.id);assert.ok((await reopened.p.getByLabel('记录内容').inputValue()).startsWith('修改后迁移'));
 // Restore hidden drafts and ensure closing one window leaves the others untouched.
 await editors[0].p.getByRole('button',{name:'返回列表',exact:true}).click();assert.equal(await invoke(main,'plugin:window|is_visible',{label:editors[0].label}),false);
 await main.getByRole('button',{name:'已打开笔记',exact:true}).click();await main.getByRole('button',{name:/独立草稿 0/}).click();assert.equal(await invoke(main,'plugin:window|is_visible',{label:editors[0].label}),true);
 await invoke(main,'plugin:window|close',{label:editors[0].label});await editors[0].p.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await editors[1].p.getByLabel('记录内容').inputValue(),'独立草稿 1');
 // Direct copy is exposed, hover opens the custom actions, and pictures share the batch.
 await emitAction('project',{id:b.id});const row=main.locator('article').filter({hasText:'修改后迁移'});await row.waitFor();
 await row.getByRole('button',{name:'复制',exact:true}).click();await main.getByText(/Agent 提示词已复制 · 批次/).waitFor();const copiedBatch=(await main.locator('.feedback').innerText()).match(/批次 ([A-F0-9]+)/)[1];assert.ok(clipboard('[System.Windows.Forms.Clipboard]::GetText()').includes('交付批次：'+copiedBatch));
 await main.locator('h1').hover();await row.locator('.copy-control').hover();const pop=main.locator('.copy-popover:popover-open');await pop.getByRole('button',{name:'复制原文',exact:true}).waitFor();await pop.getByRole('button',{name:'复制图片',exact:true}).click();await main.getByText('图片已复制 · 批次 '+copiedBatch,{exact:true}).waitFor();
 const copiedPaths=JSON.parse(clipboard('ConvertTo-Json -InputObject @([System.Windows.Forms.Clipboard]::GetFileDropList()) -Compress'));assert.equal(copiedPaths.length,1);assert.ok(path.basename(copiedPaths[0]).startsWith(copiedBatch+'-R1-P1-'));assert.ok(fs.existsSync(copiedPaths[0]));
 await row.locator('.copy-expand').focus();await main.keyboard.press('Escape');assert.equal(await main.locator('.copy-popover:popover-open').count(),0);
 await emitAction('project',{id:a.id});await main.getByRole('button',{name:'切换项目'}).filter({hasText:'项目 A'}).waitFor();
 await main.getByRole('button',{name:'多选',exact:true}).click();const rows=main.locator('article');await rows.nth(0).locator('.selection-check').click();await rows.nth(3).getByRole('button',{name:'选择到这里',exact:true}).click();assert.equal(await main.locator('article.selected').count(),4);
 await main.getByRole('button',{name:'全选当前结果',exact:true}).click();assert.equal(await main.locator('article.selected').count(),19);
 await invoke(main,'save_entry',{entry:{...notes[3],projectId:b.id}});await refresh();await main.waitForFunction(()=>document.querySelectorAll('article.selected').length===18);await invoke(main,'save_entry',{entry:notes[3]});await refresh();await main.waitForFunction(()=>document.querySelectorAll('article').length===19);
 await main.getByRole('button',{name:'取消全选',exact:true}).click();assert.equal(await main.locator('article.selected').count(),0);
 await main.getByRole('button',{name:'全选当前结果',exact:true}).click();await emitAction('filters',{filterTypes:[],status:'Done',tag:'',search:''});await sleep(150);assert.equal(await main.locator('article.selected').count(),0);await emitAction('filters',{filterTypes:[],status:'',tag:'',search:''});
 assert.equal(await main.getByRole('button',{name:'忽略',exact:true}).count(),0);
 await rows.first().locator('.copy-control').hover();assert.equal(await main.locator('.copy-popover:popover-open').getByRole('button',{name:'复制图片',exact:true}).count(),0);await main.keyboard.press('Escape');
 // Minimum window dimensions keep frame controls inside the viewport.
 for(const [p,label,width,height] of [[main,'main',400,320],[editors[1].p,editors[1].label,420,380],[delivery,deliveryLabel,420,380]]){
  await invoke(p,'plugin:window|set_size',{label,value:{Logical:{width,height}}});await p.waitForFunction(w=>innerWidth===w,width);const metrics=await p.evaluate(()=>({height:innerHeight,body:document.body.scrollHeight,close:document.querySelector('.window-close').getBoundingClientRect().bottom,save:document.querySelector('.composer-footer')?.getBoundingClientRect().bottom}));assert.ok(metrics.body<=metrics.height);assert.ok(metrics.close<=metrics.height);if(metrics.save)assert.ok(metrics.save<=metrics.height);
 }
 await main.evaluate(()=>localStorage.setItem('devpad-theme','dark'));await delivery.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await delivery.screenshot({path:'.tools/batch78-delivery-dark.png'});await editors[1].p.screenshot({path:'.tools/batch78-editor.png'});await main.screenshot({path:'.tools/batch78-main.png'});
 // Browser zoom exercises the WebView layout at 125% and 150% without changing desktop settings.
 const cdp=await context.newCDPSession(delivery);for(const factor of [1.25,1.5]){await cdp.send('Emulation.setDeviceMetricsOverride',{width:420,height:380,deviceScaleFactor:factor,mobile:false});const bounds=await delivery.locator('.window-close').boundingBox();assert.ok(bounds.y+bounds.height<=380);assert.ok(await preview.isVisible());}await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();
 await invoke(main,'hide_to_tray');assert.equal(await invoke(main,'plugin:window|is_visible',{label:editors[2].label}),false);await invoke(main,'resident_action',{action:'open'});await editors[2].p.waitForFunction(()=>document.visibilityState==='visible');assert.equal(await editors[2].p.getByLabel('记录内容').inputValue(),'独立草稿 2');
 // Exit cancellation must preserve all drafts, including already approved windows.
 await invoke(main,'resident_action',{action:'exit'});let asked;
 for(let i=0;i<100&&!asked;i++){for(const e of [...editors,reopened])if(await e.p.getByRole('button',{name:'放弃并继续退出',exact:true}).count()){asked=e.p;break;}if(!asked)await sleep(50);}assert.ok(asked);await asked.getByRole('button',{name:'放弃并继续退出',exact:true}).click();let next;
 for(let i=0;i<100&&!next;i++){for(const e of [...editors,reopened])if(await e.p.getByRole('button',{name:'放弃并继续退出',exact:true}).isVisible()){next=e.p;break;}if(!next)await sleep(50);}assert.ok(next);assert.notEqual(next,asked);await next.getByRole('button',{name:'继续编辑',exact:true}).click();
 for(let i=0;i<5;i++)assert.equal(await editors[i].p.getByLabel('记录内容').inputValue(),'独立草稿 '+i);
 assert.deepEqual(errors,[]);fs.writeFileSync('.tools/batch78-result.json',JSON.stringify({passed:true,windows:editors.length,deliveryWindows:2,records:20,migrationUi:true,snapshotStable:true,nativeBitmapPaste:true,clipboardBatchVerified:true,customCopy:true,selection:true,smallWindow:true,webviewScaleFactors:[1,1.25,1.5],trayRestore:true,exitCancelAfterApproval:true,errors},null,2));
 // Test-only cleanup after verifying cancellation, never affects the user's data directory.
 for(const p of context.pages().filter(p=>p!==main)){const label=new URL(p.url()).searchParams.get('instance');if(label)await invoke(main,'plugin:window|destroy',{label}).catch(()=>{});}
 await invoke(main,'exit_app',{discard:false}).catch(()=>{});await browser.close();console.log('PASS all four batch 78F1BC58 records');
})().catch(e=>{console.error(e);process.exit(1);});
