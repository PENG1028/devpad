// Isolated Chromium only. No desktop windows, system mouse, clipboard, or real data.
const {chromium}=require('C:/Users/ZHP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('dist');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:900,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.isTauri=true;const callbacks=new Map(),listeners=new Map();let id=0;window.calls=[];
  window.publish=async(event,payload)=>{for(const handler of listeners.get(event)||[])await callbacks.get(handler)({event,payload});};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
  window.lastCollapse=null;
  window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'}},transformCallback:fn=>{callbacks.set(++id,fn);return id;},convertFileSrc:p=>p,invoke:async(cmd,args)=>{
   window.calls.push(cmd);
   if(cmd==='notebook_collapse')window.lastCollapse=args.target;
   if(cmd==='plugin:event|listen'){listeners.set(args.event,[...(listeners.get(args.event)||[]),args.handler]);return ++id;}
   if(cmd==='load')return {projects:[{id:'a',name:'DevPad'}],entries:Array.from({length:20},(_,i)=>({id:String(i),projectId:'a',type:'Note',text:'保留笔记与滚动位置 '+i,tags:[],attachments:[],references:[],status:'Open',createdAt:'2026-09-12T00:00:00Z',updatedAt:'original'})),dataDir:'isolated'};
   return false;
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.locator('article').first().waitFor();
 const expected=await page.locator('[data-notebook-collapse]').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.left+(r.width-36)/2,y:r.top+(r.height-36)/2};});
 await page.locator('[data-notebook-collapse]').click();assert.deepEqual(await page.evaluate(()=>window.lastCollapse),expected);
 await page.evaluate(()=>{window.lastCollapse=null;return window.publish('notebook-collapse-request',null);});
 await page.waitForFunction(()=>window.lastCollapse!==null);assert.deepEqual(await page.evaluate(()=>window.lastCollapse),expected);
 await page.locator('.notes-scroll').evaluate(e=>{e.scrollTop=300;e.dataset.identity='preserved';});
 const phase=phase=>page.evaluate(phase=>window.publish('notebook-surface',{phase,right:true,bottom:false,width:900,height:640}),phase);
 await phase('collapsing');assert.equal(await page.locator('.expanded-content').getAttribute('inert'),'');
 await page.setViewportSize({width:36,height:36});await phase('compact');
 const compact=page.locator('.floating-notebook');await compact.hover();
 assert.equal(await compact.getAttribute('title'),null);
 assert.deepEqual(await compact.evaluate(e=>{const s=getComputedStyle(e),r=e.querySelector('svg').getBoundingClientRect();return [s.backgroundColor,s.padding,s.borderWidth,r.width,r.height];}),['rgba(0, 0, 0, 0)','0px','0px',36,36]);
 await page.mouse.move(12,12);await page.mouse.down();await page.mouse.move(22,22);await page.mouse.up();
 await page.waitForFunction(()=>window.calls.includes('notebook_drag'));await page.mouse.move(30,30);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c==='notebook_drag').length),1);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c==='plugin:window|set_position').length),0);
 assert.equal(await compact.evaluate(e=>e.classList.contains('dragging')),false);
 await compact.click();assert.equal(await page.evaluate(()=>window.calls.filter(c=>c==='edge_restore').length),1);
 await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true})));
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c==='open_aux').length),0);
 assert.equal(await page.locator('.floating-notebook').count(),1);
 await phase('expanding');await page.setViewportSize({width:900,height:640});await phase('expanded');
 assert.equal(await page.locator('article').count(),20);assert.equal(await page.locator('.notes-scroll').getAttribute('data-identity'),'preserved');
 assert.equal(await page.locator('.notes-scroll').evaluate(e=>e.scrollTop),300);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c==='notebook_surface_ready').length),2);
 assert.deepEqual(errors,[]);console.log('PASS button collapse destination, compact bounds/hover, native drag handoff and release, click after drag, retained state');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
