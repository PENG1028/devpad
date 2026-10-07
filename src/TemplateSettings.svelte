<script lang="ts">
 import {loadTemplates,defaultTemplate,saveTemplates} from './templates';
 import {compose,type ExportTemplate} from './core';
 import SelectField from './SelectField.svelte';
 let templates=$state(loadTemplates()),selected=$state(defaultTemplate().id),preferred=$state(defaultTemplate().id),message=$state('');
 const current=$derived(templates.find(t=>t.id===selected)!);
 function change(key:keyof ExportTemplate,value:string|boolean){templates=templates.map(t=>t.id===selected?{...t,[key]:value}:t);message='';}
 function add(){const id=crypto.randomUUID();templates=[...templates,{...current,id,name:'自定义模板'}];selected=id;}
 function save(){try{for(const t of templates){if(!t.name.trim())throw new Error('请填写模板名称');compose('示例',[],[],'A1B2C3D4',t);}saveTemplates(templates,preferred);message='模板已保存';}catch(e){message=String(e);}}
</script>
<section aria-label="导出模板设置">
 <h3>导出模板</h3>
 <SelectField label="编辑模板" value={selected} onchange={v=>selected=v} options={templates.map(t=>({value:t.id,label:t.name}))}/>
 <label>名称<input aria-label="模板名称" value={current.name} oninput={e=>change('name',e.currentTarget.value)}/></label>
 <textarea aria-label="模板内容" rows="6" value={current.body} oninput={e=>change('body',e.currentTarget.value)}></textarea>
 <p class="secondary">变量：正文 &#123;&#123;content&#125;&#125;、图片对应 &#123;&#123;image_map&#125;&#125;、项目 &#123;&#123;project&#125;&#125;、批次 &#123;&#123;batch&#125;&#125;。原文模板不会自动添加指令。</p>
 <div class="template-options">{#each [{key:'metadata',name:'带上类型、状态和标签'},{key:'references',name:'展开引用的笔记'},{key:'numberImages',name:'导出图片添加编号条'}] as option}<label><input type="checkbox" checked={current[option.key as 'metadata'|'references'|'numberImages']} onchange={e=>change(option.key as keyof ExportTemplate,e.currentTarget.checked)}/>{option.name}</label>{/each}</div>
 <label>默认模板<SelectField label="默认导出模板" bind:value={preferred} options={templates.map(t=>({value:t.id,label:t.name}))}/></label>
 <div class="template-actions"><button onclick={add}>复制为新模板</button><button class="blue-button" onclick={save}>保存模板</button></div>
 {#if message}<p role="status">{message}</p>{/if}
</section>
<style>label{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:13px}textarea{width:100%;margin-top:10px;resize:vertical;font-size:13px}.template-options{display:flex;flex-direction:column}.template-options label{margin:4px 0}.template-actions{display:flex;gap:8px}.secondary{font-size:12px;line-height:1.6}</style>
