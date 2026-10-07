export const types = ['Bug','UX','Feature','Idea','Question','Note'] as const;
export type Attachment = {id:string;name:string;path:string};
export type Entry = {revision?:number;id:string;projectId:string;type:string;text:string;createdAt:string;updatedAt:string;tags:string[];attachments:Attachment[];status:string;references:string[]};
export type Project = {id:string;name:string};
export function editorSignature(value:{projectId:string;type:string;text:string;tagInput:string;attachments:Attachment[];references:string[]}){
 return JSON.stringify({projectId:value.projectId,type:value.type,text:value.text.replace(/\r\n?/g,'\n'),tags:tagsOf(value.tagInput).sort(),attachments:value.attachments.map(a=>[a.id,a.name,a.path]),references:[...value.references]});
}
export type DeliverySession = {project:Project; selected:string[]; records:Entry[]; batch:string};
export function expandEntries(selected:Entry[],all:Entry[]):Entry[]{
 const result:Entry[]=[],seen=new Set<string>();
 function add(e:Entry){if(seen.has(e.id))return;seen.add(e.id);result.push(e);e.references.forEach(id=>{const ref=all.find(r=>r.id===id);if(ref)add(ref);});}
 selected.forEach(add);return result;
}
export function createDelivery(project:Project,selected:Entry[],all:Entry[],batch=crypto.randomUUID().slice(0,8).toUpperCase()):DeliverySession{
 return JSON.parse(JSON.stringify({project,selected:selected.map(e=>e.id),records:expandEntries(selected,all),batch}));
}
export function deliveryFingerprint(session:DeliverySession){
 return JSON.stringify({project:session.project,selected:session.selected,records:session.records.map(({updatedAt,...e})=>e)});
}
export function sourceChanged(session:DeliverySession,entries:Entry[]):boolean{
 return session.records.some(old=>{const current=entries.find(e=>e.id===old.id);if(!current)return true;const {updatedAt:a,...before}=old;const {updatedAt:b,...after}=current;return JSON.stringify(before)!==JSON.stringify(after);}) || session.records.some(e=>e.references.some(id=>!session.records.some(r=>r.id===id)&&entries.some(r=>r.id===id)));
}
export function tagsOf(text:string):string[]{return [...new Set([...text.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map(x=>x[1]))];}
export function bundleName(a:Attachment,index:number){
 const stem=a.name.replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[ .]+$/,'').slice(0,40)||'图片';
 const extension=a.path.split('.').pop()?.toLowerCase();const ext=['png','jpg','jpeg','webp'].includes(extension||'')?extension:'png';
 return `${String(index+1).padStart(3,'0')}-${stem}.${ext}`;
}
export type ExportTemplate = {id:string;name:string;body:string;metadata:boolean;references:boolean;numberImages:boolean};
export const exportTemplates:ExportTemplate[] = [
 {id:'source',name:'原文',body:'{{content}}',metadata:false,references:false,numberImages:false},
 {id:'materials',name:'图文资料',body:'{{content}}\n\n{{image_map}}',metadata:false,references:false,numberImages:false},
 {id:'discussion',name:'讨论分析',body:'请根据以下资料进行分析：\n\n{{content}}\n\n{{image_map}}',metadata:false,references:false,numberImages:false},
 {id:'engineering',name:'工程任务',body:'请根据以下内容实施修改，并说明验证结果：\n\n{{content}}\n\n{{image_map}}',metadata:false,references:true,numberImages:false}
];
export function compose(project:string,entries:Entry[],all:Entry[]=entries,batch='PREVIEW',template:ExportTemplate=exportTemplates[0]){
 const records=template.references?expandEntries(entries,all):entries;
 const files:{source:string;name:string;record:number;picture:number;attachmentId:string;mark?:{record:number;picture:number;batch:string}}[]=[];
 const imageMap:string[]=[];
 const content=records.map((e,i)=>{
  e.attachments.forEach((a,j)=>{
   let name=`${batch}-R${i+1}-P${j+1}-${bundleName(a,files.length)}`;
   if(template.numberImages)name=name.replace(/\.[^.]+$/,'.png');
   files.push({source:a.path,name,record:i+1,picture:j+1,attachmentId:a.id,...(template.numberImages?{mark:{record:i+1,picture:j+1,batch}}:{})});
   imageMap.push(`记录 ${i+1} · 图片 ${j+1}：![${a.name.replace(/[\[\]\r\n]/g,' ')}](<${name}>)`);
  });
  return template.metadata?`## ${i+1}. ${e.type}\n\n${e.text}\n\n状态：${e.status}${e.tags.length?'\n标签：'+e.tags.join(', '):''}`:e.text;
 }).join('\n\n');
 const variables:Record<string,string>={content,image_map:imageMap.join('\n\n'),project,batch};
 const rendered=template.body.replace(/\{\{\s*([^{}]*?)\s*\}\}/g,(_,key:string)=>{key=key.trim();if(!Object.hasOwn(variables,key))throw new Error(`未知模板变量：${key}`);return variables[key];});
 return {count:records.length,text:rendered,files,manifest:{version:1,template:template.id,batch,records:records.map((e,i)=>({id:e.id,text:e.text,files:files.filter(f=>f.record===i+1).map(({source,mark,...f})=>f)}))}};
}
