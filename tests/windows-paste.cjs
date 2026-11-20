const {chromium}=require('@playwright/test');
const path=require('node:path'),assert=require('node:assert/strict');
let stage='startup';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=process.env.DEVPAD_DATA_DIR,port=process.env.DEVPAD_PASTE_PORT;
 assert.ok(root && port && ['clipboard','notebook'].includes(process.env.DEVPAD_PRIVATE_RECEIVER),'Launch with tests/windows-paste.py');
 let browser,lastStartupError;
 const deadline=Date.now()+50000;
 while(Date.now()<deadline){
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:2000});break;}
  catch(error){lastStartupError=error;await delay(300);}
 }
 assert.ok(browser,'WebView2 startup: '+lastStartupError?.message);
 try{
  let page;
  for(let i=0;i<45;i++){
   page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://tauri.localhost'));
   if(page)break;await delay(200);
  }
  assert.ok(page,'Private DevPad page');
  const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
  const loaded=await call('load');
  assert.equal(path.resolve(loaded.dataDir),path.resolve(root));
  assert.equal(loaded.entries.length,0);
  require('node:fs').writeFileSync(path.join(root,'test-identity'),await call('plugin:app|identifier'));
  if(process.env.DEVPAD_PRIVATE_RECEIVER==='clipboard'){
   const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
   const image=await call('add_image',{name:'Capture.png',data:png});
   const second=await call('add_image',{name:'Capture.png',data:png});
   const now=new Date().toISOString();
   for(const [i,attachment] of [image,second].entries())await call('save_entry',{entry:{
     id:'row'+i,type:'Note',projectId:'inbox',revision:0,text:'devpad-paste-'+i,createdAt:now,updatedAt:now,tags:[],status:'Open',references:[],attachments:[attachment]
   }});
   stage='copy two records';await page.reload();await page.locator('article').first().waitFor();
   await page.locator('.journal-select').evaluate(el=>el.click());
   for(const cb of await page.locator('.selection-check').all())await cb.evaluate(el=>el.click());
   await page.locator('.journal-selection>button').first().evaluate(el=>el.click());
   await page.waitForFunction(()=>!document.querySelector('.journal-selection>button')?.disabled);
   await page.evaluate(()=>{
    const parent=document.createElement('div');
    parent.innerHTML='<textarea id="paste-plain"></textarea><div id="paste-rich" contenteditable="true" style="background:white;min-height:100px"></div>';
    parent.style.cssText='position:fixed;inset:0;background:white;z-index:999';document.body.append(parent);
    window.pasteFormats=[];
    document.addEventListener('paste',e=>window.pasteFormats.push({types:Array.from(e.clipboardData.types),files:Array.from(e.clipboardData.files).map(f=>f.name)}),true);
   });
   stage='plain and rich paste';await page.locator('#paste-plain').focus();await page.keyboard.press('Control+v');
   await delay(250);
   const plain=await page.locator('#paste-plain').inputValue();
   await page.locator('#paste-rich').focus();await page.keyboard.press('Control+v');
   await delay(1000);
   const rich=await page.locator('#paste-rich').evaluate(el=>({text:el.innerText,images:[...el.querySelectorAll('img')].map(img=>({alt:img.alt,width:img.naturalWidth})),order:[...el.querySelectorAll('pre,img')].map(n=>n.tagName==='IMG'?n.alt:n.textContent)}));
   const formats=await page.evaluate(()=>window.pasteFormats);
   assert.ok(formats.length>=2,'Both paste receivers dispatched an operating-system paste');
   assert.ok(formats.every(event=>event.files.length===2),'File-aware paste targets receive both images');
   assert.match(plain,/devpad-paste-1[\s\S]*001-Capture\.png[\s\S]*devpad-paste-0[\s\S]*002-Capture\.png/);
   assert.equal(rich.images.length,2);assert.ok(rich.images.every(i=>i.width===1));
   assert.deepEqual(rich.order,['devpad-paste-1','001-Capture.png','devpad-paste-0','002-Capture.png']);
   stage='paste into DevPad';await page.evaluate(()=>document.querySelector('#paste-rich').parentElement.remove());
   await page.locator('.journal-select').evaluate(node=>node.click());
   await page.locator('.capture-bar').evaluate(node=>node.click());
   const editor=page.locator('#entry-text');
   await editor.focus();await editor.press('Control+v');
   await page.waitForFunction(()=>document.querySelectorAll('.editor-images .attachment').length===2);
   assert.equal(await editor.inputValue(),plain);
   assert.deepEqual(await page.locator('.editor-images img').evaluateAll(nodes=>nodes.map(image=>image.alt)),['001-Capture.png','002-Capture.png']);
   console.log('PASS Windows paste into plain text, rich text, file-aware input and DevPad');
  }else{
   const plain='Private notebook draft';
   const now=new Date().toISOString();
   await call('save_entry',{entry:{id:'one',type:'Note',projectId:'inbox',revision:0,text:'Notebook record',createdAt:now,updatedAt:now,tags:[],status:'Open',references:[],attachments:[]}});
   await page.reload();await page.locator('article').first().waitFor();
   await page.locator('.capture-bar').evaluate(node=>node.click());await page.locator('#entry-text').fill(plain);
   // Keep a live draft and a selection through both a normal and a maximized collapse.
   await page.locator('.journal-select').evaluate(node=>node.click());
   await page.locator('.selection-check').first().evaluate(node=>node.click());
   const geometry=()=>Promise.all(['outer_position','outer_size'].map(name=>call('plugin:window|'+name,{label:'main'})));
   // A headless/private station can initialize the WebView while its HWND is hidden.
   stage='show private test window';
   await call('window_ready');
   await call('edge_restore',{animate:false});
   for(let i=0;i<50&&!(await call('plugin:window|is_visible',{label:'main'}));i++)await delay(100);
   assert.equal(await call('plugin:window|is_visible',{label:'main'}),true,'The native window must be visible for collapse');
   const normal=await geometry();
   for(const maximized of [false,true]){
    stage=maximized?"maximize the test window":"collapse a normal window";
    if(maximized){
     await call('plugin:window|toggle_maximize',{label:'main'});
     await page.waitForFunction(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized',{label:'main'}));
    }
    stage='collapse, maximized='+maximized;
    await page.locator('[data-notebook-collapse]').evaluate(node=>node.click());
    try {await page.waitForFunction(()=>document.querySelector('.notebook-surface.compact'),undefined,{timeout:6500});}
    catch(error){
     const state=await Promise.all(['is_visible','is_minimized','is_maximized','outer_size'].map(name=>call('plugin:window|'+name,{label:'main'})));
     const ui=await page.evaluate(()=>({surface:document.querySelector('.notebook-surface')?.className,feedback:document.querySelector('.collapse-feedback')?.textContent,dialogs:[...document.querySelectorAll('dialog[open]')].map(el=>el.className)}));
     throw Error('Collapse state '+JSON.stringify({state,ui})+' '+error.message);
    }
    stage='restore, maximized='+maximized;
    await page.locator('.floating-notebook').evaluate(node=>node.click());
    await page.waitForFunction(()=>!document.querySelector('.expanded-content.suspended'));
    assert.equal(await page.locator('article.selected').count(),1);
    assert.equal(await call('plugin:window|is_maximized',{label:'main'}),maximized);
    if(!maximized)assert.deepEqual(await geometry(),normal);
   }
   // The recovery command deliberately excludes live editors. Verify its backing row and the editor itself.
   const {DatabaseSync}=require('node:sqlite');
   const db=new DatabaseSync(path.join(root,'devpad.sqlite'),{readOnly:true});
   try{assert.equal(JSON.parse(db.prepare("SELECT payload FROM drafts WHERE id='main'").get().payload).text,plain);}
   finally{db.close();}
   await page.locator('.journal-select').evaluate(node=>node.click());
   await page.locator('.capture-bar').evaluate(node=>node.click());
   assert.equal(await page.locator('#entry-text').inputValue(),plain);
   console.log('PASS normal and maximized native collapse/expand with an active selection and saved draft');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(stage,e.stack);process.exitCode=1;});
