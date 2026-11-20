// Compiled UI with an isolated desktop bridge and no system clipboard access.
const {chromium,webkit}=require('@playwright/test');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve('dist');
const engine=process.env.DEVPAD_TEST_BROWSER==='webkit'?webkit:chromium;
const screenshots=engine===webkit?'artifacts/ui/webkit':'artifacts/ui';
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}
 const target=file.endsWith(path.sep)?file+'index.html':file;
 try{
  res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':target.endsWith('.woff2')?'font/woff2':'text/html');
  res.end(fs.readFileSync(target));
 }catch{res.writeHead(404).end();}
});

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await engine.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  channel:engine===chromium?process.env.PLAYWRIGHT_CHANNEL:undefined});
 try{
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:900,height:640},reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  const sampleImage='data:image/png;base64,'+fs.readFileSync(path.resolve('docs/design/current-batch-compact.png')).toString('base64');
  await page.addInitScript(image=>{
   localStorage.setItem('devpad-theme','dark');
   localStorage.setItem('devpad-default-template','engineering');
   window.calls=[];
   window.failCopy=false;
   const data={
    noteTypes:[],
    projects:[{id:'a',name:'DevPad'},{id:'b',name:'设计整理'}],
    entries:Array.from({length:12},(_,i)=>({
     id:String(i),projectId:i===11?'b':'a',type:i===0?'Draft':'Note',
     text:i===1?'':'记录想法 '+i+'\n完整保留正文',tags:[],
     attachments:i<2?[{id:'image'+i,name:'示意图.png',path:image+'#'+i}]:[],
     references:i===0?['2']:[],status:'Open',
     createdAt:new Date(1700000000000-i*1000).toISOString(),updatedAt:'original',
    })),
    dataDir:'headless-fixture',
   };
   window.__TAURI_INTERNALS__={
    convertFileSrc:source=>source,
    invoke:async(cmd,args)=>{
     window.calls.push({cmd,args});
     if(cmd==='load')return JSON.parse(JSON.stringify(data));
     if(cmd==='create_note_type'){
      const existing=data.noteTypes.find(kind=>kind.name.toLowerCase()===args.name.toLowerCase());if(existing)return existing;
      const kind={id:'kind-'+data.noteTypes.length,name:args.name};data.noteTypes.push(kind);return kind;
     }
     if(cmd==='create_project'){const project={id:'new-'+data.projects.length,name:args.name};data.projects.push(project);return project;}
     if(cmd==='save_entry')data.entries.unshift(args.entry);
     if(cmd==='copy_bundle'&&window.failCopy){window.failCopy=false;throw Error('剪贴板暂时不可用');}
     if(cmd==='move_entries')data.entries.forEach(entry=>{if(args.ids.includes(entry.id))entry.projectId=args.projectId;});
     if(cmd==='export_bundle')return 'fixture-export';
     return null;
    },
   };
  },sampleImage);
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
  const toolbarCenters=()=>page.evaluate(()=>[...document.querySelectorAll('.journal-titlebar .project-picker,.journal-titlebar>.icon-button,.journal-select,.journal-titlebar .window-controls button')].map(button=>{
   const rect=button.getBoundingClientRect();return rect.y+rect.height/2;
  }));
  const notes=page.locator('article');
  await notes.first().waitFor();
  const lastArgs=cmd=>page.evaluate(cmd=>window.calls.filter(call=>call.cmd===cmd).at(-1).args,cmd);
  assert.deepEqual([...new Set(await toolbarCenters())],[24]);
  const firstText='记录想法 0\n完整保留正文';

  const richCopy=notes.first().getByRole('button',{name:'复制图文',exact:true});
  await richCopy.click();
  const single=await lastArgs('copy_bundle');
  assert.equal(single.text,firstText+'\n[图片] 示意图.png');
  assert.deepEqual(single.manifest.records.map(entry=>entry.id),['0']);
  assert.equal(single.files.length,1);
  assert.ok(!single.files[0].mark);
  assert.match(single.files[0].name,/^001-/);
  await richCopy.press('ArrowDown');
  const onlyText=notes.first().getByRole('button',{name:'仅复制正文',exact:true});
  assert.ok(await onlyText.evaluate(n=>n===document.activeElement));
  await onlyText.press('Enter');
  assert.equal((await lastArgs('copy_text')).text,firstText);
  await notes.nth(1).getByRole('button',{name:'复制图片',exact:true}).click();
  assert.match((await lastArgs('copy_image')).path,/#1$/);
  await richCopy.hover();
  await notes.first().getByRole('button',{name:'仅复制图片',exact:true}).click();
  assert.match((await lastArgs('copy_image')).path,/#0$/);
  const rowMenu=notes.first().locator('.note-menu');
  await rowMenu.evaluate(n=>{n.click();n.click();});
  assert.equal(await rowMenu.getAttribute('aria-expanded'),'false');
  await rowMenu.click();
  await page.getByRole('menuitem',{name:'仅复制正文',exact:true}).click();
  assert.equal((await lastArgs('copy_text')).text,firstText);

  const list=page.locator('.notes-scroll');
  await list.evaluate(node=>node.scrollTop=180);
  const before=await list.evaluate(node=>node.scrollTop);
  assert.ok(before>0);
  await page.keyboard.press('Meta+f');
  const search=page.getByRole('searchbox',{name:'搜索记录'});
  assert.ok(await search.evaluate(node=>node===document.activeElement));
  await search.fill('设计整理');
  assert.equal(await notes.count(),1);
  await page.getByRole('button',{name:'关闭搜索'}).click();
  assert.equal(await list.evaluate(node=>node.scrollTop),before);
  await list.evaluate(node=>node.scrollTop=0);
  await page.keyboard.press('Control+f');
  await search.fill('记录想法 0');
  const thumbnail=notes.first().getByRole('button',{name:'示意图.png'});
  await thumbnail.click();
  await page.getByRole('button',{name:'复制这张图片'}).click();
  assert.match((await lastArgs('copy_image')).path,/#0$/);
  await page.keyboard.press('Escape');
  assert.ok(await thumbnail.evaluate(n=>n===document.activeElement));
  assert.equal(await search.inputValue(),'记录想法 0');
  await page.keyboard.press('Escape');

  await page.getByRole('button',{name:'多选',exact:true}).click();
  const boxes=page.locator('.selection-check');
  const ranges=page.getByRole('button',{name:'选择到这里',exact:true});
  const selection=()=>boxes.evaluateAll(nodes=>nodes.flatMap((n,i)=>n.getAttribute('aria-pressed')==='true'?[i]:[]));
  await ranges.nth(2).click();
  assert.deepEqual(await selection(),[0,1,2]);
  await boxes.nth(6).click();
  await ranges.nth(4).click();
  assert.deepEqual(await selection(),[0,1,2,4,5,6]);
  await boxes.nth(3).click({modifiers:['Shift']});
  assert.deepEqual(await selection(),[0,1,2,3,4,5,6]);
  await page.getByRole('button',{name:'退出多选',exact:true}).click();
  await page.getByRole('button',{name:'多选',exact:true}).click();
  await boxes.nth(2).click();
  await boxes.nth(0).click();
  const toolbar=page.getByRole('region',{name:'批量操作'});
  await page.setViewportSize({width:400,height:320});
  assert.ok((await toolbar.boundingBox()).height<=56);
  assert.deepEqual([...new Set(await toolbarCenters())],[24]);
  await toolbar.getByText('更多',{exact:true}).click();
  await toolbar.getByRole('menuitem',{name:'导出…',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('article.selected').count(),2);
  assert.equal(await toolbar.getByRole('button',{name:'更多'}).getAttribute('aria-expanded'),'false');
  await page.keyboard.press('Control+c');
  assert.deepEqual((await lastArgs('copy_bundle')).manifest.records.map(note=>note.id),['0','2']);
  await page.evaluate(()=>window.failCopy=true);
  await toolbar.getByRole('button',{name:'复制',exact:true}).click();
  await page.getByRole('alert').getByText('剪贴板暂时不可用').waitFor();
  await boxes.nth(1).click();
  await page.getByRole('button',{name:'重试',exact:true}).click();
  const retried=await lastArgs('copy_bundle');
  assert.deepEqual(retried.manifest.records.map(note=>note.id),['0','2']);
  assert.equal(retried.text,firstText+'\n[图片] 示意图.png\n\n记录想法 2\n完整保留正文');
  await toolbar.getByText('更多',{exact:true}).click();
  await toolbar.getByRole('menuitem',{name:'导出…',exact:true}).click();
  await page.getByRole('button',{name:'导出图文',exact:true}).click();
  const exported=await lastArgs('export_bundle');
  assert.equal(exported.manifest.kind,'journal');
  assert.deepEqual(exported.manifest.records.map(entry=>entry.id),['0','1','2']);
  assert.ok(exported.text.includes('![图片](<'+encodeURIComponent('001-示意图.png')+'>)'));
  assert.ok(!exported.text.includes('请根据'));
  await page.getByRole('button',{name:'使用模板',exact:true}).click();
  assert.ok((await page.getByRole('textbox',{name:'导出内容预览'}).inputValue()).includes('请根据'));
  await page.keyboard.press('Escape');
  await toolbar.getByText('更多',{exact:true}).click();
  await toolbar.getByRole('menuitem',{name:'发布任务',exact:true}).click();
  await page.getByLabel('任务说明（可选）').fill('分析这些材料');
  await page.getByRole('button',{name:'发布给 Agent'}).click();
  assert.deepEqual(await lastArgs('publish_task'),{ids:['0','1','2'],instructions:'分析这些材料'});

  await page.keyboard.press('Meta+n');
  const editor=page.getByRole('textbox',{name:'记录正文'});
  assert.ok(await editor.evaluate(node=>node===document.activeElement));
  await editor.fill('今天看了一版小窗。');
  await editor.press('Enter');
  await editor.press('End');
  await editor.press('Escape');
  await page.getByRole('button',{name:'继续写草稿',exact:false}).click();
  assert.equal(await editor.inputValue(),'今天看了一版小窗。\n');
  await editor.press('Meta+Enter');
  await notes.first().getByText('今天看了一版小窗。').waitFor();
  assert.equal(await editor.inputValue(),'');
  assert.ok(await editor.evaluate(node=>node===document.activeElement));
  await editor.fill('第二条连续记录');
  await editor.press('Control+Enter');
  await notes.first().getByText('第二条连续记录').waitFor();
  await page.keyboard.press('Escape');

  const picker=page.locator('.project-picker');
  const drawer=page.getByRole('dialog',{name:'项目',exact:true});
  const chooseProject=name=>drawer.getByRole('button',{name,exact:true}).click();
  await picker.click();
  assert.ok(await drawer.evaluate(node=>node.matches(':modal')));
  await chooseProject('设计整理');
  assert.equal(await notes.count(),1);
  await chooseProject('设计整理');
  assert.equal(await picker.getAttribute('aria-expanded'),'true');
  await chooseProject('全部记录');
  assert.equal(await notes.count(),14);
  await drawer.getByRole('button',{name:'查看 14 条记录'}).click();
  assert.ok(await picker.evaluate(node=>node===document.activeElement));
  await page.getByRole('button',{name:'多选',exact:true}).click();
  await page.locator('.selection-check').last().click();
  await toolbar.getByText('更多',{exact:true}).click();
  await toolbar.getByRole('menuitem',{name:'移动项目',exact:true}).click();
  await page.getByRole('button',{name:'移动',exact:true}).click();
  await picker.click();
  await chooseProject('设计整理');
  assert.equal(await notes.count(),0);
  await chooseProject('全部记录');
  await page.keyboard.press('Escape');
  assert.ok(await picker.evaluate(node=>node===document.activeElement));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const toast=page.getByRole('button',{name:'关闭提示'});
  if(await toast.isVisible())await toast.click();
  fs.mkdirSync(screenshots,{recursive:true});
  await page.screenshot({path:path.join(screenshots,'notebook-compact.png')});
  await page.setViewportSize({width:900,height:640});
  await page.screenshot({path:path.join(screenshots,'notebook-wide.png')});
  await page.getByRole('button',{name:'更多',exact:true}).click();
  await page.getByRole('combobox',{name:'主题'}).click();
  await page.getByRole('option',{name:'浅色',exact:true}).click();
  const frame=()=>page.locator('.settings-tabs').evaluate(node=>{
   const rect=node.getBoundingClientRect(),dialog=node.closest('dialog').getBoundingClientRect();return [rect.x,rect.y,dialog.x,dialog.y,dialog.height];
  });
  const generalFrame=await frame();
  const general=page.getByRole('tab',{name:'通用'});
  await general.focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'新建引用草稿'}).waitFor();
  assert.deepEqual(await frame(),generalFrame);
  await page.keyboard.press('End');
  await page.getByRole('button',{name:'版本与更新'}).waitFor();
  assert.deepEqual(await frame(),generalFrame);
  await page.keyboard.press('Home');
  await page.getByRole('checkbox',{name:'主窗口置顶'}).check();
  assert.ok(await page.getByRole('checkbox',{name:'主窗口置顶'}).isChecked());
  await page.screenshot({path:path.join(screenshots,'settings-zh.png')});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>document.activeElement.blur());
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.screenshot({path:path.join(screenshots,'notebook-light.png')});

  // Browse several projects without unmounting their navigation or stealing the workspace focus.
  await list.evaluate(node=>node.scrollTop=80);
  const peekPosition=await list.evaluate(node=>node.scrollTop);
  await picker.click();
  await page.keyboard.press('Escape');
  assert.equal(await list.evaluate(node=>node.scrollTop),peekPosition);
  assert.equal((await page.locator('.current-project').innerText()).trim(),'全部记录');
  await list.evaluate(node=>node.scrollTop=0);
  await picker.click();
  assert.equal(await drawer.evaluate(node=>node.matches(':modal')),false);
  await chooseProject('DevPad');
  await page.getByRole('button',{name:'记一条'}).click();
  await editor.fill('留在原项目的草稿');
  await chooseProject('设计整理');
  await page.getByText('存到 DevPad',{exact:true}).waitFor();
  await editor.press('Control+Enter');
  assert.equal((await lastArgs('save_entry')).entry.projectId,'a');
  assert.equal((await page.locator('.current-project').innerText()).trim(),'设计整理');
  await editor.fill('切换项目后的下一条');
  await editor.press('Control+Enter');
  await notes.getByText('切换项目后的下一条').waitFor();
  assert.equal((await lastArgs('save_entry')).entry.projectId,'b');
  await editor.press('Escape');
  await chooseProject('DevPad');
  await page.keyboard.press('ArrowDown');
  assert.ok(await drawer.getByRole('button',{name:'设计整理'}).evaluate(n=>n===document.activeElement));
  assert.equal((await page.locator('.current-project').innerText()).trim(),'DevPad');
  await page.keyboard.press('Enter');
  assert.equal((await page.locator('.current-project').innerText()).trim(),'设计整理');
  await page.keyboard.press('Control+f');
  assert.ok(await search.evaluate(n=>n===document.activeElement));
  await page.keyboard.press('Escape');
  assert.equal(await picker.getAttribute('aria-expanded'),'true');
  const more=notes.first().getByRole('button',{name:/记录操作/});
  await more.click();
  const actions=page.getByRole('menu',{name:'记录操作',exact:true});
  assert.ok(await actions.getByRole('menuitem').first().evaluate(n=>n===document.activeElement));
  await page.keyboard.press('End');
  assert.ok(await actions.getByRole('menuitem',{name:'删除记录'}).evaluate(n=>n===document.activeElement));
  await page.keyboard.press('Escape');
  assert.ok(await more.evaluate(n=>n===document.activeElement));
  assert.equal(await picker.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Space');
  await actions.waitFor();
  assert.ok(await actions.evaluate(menu=>menu.scrollTop===0&&menu.querySelector('button').getBoundingClientRect().top>=menu.getBoundingClientRect().top));
  await page.keyboard.press('Tab');
  await actions.waitFor({state:'hidden'});
  assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  await drawer.getByRole('button',{name:'筛选记录'}).click();
  await page.screenshot({path:path.join(screenshots,'project-navigation-wide.png')});
  await page.setViewportSize({width:400,height:320});
  await page.waitForFunction(()=>document.querySelector('#project-navigation').matches(':modal'));
  assert.equal(await drawer.getByRole('button',{name:'设计整理'}).getAttribute('aria-current'),'page');
  await page.screenshot({path:path.join(screenshots,'project-navigation-compact.png')});
  await page.setViewportSize({width:900,height:640});
  await page.waitForFunction(()=>!document.querySelector('#project-navigation').matches(':modal'));
  assert.equal(await drawer.locator('.nav-heading button').count(),1);
  await picker.click();
  assert.equal(await page.locator('.journal-workspace').evaluate(n=>n.getBoundingClientRect().left),0);
  assert.equal(await page.locator('#project-navigation').evaluate(n=>getComputedStyle(n).transitionDuration),'0s');

  await page.emulateMedia({reducedMotion:'no-preference'});
  const sampleTravel=()=>page.evaluate(async()=>{
   const trigger=document.querySelector('.project-picker'), workspace=document.querySelector('.journal-workspace');
   const pane=document.querySelector('#project-navigation');
   const position=()=>({content:workspace.getBoundingClientRect().left,edge:pane.getBoundingClientRect().right});
   const before=position();
   trigger.click();
   await Promise.resolve();
   // Seek the actual CSS transition and drawer animation between their endpoints. A busy
   // compositor can skip a captured frame even when both animations are present and correct.
   const animations=[...workspace.getAnimations(),...pane.getAnimations()];
   if(animations.length<2)throw Error('Missing workspace transition or drawer animation');
   for(const animation of animations){
    animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)/2;
   }
   const middle=position();
   for(const animation of animations)animation.finish();
   await new Promise(requestAnimationFrame);
   return [before,middle,position()];
  });
  const opening=await sampleTravel(), closing=await sampleTravel(), full=opening.at(-1).content;
  assert.ok(full>200 && closing.at(-1).content===0);
  for(const [,middle] of [opening,closing]){
   assert.ok(middle.content>2 && middle.content<full-2,'workspace must move on both opening and closing');
   assert.ok(middle.edge>2 && middle.edge<full-2,'drawer must move on both opening and closing');
  }
  await page.evaluate(async()=>{
   const picker=document.querySelector('.project-picker');
   picker.click();await new Promise(requestAnimationFrame);
   picker.click();await new Promise(requestAnimationFrame);picker.click();
  });
  await chooseProject('DevPad');
  await drawer.getByRole('button',{name:'新建项目'}).click();
  const projectName=drawer.getByLabel('项目名称');
  await projectName.fill('新建的项目');
  await page.setViewportSize({width:400,height:320});
  await page.waitForFunction(()=>document.querySelector('#project-navigation').matches(':modal'));
  assert.equal(await projectName.inputValue(),'新建的项目');
  await drawer.getByRole('button',{name:'创建项目'}).click();
  await drawer.locator('[aria-current="page"]').getByText('新建的项目').waitFor();
  assert.equal(await drawer.locator('.nav-heading button').count(),1);
  await drawer.locator('.nav-footer button').click();
  await page.waitForFunction(()=>document.querySelector('.journal-workspace').getBoundingClientRect().left===0);
  await page.setViewportSize({width:1040,height:780});
  await page.emulateMedia({reducedMotion:'reduce'});
  await picker.click();await chooseProject('全部记录');
  await drawer.locator('#new-project-button').hover();
  await page.getByRole('tooltip',{name:'新建项目'}).waitFor();
  assert.equal(await drawer.locator('#new-project-button').getAttribute('title'),null);
  await page.mouse.move(600,50);
  await page.getByRole('tooltip').waitFor({state:'hidden'});
  await page.keyboard.press('Control+f');
  assert.ok((await search.getAttribute('placeholder')).includes('全部记录'));
  const unfiltered=await notes.count();
  await search.dispatchEvent('compositionstart');
  await search.fill('示意图');
  assert.equal(await notes.count(),unfiltered);
  await search.dispatchEvent('compositionend');
  assert.equal(await notes.count(),2);
  await page.keyboard.press('Escape');
  const imageFilter=drawer.getByRole('checkbox',{name:'有图片'});
  if(!await imageFilter.isVisible())await drawer.getByRole('button',{name:'筛选记录'}).click();
  await imageFilter.check();assert.equal(await notes.count(),2);
  const fields=drawer.locator('.filter-fields .select-field');
  const widths=await fields.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width));
  assert.equal(new Set(widths).size,1);
  const kinds=drawer.getByRole('combobox',{name:'类型 · 可多选'});
  await kinds.click();await page.getByRole('option',{name:'引用草稿',exact:true}).click();
  assert.equal(await notes.count(),1);
  await page.getByRole('option',{name:'笔记',exact:true}).click();
  assert.equal(await notes.count(),2);
  await page.keyboard.press('Escape');
  await drawer.getByRole('button',{name:'清除筛选'}).click();
  await chooseProject('新建的项目');await picker.click();
  await page.getByRole('button',{name:'记一条'}).click();
  await editor.fill('展览样片');await page.getByRole('button',{name:'整理',exact:true}).click();
  await page.getByRole('combobox',{name:'笔记类型'}).click();
  await page.getByRole('textbox',{name:'类型名称'}).fill('采访');
  await page.getByRole('button',{name:'新建类型 · 采访'}).click();
  assert.equal(await page.getByRole('combobox',{name:'笔记类型'}).innerText(),'采访');
  await page.getByRole('textbox',{name:'笔记标签'}).fill('展览 #侧栏');
  await editor.press('Control+Enter');
  assert.deepEqual((await lastArgs('save_entry')).entry.tags,['展览','侧栏']);
  await notes.getByText('采访',{exact:true}).waitFor();await editor.press('Escape');
  await picker.click();await chooseProject('DevPad');await picker.click();
  await page.getByRole('button',{name:'记一条'}).click();
  await page.getByRole('button',{name:'整理',exact:true}).click();
  await page.getByRole('textbox',{name:'笔记标签'}).focus();
  await page.getByRole('button',{name:'#侧栏',exact:true}).click();
  assert.equal((await page.getByRole('textbox',{name:'笔记标签'}).inputValue()).trim(),'#侧栏');
  // A native toggle notification can arrive after its owner has left the editor.
  await page.evaluate(async()=>{
   const editor=document.querySelector('.composer'),trigger=editor.querySelector('[role=combobox]');
   const list=editor.querySelector('.select-options');trigger.click();await Promise.resolve();
   list.hidePopover();document.querySelector('.journal-select').click();await Promise.resolve();
   list.dispatchEvent(new Event('toggle'));
  });
  assert.deepEqual(errors,[]);
  const notebookUrl=page.url();
  await page.close();
  await require('./language-headless.cjs')(browser,notebookUrl);
  console.log('PASS journal UI: persistent project navigation, responsive drawer, measured motion, menu focus, draft ownership, capture, export, tasks and compact layout');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
