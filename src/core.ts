export const types = ['Bug','UX','Feature','Idea','Question','Note'] as const;
export type Attachment = {id:string;name:string;path:string};
export type Entry = {id:string;projectId:string;type:string;text:string;createdAt:string;updatedAt:string;tags:string[];attachments:Attachment[];status:string;references:string[]};
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
export function compose(project:string,entries:Entry[],all:Entry[]=entries,batch='PREVIEW'){
 const expanded:Entry[]=[]; const seen=new Set<string>();
 function add(e:Entry){if(seen.has(e.id))return;seen.add(e.id);expanded.push(e);for(const id of e.references){const ref=all.find(x=>x.id===id);if(ref)add(ref);}}
 entries.forEach(add);let index=0;
 const files: {source:string;name:string;mark:{record:number;picture:number;batch:string}}[]=[];
 const sections=expanded.map((e,i)=>{const names=e.attachments.map((a,j)=>{const label=`记录 ${String(i+1).padStart(2,'0')} · 图片 ${String(j+1).padStart(2,'0')}`;const name=`${batch}-R${i+1}-P${j+1}-${bundleName(a,index++).replace(/\.[^.]+$/,'.png')}`;files.push({source:a.path,name,mark:{record:i+1,picture:j+1,batch}});return `${label}（${name}）`;});return `## ${i+1}. ${e.type} · ${e.id.slice(0,8)} · 记录 ${String(i+1).padStart(2,'0')}\n\n${e.text}\n\n状态：${e.status}${e.tags.length?'\n标签：'+e.tags.join(', '):''}${names.length?'\n附件：\n'+names.map(n=>'- '+n).join('\n'):''}`;});
 return {count:expanded.length,text:`# ${project} · 本轮开发上下文\n\n交付批次：${batch}\n请先识别重复问题与修改冲突，再统一实施并说明验证结果。Done 记录仅作背景参考；不确定之处请明确指出。\n图片按图上“批次、记录、图片”编号对应，不依赖上传文件名或排列顺序。未收到或看不清的图片请明确指出，不要猜测。\n\n---\n\n${sections.join('\n\n---\n\n')}`,files};
}
