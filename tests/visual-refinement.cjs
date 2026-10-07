const { chromium }=require('C:/Users/ZHP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');fs.mkdirSync('.tools',{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1040,height:780}});await page.emulateMedia({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 const shot=await browser.newPage({viewport:{width:540,height:210},deviceScaleFactor:1});await shot.setContent('<body style="margin:0;padding:20px;background:#f4f5f6;font:14px Segoe UI;color:#292b30"><table style="width:100%;border-collapse:collapse;text-align:left;line-height:2.6"><tr style="color:#717680"><th>商品</th><th>仓库</th><th>库存</th><th>更新时间</th></tr><tr><td>面料样品 A</td><td>A</td><td>12</td><td>09-11 10:24</td></tr><tr><td>面料样品 B</td><td>A</td><td>28</td><td>09-11 09:41</td></tr><tr><td>面料样品 C</td><td>B</td><td>6</td><td>09-11 09:12</td></tr></table></body>');const png=await shot.screenshot({path:'.tools/redesign-fixture.png'});await shot.close();const image='data:image/png;base64,'+png.toString('base64');
 const now=new Date(), yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
 const make=(id,text,date,type='Note',attachments=[])=>({id,projectId:'p',type,text,createdAt:date.toISOString(),updatedAt:date.toISOString(),status:'Open',tags:id==='one'?['库存']:[],attachments,references:[]});
 const attachment={id:'image',name:'warehouse.png',path:image};
 const fixture={projects:[{id:'p',name:'订单系统'},{id:'q',name:'空项目'}],entries:[make('one','切换仓库后，库存没有刷新\n切换到 B 仓库后，列表仍显示之前的数据。',now,'Bug',[attachment]),make('two','保留筛选后的滚动位置\n返回列表时，希望能接着上次的位置继续查看。',new Date(now.getTime()-3600000),'UX'),make('three','整理好，再交给 Agent\n把相关记录放在一起，复制完整上下文。',yesterday),make('long','长文本验收\n'+('这是一段用于验证自动换行与阅读布局的长文本。'.repeat(35))+'\n'+('LongUnbrokenText'.repeat(35)),new Date(yesterday.getTime()-1000),'Feature',[attachment,{...attachment,id:'i2'},{...attachment,id:'i3'},{...attachment,id:'i4'}])],dataDir:'UI test only'};
 await page.addInitScript(({fixture})=>{let db=structuredClone(fixture);window.__TAURI_INTERNALS__={convertFileSrc:p=>p,invoke:async(cmd,args)=>{if(cmd==='load')return structuredClone(db);if(cmd==='create_project'){const p={id:crypto.randomUUID(),name:args.name};db.projects.push(p);return p;}if(cmd==='save_entry'){db.entries=db.entries.filter(e=>e.id!==args.entry.id);db.entries.push(JSON.parse(JSON.stringify(args.entry)));}if(cmd==='batch'){if(args.status==='Delete')db.entries=db.entries.filter(e=>!args.ids.includes(e.id));else db.entries.forEach(e=>{if(args.ids.includes(e.id))e.status=args.status;});}if(cmd==='copy_text')window.copied=args.text;if(cmd==='copy_images')return args.files.length;if(cmd==='export_bundle')return 'test-export';if(cmd==='add_image')return {id:crypto.randomUUID(),name:args.name,path:'data:image/png;base64,'+args.data};}};localStorage.setItem('devpad-theme','light');},{fixture});

 await page.goto('http://127.0.0.1:5173');await page.locator('article').first().waitFor();
 assert.equal(await page.locator('.note-type').first().textContent(),'Bug');
 assert.equal(await page.locator('.note-tag').first().textContent(),'#库存');
 for(const theme of ['light','dark']){
  await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('button',{name:theme==='light'?'浅色':'深色',exact:true}).click();await page.getByLabel('关闭面板',{exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
  await page.setViewportSize({width:1040,height:780});await page.locator('.notes-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'.tools/ui-'+theme+'.png'});
  await page.getByLabel('项目与筛选',{exact:true}).click();await page.locator('.sheet.sidebar').waitFor();await page.screenshot({path:'.tools/ui-sidebar-'+theme+'.png'});
  await page.getByLabel('状态筛选').selectOption('Done');assert.equal(await page.locator('article').count(),0);await page.getByRole('dialog').getByRole('button',{name:'清除筛选',exact:true}).click();await page.keyboard.press('Escape');
  for(const [width,height] of [[400,320],[520,480],[760,480],[1440,900]]){
   await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
   assert.ok(await page.locator('.notes-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'notes overflow');
   await page.locator('.notes-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);
   const last=await page.locator('article').last().boundingBox(),bottom=await page.locator('.bottom-area').boundingBox();assert.ok(last.y+last.height<=bottom.y+1,'note covered');
   if(width===400)await page.screenshot({path:'.tools/ui-compact-'+theme+'.png'});
  }
 }
 await page.setViewportSize({width:1040,height:780});await page.keyboard.press('Control+f');await page.getByLabel('搜索记录').fill('库存');assert.equal(await page.locator('article').count(),1);await page.getByRole('button',{name:'清除全部',exact:true}).click();await page.keyboard.press('Escape');
 await page.keyboard.press('Control+n');await page.getByLabel('记录内容').fill('视觉验收记录\n保存后仍可继续编辑。 #设计');await page.keyboard.press('Control+Enter');await page.waitForFunction(()=>document.querySelectorAll('article').length===5);await page.getByLabel('收起编辑器').click();
 await page.keyboard.press('Control+a');await page.getByRole('button',{name:'交给 Agent',exact:true}).click();await page.getByRole('button',{name:'复制提示词',exact:true}).click();assert.match(await page.evaluate(()=>window.copied),/视觉验收记录/);await page.screenshot({path:'.tools/ui-delivery-dark.png'});await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log('PASS light/dark, sidebar filtering, 400/520/760/1440 layouts, save, search, selection and delivery');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
