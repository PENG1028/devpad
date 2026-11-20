import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compose,exportTemplates,originalOutput,type Entry} from './core.ts';
const note=(id:string):Entry=>({id,projectId:'p',type:'Note',text:'  正文 '+id+'\nOpen 是原文的一部分\n',createdAt:'now',updatedAt:'now',status:'Open',tags:['标签'],attachments:[{id:id+'a',name:'同名图片.jpg',path:'attachments/'+id+'.jpg'},{id:id+'b',name:'同名图片.webp',path:'attachments/'+id+'.webp'}],references:[]});
test('纯文本回退把原文件名放在各自正文下，独立复制正文保留原文',()=>{
 const a=note('a'),b=note('b');
 b.text='';b.attachments[0].name='单独的原图.jpg';
 const output=originalOutput([b,a]);
 assert.equal(output.clipboardText,'[图片] 单独的原图.jpg\n[图片] 002-同名图片.webp\n\n'+a.text+'\n[图片] 同名图片.jpg\n[图片] 004-同名图片.webp');
 assert.deepEqual(output.manifest.records.map(record=>record.files[1].displayName),[output.files[1].name,output.files[3].name]);
 assert.equal(output.text,'\n\n'+a.text);
 assert.deepEqual(output.manifest.records.map(record=>record.id),['b','a']);
});
test('默认复制逐字保留正文，不加入状态、工程指令或引用内容',()=>{const a=note('a'),b=note('b');a.references=['b'];const out=compose('项目',[a],[a,b]);assert.equal(out.text,a.text);assert.equal(out.count,1);assert.ok(out.files.every(f=>!f.mark));assert.equal(out.files[0].name.endsWith('.jpg'),true);});
test('多选图文模板保留所有原图与逐条映射，顺序一致且不修改源记录',()=>{const records=[note('b'),note('a')],before=JSON.stringify(records);const out=compose('项目',records,records,'12345678',exportTemplates[1]);assert.equal(out.files.length,4);assert.equal(new Set(out.files.map(f=>f.name)).size,4);out.files.forEach(f=>assert.ok(out.text.includes(f.name)));assert.equal(out.manifest.records[0].id,'b');assert.equal(out.manifest.records[1].files[1].attachmentId,'ab');assert.equal(JSON.stringify(records),before);assert.ok(!JSON.stringify(out.manifest).includes('attachments/'));});
test('引用、状态和图内编号均需显式启用；循环引用安全',()=>{const a=note('a'),b=note('b');a.references=['b'];b.references=['a'];const out=compose('项目',[a],[a,b],'BATCH',{...exportTemplates[1],metadata:true,references:true,numberImages:true});assert.equal(out.count,2);assert.ok(out.text.includes('状态：Open'));assert.ok(out.files.every(f=>f.mark&&f.name.endsWith('.png')));});
test('模板变量取自内容，不执行脚本；未知变量提示错误',()=>{const a=note('a');const out=compose('$()项目',[a],[a],'B',{...exportTemplates[0],body:'{{project}}\n{{content}}\n{{batch}}'});assert.equal(out.text,'$()项目\n'+a.text+'\nB');assert.throws(()=>compose('',[],[],'',{...exportTemplates[0],body:'{{unknown}}'}),/未知模板变量/);});
