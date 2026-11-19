const { expect } = require('@playwright/test');

async function checkLanguages(browser, notebookUrl){
 const context=await browser.newContext({locale:'en-US',viewport:{width:900,height:640},reducedMotion:'reduce'});
 try{
  await context.addInitScript(()=>{
   const note={id:'note',projectId:'custom',type:'Note',text:'用户笔记正文',tags:[],attachments:[],references:[],
    status:'Open',createdAt:'2026-01-01T12:00:00Z',updatedAt:'2026-01-01T12:00:00Z'};
   window.__TAURI_INTERNALS__={invoke:async command=>command==='load'?{
    projects:[{id:'inbox',name:'收件箱'},{id:'custom',name:'收件箱'}],entries:[note],dataDir:'fixture',
   }:null};
   if(!localStorage.getItem('devpad-export-templates')){
    localStorage.setItem('devpad-export-templates',JSON.stringify([
     {id:'engineering',name:'工程任务',body:'请根据以下内容实施修改，并说明验证结果：\n\n{{content}}\n\n{{image_map}}',
      metadata:false,references:true,numberImages:false},
     {id:'custom',name:'工程任务',body:'用户编写的提示 {{content}}',metadata:false,references:false,numberImages:false},
    ]));
   }
  });
  const page=await context.newPage();
  const second=await context.newPage();
  await Promise.all([page.goto(notebookUrl),second.goto(notebookUrl)]);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.getByText('用户笔记正文',{exact:true})).toBeVisible();

  await second.getByRole('button',{name:'Switch project',exact:true}).click();
  const rows=second.locator('.project-row');
  await expect(rows.nth(1)).toHaveAccessibleName('Inbox');
  await expect(rows.nth(2)).toHaveAccessibleName('收件箱');

  const openSettings=async()=>page.getByRole('button',{name:'More',exact:true}).first().click();
  const selectLanguage=async(name,option)=>{
   await page.getByRole('combobox',{name,exact:true}).click();
   await page.getByRole('option',{name:option,exact:true}).click();
  };
  await openSettings();
  await selectLanguage('Display language','简体中文');
  await expect(page.getByRole('combobox',{name:'界面语言'})).toBeVisible();
  await expect(rows.nth(1)).toHaveAccessibleName('收件箱');
  await expect(second.locator('html')).toHaveAttribute('lang','zh-CN');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await page.getByRole('button',{name:'更多',exact:true}).first().click();
  await selectLanguage('界面语言','English');
  await expect(rows.nth(1)).toHaveAccessibleName('Inbox');
  await expect(second.locator('html')).toHaveAttribute('lang','en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');

  await openSettings();
  await page.getByRole('tab',{name:'Tools'}).click();
  await page.getByRole('button',{name:'Export templates',exact:true}).click();
  const storedTemplates=await page.evaluate(()=>localStorage.getItem('devpad-export-templates'));
  const templateTitle=page.getByRole('textbox',{name:'Template name'});
  const templateBody=page.getByRole('textbox',{name:'Template content'});
  await expect(templateTitle).toHaveValue('Engineering task');
  await expect(templateBody).toHaveValue(/Make the changes described below/);
  await page.getByRole('combobox',{name:'Edit template'}).click();
  await page.getByRole('option',{name:'工程任务',exact:true}).click();
  await expect(templateTitle).toHaveValue('工程任务');
  await expect(templateBody).toHaveValue('用户编写的提示 {{content}}');
  await page.getByRole('button',{name:'Save templates',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Templates saved');
  const savedTemplates=await page.evaluate(()=>localStorage.getItem('devpad-export-templates'));
  expect(savedTemplates).toBe(storedTemplates);

  await page.getByRole('button',{name:'Close panel',exact:true}).click();
  await openSettings();
  await selectLanguage('Display language','System default');
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'language',{configurable:true,value:'zh-CN'});
   window.dispatchEvent(new Event('languagechange'));
  });
  await expect(page.getByRole('combobox',{name:'界面语言'})).toHaveText('跟随系统');
  await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await expect(second.locator('html')).toHaveAttribute('lang','en');
  const registry=require('../src/locales/registry.json');
  const preference=page.locator('.settings-page:not([hidden]) [role=combobox]').nth(1);
  await page.setViewportSize({width:400,height:320});
  for(const item of registry){
   await preference.click();
   await expect(page.getByRole('option')).toHaveCount(registry.length+1);
   await page.getByRole('option',{name:item.label,exact:true}).click();
   const dictionary=item.code==='zh-CN'?{}:require('../src/locales/messages/'+item.code+'.json');
   await expect(page.locator('html')).toHaveAttribute('lang',item.code);
   await expect(page.locator('html')).toHaveAttribute('dir',item.direction||'ltr');
   await expect(second.locator('html')).toHaveAttribute('lang',item.code);
   await expect(rows.nth(1)).toHaveAccessibleName(dictionary['收件箱']||'收件箱');
   await expect(rows.nth(2)).toHaveAccessibleName('收件箱');
   await expect(page.getByRole('tab',{name:dictionary['通用']||'通用',exact:true})).toHaveAttribute('aria-selected','true');
   await expect(page.getByRole('combobox',{name:dictionary['界面语言']||'界面语言',exact:true})).toHaveText(item.label);
   const overflow=await page.locator('.settings').evaluate(el=>el.scrollWidth>el.clientWidth+1);
   expect(overflow,'settings overflow in '+item.code).toBe(false);
  }
 }finally{await context.close();}
}

module.exports=checkLanguages;
