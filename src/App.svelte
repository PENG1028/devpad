<script lang="ts">
 import { fade, slide } from 'svelte/transition';
 import { onMount, tick } from 'svelte';
 import { invoke, convertFileSrc, isTauri } from '@tauri-apps/api/core';
 import { emit, emitTo, listen } from '@tauri-apps/api/event';
 import { getCurrentWindow, Window } from '@tauri-apps/api/window';
 import Icon from './Icon.svelte';
 import UpdatePanel from './UpdatePanel.svelte';
 import HelpPanel from './HelpPanel.svelte';
 import AgentPanel from './AgentPanel.svelte';
 import TemplateSettings from './TemplateSettings.svelte';
 import SettingsPanel from './SettingsPanel.svelte';
 import {loadTemplates,defaultTemplate} from './templates';
 import SelectField from './SelectField.svelte';
 import ProjectNavigation from './ProjectNavigation.svelte';
 import ActionPopover from './ActionPopover.svelte';
 import CopyControl from './CopyControl.svelte';
 import ImageAnnotator from './ImageAnnotator.svelte';
 let annotating:Attachment|null=$state(null);
 async function saveAnnotation(data:string){const source=annotating;if(!source)return;const saved=await invoke<Attachment>('add_image',{name:source.name.replace(/\.[^.]+$/,'')+$t('-标注.png'),data});attachments=attachments.map(a=>a.id===source.id?saved:a);}
 import WindowBar from './WindowBar.svelte';
 import { preference } from './theme';
 import { t, locale, projectLabel, templateLabel, templateForLocale } from './i18n';
 import ConfirmDialog from './ConfirmDialog.svelte';
 let {suspended=false}=$props<{suspended?:boolean}>();
 let confirmation:ConfirmDialog;
 import builtinTypes from './note-types.json';
 import TagField from './TagField.svelte';
 import { shortcutTypes, fieldTags, type CustomType, tagsOf, editorSignature, compose, createDelivery, originalOutput, defaultCopyMode, sourceChanged, type CopyMode, type DeliverySession, type Entry, type Project, type Attachment } from './core';
 type Panel='agents'|'publish'|'help'|'updates'|'templates'|'drafts'|'projects'|'filters'|'more'|'entry'|'delivery'|'new-project'|'image'|'windows'|'move'|null;
 let projects:Project[]=$state([]), entries:Entry[]=$state([]), projectId=$state('');
 let customTypes:CustomType[]=$state([]), hasImages=$state(false), composingSearch=false;
 let search=$state(''), filterTypes:string[]=$state([]), status=$state(''), tag=$state('');
 let text=$state(''), type=$state('Note'), tagInput=$state(''), attachments:Attachment[]=$state([]), references:string[]=$state([]), editing=$state(''), draftProjectId=$state('');
 let selected:string[]=$state([]), anchor=$state(''), selecting=$state(false), expanded=$state(false), searching=$state(false);
 let panel:Panel=$state(null), activeEntry:Entry|null=$state(null), preview:Attachment|null=$state(null);
 let busy=$state(false), error=$state(''), notice=$state<{key:string;values?:Record<string,string|number>}|null>(null), dataDir=$state(''), projectName=$state(''), ready=$state(false);
 let retryAction=$state<(()=>Promise<void>)|null>(null), copied=$state<{id:string;mode:CopyMode}|null>(null);
 let copyOptionsFor=$state('');
 let theme=$state<'light'|'dark'|'system'>(preference()), systemDark=$state(matchMedia('(prefers-color-scheme: dark)').matches), pinned=$state(localStorage.getItem('devpad-main-on-top')==='true'), maximized=$state(false);
 let editor=$state<HTMLTextAreaElement>(null!), fileInput=$state<HTMLInputElement>(null!), searchInput=$state<HTMLInputElement>(null!);
 let modal=$state<HTMLDialogElement>(null!), imageModal=$state<HTMLDialogElement>(null!), scroller=$state<HTMLElement>(null!);
 let selectionMenu=$state<ActionPopover>(null!), recordMenu=$state<ActionPopover>(null!);
 let batchMenuOpen=$state(false), recordMenuOpen=$state(false);
 let searchTrigger=$state<HTMLButtonElement>(), projectTrigger=$state<HTMLButtonElement>(null!);
 let navigationOpen=$state(false), creatingProject=$state(false);
 let returnFromNavigation=false;
 let dockElement=$state<HTMLDivElement>(), dockAnimation:Animation|undefined, timelineAnimation:Animation|undefined;
 let searchPosition=0;
 const modifier=/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl';
 const windowKind=new URLSearchParams(location.search).get('window')||'main';
 let initialized=$state(false),initializationError=$state('');
 let editRevision=$state(0);
 let taskInstructions=$state(''),taskIds:string[]=$state([]);
 async function publishTask(){if(busy)return;busy=true;await run(async()=>{await invoke('publish_task',{ids:taskIds,instructions:taskInstructions});closePanel();selected=[];selecting=false;announce('已发布，agent 可通过 MCP 领取');});busy=false;}
 async function prepareTask(ids:string[]){taskIds=visible.filter(e=>ids.includes(e.id)).map(e=>e.id);taskInstructions='';panel='publish';await tick();modal.showModal();}
 let updateLocked=$state(false),draftStored=$state(false),draftError=$state(''),previousDraftId='';
 let recoveredDrafts:{id:string;payload:any;updatedAt:string}[]=$state([]);
 let availableTemplates=$state(loadTemplates()),templateId=$state(defaultTemplate().id);
 const exportTemplate=$derived(availableTemplates.find(t=>t.id===templateId)||availableTemplates[0]);
 function reloadTemplates(){availableTemplates=loadTemplates();templateId=defaultTemplate().id;}
 function draftPayload(){return {projectId:draftProjectId,text,type,tagInput,attachments:[...attachments],references:[...references],editing,revision:editRevision};}
 let draftQueue:Promise<void>=Promise.resolve();
 function persistDraft():Promise<void>{
  if(!canDraft||!initialized)return Promise.resolve();
  const fingerprint=editorReport().fingerprint,payload=draftPayload(),changed=dirty,previousId=previousDraftId||null;
  const operation=draftQueue.catch(()=>{}).then(async()=>{
   if(changed)await invoke('save_draft',{payload,fingerprint,previousId});
   else await invoke('discard_draft',{id:getCurrentWindow().label});
   if(changed&&previousDraftId===previousId)previousDraftId='';
   draftStored=changed&&editorReport().fingerprint===fingerprint;
   draftError='';
  });
  draftQueue=operation;
  return operation;
 }
 async function refreshDrafts(restoreMain=false){
  if(auxiliary||!isTauri())return;
  const drafts=await invoke<typeof recoveredDrafts>('list_drafts');
  const inline=drafts.find(draft=>draft.id==='main');
  if(restoreMain&&inline)applyDraft(inline.payload);
  recoveredDrafts=drafts.filter(draft=>draft.id!=='main');
 }
 function applyDraft(d:ReturnType<typeof draftPayload>){
  const old=entries.find(e=>e.id===d.editing);
  draftProjectId=old?.projectId||d.projectId;
  if(old)loadEntry(old);
  editing=d.editing||'';editRevision=d.revision||0;
  text=d.text;type=d.type;tagInput=d.tagInput;attachments=d.attachments;references=d.references;editorDetails=type!=='Note';
 }
 async function restoreDraft(draft:typeof recoveredDrafts[number]){await openEditor({projectId:draft.payload.projectId,draft:draft.payload,draftId:draft.id});closePanel();await refreshDrafts();}
 let draftMayExist=false;
 $effect(()=>{
  if(!canDraft||!initialized||busy)return;
  const changed=dirty;
  editorReport().fingerprint;
  if(!changed&&!draftMayExist)return;
  draftMayExist=changed;
  draftStored=false;
  const timer=setTimeout(()=>void persistDraft().catch(e=>draftError=String(e)),350);
  return()=>clearTimeout(timer);
 });
 let openWindows:{label:string;project:string;summary:string;dirty:boolean}[]=$state([]);
 let draftGeneration=0;
 let moveIds:string[]=$state([]),moveTarget=$state('');
 const moveProjects=$derived(projects.filter(project=>!moveIds.every(id=>entries.find(entry=>entry.id===id)?.projectId===project.id)));
 function dismissMenus(){copyOptionsFor='';selectionMenu?.close();recordMenu?.close();}
 function offerCopies(id:string,open:boolean){
  if(open && !recordMenuOpen && !panel && !selecting)copyOptionsFor=id;
  else if(copyOptionsFor===id)copyOptionsFor='';
 }
 function toggleSelection(){collapseFeedback='';dismissMenus();if(selecting){selecting=false;selected=[];anchor='';}else void selectMode();}
 async function openMove(ids:string[]){dismissMenus();moveIds=[...ids];moveTarget=moveProjects[0]?.id||'';panel='move';await tick();if(!modal.open)modal.showModal();}
 async function moveNotes(){if(busy||!moveTarget||!moveIds.length)return;busy=true;await run(async()=>{await invoke('move_entries',{ids:moveIds,projectId:moveTarget,updatedAt:new Date().toISOString()});await emit('db-changed');await refresh();selected=[];selecting=false;closePanel();announce('已移动 {count} 条笔记到 {project}',{count:moveIds.length,project:displayProject(projects.find(p=>p.id===moveTarget),$t('目标项目'))});});busy=false;}
 const auxiliary=isTauri()&&windowKind!=='main';
 const editorWindow=auxiliary&&windowKind==='editor';
 const panelWindow=auxiliary&&!editorWindow&&windowKind!=='bubble';
 const canDraft=isTauri()&&(!auxiliary||editorWindow);
 let viewportWidth=$state(innerWidth),viewportHeight=$state(innerHeight);
 $effect(()=>{if(!suspended){viewportWidth=innerWidth;viewportHeight=innerHeight;}});
 const wideOrganizer=$derived(viewportWidth>=760&&viewportHeight>=460);
 const organizerPanel=(value:Panel)=>!!value&&['projects','filters','new-project'].includes(value);
 const compactNavigation=$derived(navigationOpen&&!wideOrganizer&&!auxiliary);
 let dragging=$state(false), dragDepth=0;
 let allowClose=false;
 const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?0:160;
 const dockMode=$derived(selecting?'selection':expanded?'editor':'capture');
 $effect.pre(()=>{
  // Measure the dock before swapping its contents so the timeline and the input move together.
  const mode=dockMode;
  if(auxiliary||!dockElement||!motion())return;
  const element=dockElement, from=element.getBoundingClientRect().height;
  dockAnimation?.cancel();
  let cancelled=false;
  tick().then(()=>{
   if(cancelled||mode!==dockMode)return;
   const to=element.getBoundingClientRect().height;
   if(Math.abs(to-from)>1)dockAnimation=element.animate([{height:from+'px'},{height:to+'px'}],{duration:160,easing:'cubic-bezier(.2,0,0,1)'});
  });
  return()=>{cancelled=true;};
 });
 $effect(()=>{if(notice){const timer=setTimeout(()=>notice=null,5000);return()=>clearTimeout(timer);}});
 $effect(()=>{if(copied){const timer=setTimeout(()=>copied=null,1700);return()=>clearTimeout(timer);}});
 function announce(key:string,values?:Record<string,string|number>){notice={key,values};}
 function editorReport(){return {dirty,busy:busy||!initialized,entry:editing,project:displayProject(draftProject,draftProjectId),summary:text.slice(0,60)||(attachments.length?$t('图片笔记'):$t('新笔记')),fingerprint:JSON.stringify(draftPayload())};}
 $effect(()=>{if(canDraft&&initialized)void invoke('editor_dirty',editorReport());});
 function snapshot(){return {projectId,selected:[...selected],filterTypes:[...filterTypes],status,tag,hasImages,search,projectName};}
 let filterKey='';
 $effect(()=>{const next=JSON.stringify({projectId,filterTypes,status,tag,hasImages,search});if(filterKey!==next){filterKey=next;selected=[];anchor='';}});
 async function sendMain(action:string,data:unknown={}){await emitTo('main','main-action',{action,data});}
 async function openEditor(data:Record<string,unknown>={}){await run(async()=>{await invoke('open_aux',{kind:'editor',payload:{projectId:defaultProjectId,...data}});});}
 async function acceptAux(payload:any){
  const data=payload.data||{};
  if(editorWindow){
   if(payload.kind!=='editor'||initialized)return;
   if(data.entry)loadEntry(data.entry);
   else if(!dirty){draftProjectId=data.projectId||defaultProjectId;if(data.type){type=data.type;editorDetails=type!=='Note';}}
   if(data.attachments?.length)attachments=[...attachments,...data.attachments];
   if(data.text)text+=data.text;
   if(data.draft){applyDraft(data.draft);previousDraftId=data.draftId||'';}
   expanded=true;await tick();editor?.focus();return;
  }
  if(windowKind==='delivery'&&payload.kind!=='delivery')return;
  if(windowKind==='image'&&payload.kind!=='image')return;
  if(payload.kind==='delivery'){deliverySession=data.session;deliveryBatch=data.session.batch;deliveryOrder='selected';deliveryFormat='original';}
  preview=data.preview||null;projectId=data.projectId||projectId;selected=data.selected||[];filterTypes=data.filterTypes||[];status=data.status||'';tag=data.tag||'';hasImages=!!data.hasImages;search=data.search||'';projectName=data.projectName||'';
  panel=payload.kind;await tick();if(!modal.open)modal.show();
  const prompt=modal.querySelector<HTMLTextAreaElement>('.prompt-preview');if(prompt){prompt.setSelectionRange(0,0);prompt.scrollTop=0;}
 }
 async function selectMode(){selecting=true;expanded=false;closePanel();}
 let startup=$state(false), startupBusy=$state(false), pinBusy=$state(false);
 async function readDesktopPreferences(){
  if(startupBusy||pinBusy)return;
  startupBusy=true;pinBusy=true;
  try{
   [startup,pinned]=await Promise.all([invoke<boolean>('startup_enabled'),getCurrentWindow().label==='main'
    ?getCurrentWindow().isAlwaysOnTop():Window.getByLabel('main').then(win=>win?.isAlwaysOnTop()??false)]);
  }finally{startupBusy=false;pinBusy=false;}
 }
 async function choosePinned(enabled:boolean){
  if(pinBusy)return;
  pinBusy=true;
  try{await run(async()=>{
   if(!isTauri()){pinned=enabled;localStorage.setItem('devpad-main-on-top',String(enabled));return;}
   const main=await Window.getByLabel('main');
   if(!main)throw new Error($t('主窗口未打开'));
   await main.setAlwaysOnTop(enabled);pinned=await main.isAlwaysOnTop();
   localStorage.setItem('devpad-main-on-top',String(pinned));
  });}finally{pinBusy=false;}
 }
 async function newReferenceDraft(){
  if(panelWindow){await sendMain('draft');closePanel();}
  else if(isTauri()){closePanel();await openEditor({projectId:defaultProjectId,type:'Draft'});}
  else{await newEntry();type='Draft';editorDetails=true;}
 }
 async function chooseStartup(enabled:boolean){startupBusy=true;await run(async()=>{startup=await invoke<boolean>('set_startup',{enabled});});startupBusy=false;}
 let notebookMode=$state(localStorage.getItem('devpad-notebook-mode')==='true');
 let notebookDelay=$state(Number(localStorage.getItem('devpad-notebook-delay'))||30);
 let notebookSleeping=false;
 const notebookBlocked=$derived(busy||!!annotating||updateLocked);
 let collapsing=false, collapseFeedback=$state('');
 $effect(()=>{if(!notebookBlocked)collapseFeedback='';});
 const pauseNotebook=$derived(notebookBlocked||expanded||searching||!!panel||navigationOpen||recordMenuOpen||batchMenuOpen||!!copyOptionsFor||selecting||!!preview||dragging);
 $effect(()=>{if(!auxiliary&&isTauri())void invoke('notebook_pause',{reason:'interaction',paused:pauseNotebook});});
 async function syncNotebook(){await invoke('notebook_config',{enabled:notebookMode,delaySeconds:notebookDelay,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});}
 function notebookActivity(){if(!auxiliary&&notebookMode&&!notebookSleeping&&!suspended)void invoke('notebook_activity');}
 function chooseNotebook(enabled:boolean){notebookMode=enabled;localStorage.setItem('devpad-notebook-mode',String(enabled));if(!auxiliary&&isTauri())void run(syncNotebook);}
 function chooseDelay(value:number){notebookDelay=value;localStorage.setItem('devpad-notebook-delay',String(value));if(!auxiliary&&isTauri())void run(syncNotebook);}
 async function collapseNotebook(automatic=false){
  if(suspended||collapsing||confirmation?.isOpen()||(automatic&&(!notebookMode||pauseNotebook)))return;
  if(notebookBlocked){if(!automatic)collapseFeedback=$t('笔记本正在处理文件');return;}
  const rect=document.querySelector('[data-notebook-collapse]')?.getBoundingClientRect();if(!rect)return;
  collapsing=true;collapseFeedback='';
  try {
   if(!automatic){dismissMenus();window.dispatchEvent(new Event('dismiss-note-popovers'));}
   if(canDraft&&dirty)await persistDraft();
   await invoke('notebook_collapse',{automatic,target:{x:rect.left+(rect.width-36)/2,y:rect.top+(rect.height-36)/2}});
  }catch(e){if(!automatic)collapseFeedback=String(e);}
  finally{collapsing=false;}
 }

 function dragOver(event:DragEvent){if(suspended)return;if(panelWindow)return;if(Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';dragging=true;}}
 function dragEnter(event:DragEvent){if(suspended)return;if(panelWindow)return;if(Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();dragDepth++;dragging=true;}}
 function dragLeave(){dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)dragging=false;}

 const typeOptions=$derived([
  ...builtinTypes.filter(kind=>kind.id!=='Draft').map(kind=>({value:kind.id,label:$t(kind.label),group:$t(kind.group)})),
  ...customTypes.map(kind=>({value:kind.id,label:kind.name,group:$t('自定义')})),
  {value:'Draft',label:$t('引用草稿'),group:$t('工具')},
 ]);
 const labels=$derived<Record<string,string>>(Object.fromEntries([
  ...typeOptions.map(option=>[option.value,option.label]),['Open',$t('待处理')],['Done',$t('已完成')],
 ]));
 async function addType(name:string){
  if(Array.from(name).length>40)throw new Error($t('类型名称需为 1–40 个字符'));
  const kind=await invoke<CustomType>('create_note_type',{name});
  await refresh();type=kind.id;
  if(isTauri())await emit('db-changed');
 }
 function toggleTypeFilter(id:string){filterTypes=!id?[]:filterTypes.includes(id)?filterTypes.filter(value=>value!==id):[...filterTypes,id];}
 const filterCount=$derived(filterTypes.length+Number(!!status)+Number(!!tag)+Number(hasImages));
 function tracksStatus(e:Entry){return ['Bug','UX','Feature','Idea','Question','Draft'].includes(e.type)||e.status==='Done';}
 const panelTitles=$derived<Record<string,string>>({agents:$t('Agent 与 MCP'),publish:$t('发布任务'),help:$t('帮助'),updates:$t('版本与更新'),templates:$t('导出模板'),drafts:$t('恢复草稿'),'projects':$t('项目'),'filters':$t('项目与筛选'),'more':$t('设置与工具'),'entry':$t('笔记操作'),'delivery':$t('模板与完整导出'),'new-project':$t('新建项目'),'image':$t('图片预览'),'windows':$t('已打开笔记'),'move':$t('移动到其他项目')});
 function displayProject(value:Project|undefined,fallback=''){return value?projectLabel(value,$t):fallback;}
 const project=$derived(projects.find(p=>p.id===projectId));
 const draftProject=$derived(projects.find(p=>p.id===draftProjectId));
 const defaultProjectId=$derived(projectId||projects.find(p=>p.id==='inbox')?.id||projects[0]?.id||'');
 const projectEntries=$derived(projectId?entries.filter(e=>e.projectId===projectId):entries);
 const tags=$derived([...new Set(projectEntries.flatMap(e=>e.tags))].sort((a,b)=>a.localeCompare(b,$locale)));
 const allTags=$derived([...new Set(entries.flatMap(e=>e.tags))].sort((a,b)=>a.localeCompare(b,$locale)));
 function matchesSearch(entry:Entry){
  if(!search)return true;
  const owner=projects.find(p=>p.id===entry.projectId);
  const fields=[entry.text,...entry.tags,...entry.attachments.map(image=>image.name),owner?.name||'',displayProject(owner)];
  return fields.join(' ').normalize('NFC').toLocaleLowerCase($locale).includes(search.trim().normalize('NFC').toLocaleLowerCase($locale));
 }
 const visible=$derived(projectEntries.filter(e=>(!filterTypes.length||filterTypes.includes(e.type))&&(!status||(tracksStatus(e)&&e.status===status))&&(!hasImages||e.attachments.length>0)&&(!tag||e.tags.includes(tag))&&matchesSearch(e)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)));
 const chosen=$derived(projectEntries.filter(e=>selected.includes(e.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));
 let deliverySession:DeliverySession|null=$state(null);
 let deliveryOrder=$state('selected');
 let deliveryFormat=$state<'original'|'template'>('original');
 function orderedRecords(session:DeliverySession,order:string){
  const records=session.selected.map(id=>session.records.find(entry=>entry.id===id)).filter((entry):entry is Entry=>!!entry);
  return order==='selected'?records:records.sort((a,b)=>(Date.parse(a.createdAt)-Date.parse(b.createdAt))*(order==='oldest'?1:-1));
 }
 const deliveryEntries=$derived(deliverySession?orderedRecords(deliverySession,deliveryOrder):chosen);
 let deliveryBatch=$state(crypto.randomUUID().slice(0,8).toUpperCase());
 const bundle=$derived.by(()=>{
  const sourceProject=deliverySession?.project??project;
  const projectName=sourceProject?.id?displayProject(sourceProject):$t('工作日志');
  return compose(projectName,deliveryEntries,deliverySession?.records||entries,deliveryBatch,templateForLocale(exportTemplate,$t),$t,id=>labels[id]??id);
 });
 const deliveryOriginal=$derived(originalOutput(deliveryEntries,$t));
 const staleSource=$derived(!!deliverySession&&sourceChanged(deliverySession,entries));
 function entriesFor(ids:string[]){return visible.filter(entry=>ids.includes(entry.id));}
 function makeSession(ids:string[]){return createDelivery(project||{id:'',name:'工作日志'},entriesFor(ids),entries);}
 async function viewDelivery(session:DeliverySession){
  closePanel();
  if(isTauri()){await invoke('open_aux',{kind:'delivery',payload:{session}});return;}
  deliverySession=session;deliveryBatch=session.batch;deliveryOrder='selected';deliveryFormat='original';panel='delivery';await tick();modal.showModal();
 }
 const copiedLabels:Record<CopyMode,string>={raw:'已复制正文',images:'已复制图片',bundle:'已复制图文 · 粘贴效果由目标软件决定'};
 function copyOutput(ids:string[],mode:CopyMode){
  const records=entriesFor(ids);
  if(!records.length)return;
  const output=originalOutput(records,$t);
  const copyTo=records.length===1&&!selecting?records[0].id:'';
  dismissMenus();
  closePanel();
  return perform(async()=>{
   if(mode==='raw')await invoke('copy_text',{text:output.text});
   if(mode==='bundle')await invoke('copy_bundle',{text:output.clipboardText,files:output.files,manifest:output.manifest});
   if(mode==='images'){
    if(output.files.length===1)await invoke('copy_image',{path:output.files[0].source});
    else await invoke('copy_images',{files:output.files});
   }
   if(copyTo)copied={id:copyTo,mode};
   else announce(copiedLabels[mode]);
  });
 }
 function copySingleImage(image:Attachment){
  return perform(async()=>{await invoke('copy_image',{path:image.path});announce('已复制图片');});
 }
 async function showWindows(){
  await run(async()=>{openWindows=await invoke('editor_windows');panel='windows';await tick();if(!modal.open)modal.showModal();});
 }
 const openStatusIds=$derived(chosen.filter(e=>tracksStatus(e)&&e.status==='Open').map(e=>e.id));
 const doneStatusIds=$derived(chosen.filter(e=>tracksStatus(e)&&e.status==='Done').map(e=>e.id));
 const selectionHasText=$derived(chosen.some(entry=>entry.text.trim()));
 const selectionHasImages=$derived(chosen.some(entry=>entry.attachments.length));
 const selectionCopyMode=$derived(defaultCopyMode(selectionHasText,selectionHasImages));
 const suggestions=$derived(text.match(/#([\p{L}\p{M}\p{N}_-]*)$/u)?.[1]);
 let editBaseline=$state('');
 const editFingerprint=$derived(editorSignature({text,type,tagInput,attachments,references,projectId:draftProjectId}));
 const dirty=$derived(editing?editFingerprint!==editBaseline:!!(text||attachments.length||references.length||tagInput));
 const resolvedTheme=$derived(theme==='system'?(systemDark?'dark':'light'):theme);
 $effect(()=>{document.documentElement.dataset.theme=resolvedTheme;document.documentElement.style.colorScheme=resolvedTheme;});
 function chooseTheme(value:'light'|'dark'|'system'){theme=value;if(localStorage.getItem('devpad-theme')!==value)localStorage.setItem('devpad-theme',value);}
 async function refresh(){
  const previousProject=entries.find(e=>e.id===editing)?.projectId;
  const data=await invoke<{projects:Project[];entries:Entry[];noteTypes?:CustomType[];dataDir:string}>('load');
  const moved=data.entries.find(e=>e.id===editing);
  if(previousProject&&moved&&moved.projectId!==previousProject&&draftProjectId===previousProject){
   draftProjectId=moved.projectId;
   const baseline=JSON.parse(editBaseline);baseline.projectId=draftProjectId;editBaseline=JSON.stringify(baseline);
  }
  projects=data.projects;customTypes=data.noteTypes??[];entries=data.entries;dataDir=data.dataDir;
  selected=selected.filter(id=>visible.some(e=>e.id===id));
 }
 async function run(action:()=>Promise<void>){error='';retryAction=null;try{await action();}catch(e){error=String(e);}}
 async function perform(action:()=>Promise<void>){
  if(busy)return;
  busy=true;error='';retryAction=null;notice=null;
  try{await action();}catch(e){error=String(e);retryAction=()=>perform(action);}finally{busy=false;}
 }
 onMount(()=>{
  const clearCopyOptions=()=>{copyOptionsFor='';};
  window.addEventListener('scroll',clearCopyOptions,true);
  window.addEventListener('resize',clearCopyOptions);
  const media=matchMedia('(prefers-color-scheme: dark)');systemDark=media.matches;const changed=()=>systemDark=media.matches;media.addEventListener('change',changed);
  let stopped=false;const cleanup:(()=>void)[]=[];
  const storage=(event:StorageEvent)=>{if(event.key?.startsWith('devpad-export')||event.key==='devpad-default-template')reloadTemplates();if(event.key==='devpad-theme')theme=preference();if(event.key==='devpad-notebook-mode'){notebookMode=localStorage.getItem('devpad-notebook-mode')==='true';if(!auxiliary)void run(async()=>{await syncNotebook();if(!notebookMode)await invoke('edge_restore',{animate:false});});}if(event.key==='devpad-notebook-delay'){notebookDelay=Number(localStorage.getItem('devpad-notebook-delay'))||30;if(!auxiliary)void syncNotebook();}};window.addEventListener('storage',storage);window.addEventListener('devpad-templates-changed',reloadTemplates);
  if(isTauri())void run(async()=>{
   const subscriptions=await Promise.all([
    getCurrentWindow().listen<any>('aux-input',event=>void run(()=>acceptAux(event.payload))),
    listen('db-changed',()=>void refresh().catch(e=>{if(!error)error=String(e);})),
    listen('drafts-changed',()=>void refreshDrafts().catch(e=>{if(!error)error=String(e);})),
    listen('prepare-update',()=>{if(canDraft){updateLocked=true;if(dirty&&!busy)void persistDraft().catch(e=>draftError=String(e));}}),
    listen('update-installing',()=>updateLocked=true),
    listen('update-install-failed',()=>updateLocked=false),
    getCurrentWindow().listen('notebook-collapse-request',()=>{if(!auxiliary)void collapseNotebook(true);}),
    listen('notebook-expanded',()=>{notebookSleeping=false;notebookActivity();}),
    listen('tray-hide',()=>{notebookSleeping=true;if(canDraft&&dirty&&!busy)void persistDraft().catch(e=>draftError=String(e));if(panelWindow&&panel==='filters')void sendMain('filters',{filterTypes:[...filterTypes],status,tag,hasImages,search});}),
    getCurrentWindow().listen<number>('request-exit',event=>{if(!canDraft)return;void run(async()=>{if(busy||!initialized){error=$t('正在保存或处理图片，请完成后再退出');await invoke('exit_decision',{approve:false,revision:event.payload});return;}try{await persistDraft();await invoke('exit_decision',{approve:true,revision:event.payload});}catch(e){error=String(e);await invoke('exit_decision',{approve:false,revision:event.payload});}});}),
     listen<any>('main-action',event=>{if(auxiliary)return;void run(async()=>{
      const {action,data}=event.payload;
      if(action==='project'){await refresh();await switchProject(data.id);if(data.created)await newEntry();}
      if(action==='filters'){filterTypes=data.filterTypes;status=data.status;tag=data.tag;hasImages=!!data.hasImages;search=data.search;}
      if(action==='new')await newEntry();
      if(action==='search')await openSearch();
      if(action==='draft')await openEditor({projectId:defaultProjectId,type:'Draft'});
      if(action==='select')await selectMode();
     });})
   ]);if(stopped)subscriptions.forEach(f=>f());else cleanup.push(...subscriptions);
   await refresh();
   if(auxiliary)await acceptAux(await invoke('window_payload'));
   await refreshDrafts(true);initialized=true;ready=true;if(canDraft&&dirty)await persistDraft();
   if(windowKind==='more')await readDesktopPreferences();
  }).finally(async()=>{if(auxiliary){if(!initialized)initializationError=error||$t('窗口初始化失败');await tick();await invoke('window_ready');}});
  void run(async()=>{if(!isTauri()){await refresh();ready=true;initialized=true;}if(isTauri()){const win=getCurrentWindow();if(!auxiliary && localStorage.getItem('devpad-main-on-top')==='true')await win.setAlwaysOnTop(true);maximized=await win.isMaximized();const resize=await win.onResized(async()=>{maximized=await win.isMaximized();});const moved=await win.onMoved(notebookActivity);const close=await win.onCloseRequested(async(event)=>{if(annotating){event.preventDefault();return;}if(panelWindow&&panel==='filters')await sendMain('filters',{filterTypes:[...filterTypes],status,tag,hasImages,search});if(!auxiliary){event.preventDefault();return;}if(busy){event.preventDefault();announce('正在处理，请稍后再关闭');return;}if(dirty&&!allowClose&&editorWindow){event.preventDefault();try{await persistDraft();allowClose=true;await win.close();}catch(e){error=$t('草稿保存失败：{error}',{error:String(e)});}return;}if(dirty&&!allowClose){event.preventDefault();if(await confirmation.ask('当前文字、图片和引用尚未保存。你可以继续编辑，或放弃后关闭窗口。','放弃并关闭',editorWindow?'关闭写笔记窗口？':'关闭 DevPad？','继续编辑')){allowClose=true;await win.close();}} });if(stopped){resize();close();moved();}else cleanup.push(resize,close,moved);}}).finally(async()=>{if(isTauri()&&!auxiliary){await tick();await invoke('window_ready');}});
  if(!auxiliary&&isTauri()){void syncNotebook();document.addEventListener('keydown',notebookActivity);}
  return()=>{document.removeEventListener('keydown',notebookActivity);stopped=true;window.removeEventListener('scroll',clearCopyOptions,true);window.removeEventListener('resize',clearCopyOptions);window.removeEventListener('storage',storage);window.removeEventListener('devpad-templates-changed',reloadTemplates);media.removeEventListener('change',changed);cleanup.forEach(f=>f());};
 });
 async function openPanel(value:Panel){
  dismissMenus();
  if(value==='delivery'){await run(()=>viewDelivery(makeSession(selected)));return;}
  if(organizerPanel(value)&&!auxiliary){
   if(value==='new-project')creatingProject=true;
   returnFromNavigation=false;navigationOpen=true;return;
  }
   if(auxiliary&&value&&['more','help','updates','templates','agents'].includes(value)){
    await run(async()=>{await invoke('open_aux',{kind:value,payload:snapshot()});});return;
   }
  panel=value;await tick();
  if(!value||panel!==value||modal.open)return;
  modal.showModal();
  if(value==='more'&&isTauri())void run(readDesktopPreferences);
 }
 async function afterSurfaceClose(dialog:HTMLDialogElement,release:()=>void){
  if(dialog.open)return;
  await Promise.allSettled(dialog.getAnimations().map(animation=>animation.finished));
  if(!dialog.open)release();
 }
 function closePanel(){
  if(panelWindow){void run(async()=>{if(panel==='filters')await sendMain('filters',{filterTypes:[...filterTypes],status,tag,hasImages,search});await getCurrentWindow().close();});return;}
  modal?.close();
 }
 function closeNavigation(){
  returnFromNavigation=compactNavigation;navigationOpen=false;
  if(!returnFromNavigation)projectTrigger?.focus({preventScroll:true});
 }
 function navigationClosed(){
  if(returnFromNavigation)projectTrigger?.focus({preventScroll:true});
  returnFromNavigation=false;
 }
 let editorDetails=$state(false);
 function reset(){
  draftGeneration++;editing='';editRevision=0;text='';tagInput='';attachments=[];references=[];type='Note';draftProjectId='';draftStored=false;draftError='';editorDetails=false;
 }
 async function switchProject(id:string){
  if(panelWindow){void sendMain('project',{id});closePanel();return;}
  if(id===projectId)return;
  projectId=id;
  if(!dirty&&!editing)draftProjectId=defaultProjectId;
  toggleSelectionOff();clearFilters();searchPosition=0;
  await tick();scroller?.scrollTo(0,0);
  timelineAnimation?.cancel();
  if(motion())timelineAnimation=scroller?.firstElementChild?.animate(
   [{opacity:.48,transform:'translateX(5px)'},{opacity:1,transform:'translateX(0)'}],
   {duration:160,easing:'cubic-bezier(.2,0,0,1)'});
 }
 async function createNavigationProject(name:string){
  const project=await invoke<Project>('create_project',{name});
  await refresh();await switchProject(project.id);
  if(isTauri())await emit('db-changed');
 }
 async function newProject(){
  await run(async()=>{
   const p=await invoke<Project>('create_project',{name:projectName});
   await refresh();
   if(panelWindow){await emit('db-changed');await sendMain('project',{id:p.id,created:true});closePanel();return;}
   await switchProject(p.id);projectName='';await newEntry();
  });
 }
 async function showEditor(){
  if((!ready&&!editorWindow)||busy||updateLocked)return;
  if(!draftProjectId)draftProjectId=defaultProjectId;
  if(!draftProjectId){await openPanel('new-project');return;}
  if(compactNavigation)navigationOpen=false;
  closePanel();toggleSelectionOff();expanded=true;await tick();editor?.focus();
 }
 async function newEntry(){
  if(panelWindow){await sendMain('new');closePanel();return;}
  await showEditor();
 }
 async function pauseEditor(){
  if(busy)return;
  expanded=false;
  if(dirty)try{await persistDraft();}catch(e){draftError=String(e);}
  await tick();document.querySelector<HTMLButtonElement>('.capture-bar')?.focus();
 }
 async function clearDraft(){
  const wasBusy=busy;
  busy=true;
  try{
   await draftQueue.catch(()=>{});
   if(canDraft){
    await invoke('discard_draft',{id:getCurrentWindow().label});
    if(previousDraftId)await invoke('discard_draft',{id:previousDraftId});
   }
   previousDraftId='';draftMayExist=false;reset();
  }finally{busy=wasBusy;}
 }
 async function discardEditor(){
  if(dirty&&!await confirmation.ask('丢弃后无法恢复这份草稿。','丢弃草稿','丢弃草稿？','继续编辑'))return;
  await run(async()=>{
   await clearDraft();
   expanded=editorWindow;
   if(editorWindow)draftProjectId=defaultProjectId;
  });
 }
 async function save(){
  if(busy||updateLocked||!draftProjectId||(!text.trim()&&!attachments.length))return;
  busy=true;error='';retryAction=null;
  const wasEditing=!!editing;
  try{
   const old=entries.find(e=>e.id===editing);
   if(editing&&!old)throw new Error($t('原记录已删除，请复制内容后新建记录'));
   const now=new Date().toISOString();
   const entry:Entry={revision:editRevision,id:editing||crypto.randomUUID(),projectId:draftProjectId,type,text,attachments:[...attachments],tags:[...new Set([...tagsOf(text),...fieldTags(tagInput)])],status:old?.status||'Open',createdAt:old?.createdAt||now,updatedAt:now,references:[...references]};
   await draftQueue.catch(()=>{});
   if(previousDraftId)await persistDraft();
   await invoke('save_entry',{entry,consumeDraft:canDraft});
   previousDraftId='';draftMayExist=false;
   reset();expanded=!editorWindow;
   const inCurrentProject=!projectId||projectId===entry.projectId;
   if(!wasEditing&&!editorWindow&&inCurrentProject){
    clearFilters();search='';searching=false;searchPosition=0;
   }
   await refresh();
   if(isTauri())await emit('db-changed');
   if(inCurrentProject)announce('已保存');
   else announce('已保存到{project}',{project:displayProject(projects.find(p=>p.id===entry.projectId),$t('原项目'))});
   if(!editorWindow){
    await tick();if(!wasEditing&&inCurrentProject)scroller?.scrollTo(0,0);
    draftProjectId=defaultProjectId;
   }
  }catch(e){error=String(e);if(dirty)retryAction=save;}
  finally{busy=false;}
  await tick();
  if(editorWindow&&!dirty&&!error){await invoke('editor_dirty',editorReport());await getCurrentWindow().close();}
  else if(expanded)editor?.focus();
 }
 function loadEntry(entry:Entry){
  draftProjectId=entry.projectId;editing=entry.id;editRevision=entry.revision||0;
  text=entry.text.replace(/\r\n?/g,'\n');type=entry.type;
  tagInput=entry.tags.filter(tag=>!tagsOf(entry.text).includes(tag)).map(tag=>'#'+tag).join(' ');
  attachments=[...entry.attachments];references=[...entry.references];
  editBaseline=editorSignature({text,type,tagInput,attachments,references,projectId:draftProjectId});
  editorDetails=entry.type!=='Note';
 }
 async function edit(entry:Entry){
  if(busy)return;
  if(dirty&&editing!==entry.id){
   if(isTauri()&&!editorWindow){closePanel();await openEditor({entry,projectId:entry.projectId});return;}
   if(!await confirmation.ask('放弃当前未保存的输入并编辑这条记录？'))return;
   await clearDraft();
  }
  if(editing!==entry.id||!dirty)loadEntry(entry);
  await showEditor();
 }
 function toggleSelectionOff(){collapseFeedback='';dismissMenus();selecting=false;selected=[];anchor='';}
 function selectTo(entry:Entry){
  const previous=visible.findIndex(note=>note.id===anchor);
  const start=previous<0?0:previous,end=visible.findIndex(note=>note.id===entry.id);
  if(end<0)return;
  const range=visible.slice(Math.min(start,end),Math.max(start,end)+1);
  selected=[...new Set([...selected,...range.map(note=>note.id)])];
  if(previous<0)anchor=visible[start].id;
 }
 function select(e:Entry,event:MouseEvent){
  selecting=true;expanded=false;copyOptionsFor='';
  if(event.shiftKey){selectTo(e);return;}
  if(selected.includes(e.id)){
   selected=selected.filter(id=>id!==e.id);
   if(anchor===e.id)anchor=selected.at(-1)||'';
  }else{selected=[...selected,e.id];anchor=e.id;}
 }
 function selectAll(){selecting=true;expanded=false;selected=visible.map(e=>e.id);anchor=selected[0]||'';}
 async function batch(next:string,ids=selected){
  if(busy||!ids.length)return;
  if(next==='Delete'&&!await confirmation.ask($t('将删除选中的 {count} 条记录，此操作不可撤销。',{count:ids.length}),'删除记录','删除这些记录？','保留记录'))return;
  busy=true;
  await run(async()=>{
   await invoke('batch',{ids,status:next,updatedAt:new Date().toISOString()});
   if(next==='Delete'&&ids.includes(editing)){await clearDraft();expanded=false;}
   await refresh();
   if(isTauri())await emit('db-changed');
   selected=selected.filter(id=>!ids.includes(id));dismissMenus();closePanel();
   announce(next==='Delete'?'已删除记录':'已更新状态');
  });
  busy=false;
 }
 async function importFiles(files:File[]){
  if(panelWindow||!files.length||busy||updateLocked)return;
  await showEditor();if(!expanded||!draftProjectId)return;
  const generation=draftGeneration;
  busy=true;
  await run(async()=>{
   for(const file of files){
    if(!/\.(png|jpe?g|webp)$/i.test(file.name)&&!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error($t('仅支持 PNG、JPG、WebP 图片'));
    if(file.size>25*1024*1024)throw new Error($t('单张图片请小于 25 MB'));
    const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
    const attachment=await invoke<Attachment>('add_image',{name:file.name,data});
    if(generation!==draftGeneration)throw new Error($t('编辑位置已改变，请重新添加图片'));
    attachments=[...attachments,attachment];
   }
  });
  busy=false;await tick();editor?.focus();
 }
 function canPasteIntoNote(target:EventTarget|null){const element=target as HTMLElement|null;return !annotating&&!panelWindow&&!compactNavigation&&!confirmation?.isOpen()&&!modal?.open&&!imageModal?.open&&(element===editor||!element?.closest('input,textarea,select,[contenteditable="true"],.project-navigation,.action-popover'));}
 async function nativePaste(){
  if(busy){announce('正在处理，请稍后再粘贴');return;}
   const entryId=editing,generation=draftGeneration;
  const start=document.activeElement===editor?editor.selectionStart:text.length,end=document.activeElement===editor?editor.selectionEnd:text.length;
  busy=true;
  await run(async()=>{
   const content=await invoke<{attachments:Attachment[];text:string}>('paste_clipboard');
   if(generation!==draftGeneration||entryId!==editing||updateLocked){announce('编辑位置已改变，请重新粘贴');return;}
   if(!content.attachments.length&&!content.text){announce('剪贴板中没有可粘贴的图片或文字');return;}
   if(!draftProjectId)draftProjectId=defaultProjectId;
    if(!draftProjectId)return;
    toggleSelectionOff();expanded=true;await tick();
   if(content.attachments.length){attachments=[...attachments,...content.attachments];announce('已粘贴 {count} 张图片',{count:content.attachments.length});}
   if(content.text){editor.setRangeText(content.text,start,end,'end');text=editor.value;if(!content.attachments.length)announce('已粘贴文字');}
  });
  busy=false;await tick();if(expanded)editor?.focus();
 }
 function paste(event:ClipboardEvent){if(suspended)return;
  if(event.defaultPrevented||!canPasteIntoNote(event.target))return;
  const files=Array.from(event.clipboardData?.files||[]);
  if(files.length){event.preventDefault();void importFiles(files);}
 }
 function drop(event:DragEvent){if(suspended)return;event.preventDefault();event.stopPropagation();dragging=false;dragDepth=0;void importFiles(Array.from(event.dataTransfer?.files||[]));}
 function exportDelivery(){
  const output=deliveryFormat==='original'?{...deliveryOriginal,text:deliveryOriginal.markdown}:bundle;
  return perform(async()=>{
   const path=await invoke<string|null>('export_bundle',{text:output.text,files:output.files,manifest:output.manifest});
   if(path)announce('已导出图文');
  });
 }
 async function openSearch(){
  if(auxiliary){await sendMain('search');return;}
  if(!searching)searchPosition=scroller?.scrollTop||0;
  searching=true;closePanel();await tick();searchInput?.focus();
 }
 async function closeSearch(){
  search='';searching=false;await tick();scroller?.scrollTo(0,searchPosition);searchTrigger?.focus();
 }
 async function changeSearch(value:string){
  search=value;await tick();scroller?.scrollTo(0,value?0:searchPosition);
 }
 function key(event:KeyboardEvent){
  if(event.defaultPrevented||suspended||annotating||updateLocked||event.isComposing||confirmation?.isOpen())return;
  const target=event.target as HTMLElement;
  const input=['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable;
  if(event.key==='Escape'){
   if(copyOptionsFor){event.preventDefault();copyOptionsFor='';return;}
   if(imageModal?.open||modal?.open)return;
   if(compactNavigation)return;
   if(navigationOpen&&(target.closest('.project-navigation')||target===projectTrigger)){event.preventDefault();void closeNavigation();return;}
   if(editorWindow){void windowAction('close');return;}
   if(searching&&target.closest('.search-row')){event.preventDefault();void closeSearch();return;}
   if(expanded){event.preventDefault();void pauseEditor();return;}
   if(selecting){event.preventDefault();toggleSelectionOff();return;}
   if(searching){event.preventDefault();void closeSearch();return;}
   if(navigationOpen){event.preventDefault();void closeNavigation();}
   return;
  }
  if(panelWindow||modal?.open||imageModal?.open||compactNavigation||batchMenuOpen||recordMenuOpen||
    target.closest('.nav-create,[role="listbox"]'))return;
  const command=event.ctrlKey||event.metaKey;
  const lower=event.key.toLowerCase();
  if(command&&!event.altKey&&!event.shiftKey&&lower==='v'&&isTauri()&&canPasteIntoNote(event.target)){event.preventDefault();void nativePaste();}
  if(command&&event.key==='Enter'&&expanded){event.preventDefault();void save();}
  if(command&&lower==='n'){event.preventDefault();void newEntry();}
  if(command&&lower==='f'&&!editorWindow){event.preventDefault();void openSearch();}
  if(command&&lower==='a'&&!input&&!editorWindow&&!event.shiftKey&&!event.altKey){event.preventDefault();selectAll();}
  if(command&&lower==='c'&&!input&&selecting&&selected.length&&!window.getSelection()?.toString()){
   event.preventDefault();void copyOutput(selected,selectionCopyMode);
  }
  if(event.altKey&&/^[1-6]$/.test(event.key)&&!input){event.preventDefault();type=shortcutTypes[Number(event.key)-1];editorDetails=true;void showEditor();}
 }
 async function showImage(a:Attachment,trigger:HTMLButtonElement){
  trigger.focus({preventScroll:true});preview=a;await tick();imageModal.showModal();
 }
 function moveRef(index:number,delta:number){const next=[...references];[next[index],next[index+delta]]=[next[index+delta],next[index]];references=next;}
 function clearFilters(){filterTypes=[];status='';tag='';hasImages=false;}
 function day(value:string){
  const date=new Date(value),today=new Date(),yesterday=new Date();
  yesterday.setDate(today.getDate()-1);
  if(date.toDateString()===today.toDateString())return $t('今天');
  if(date.toDateString()===yesterday.toDateString())return $t('昨天');
  return date.toLocaleDateString($locale,{year:'numeric',month:'long',day:'numeric'});
 }
 async function windowAction(action:'minimize'|'maximize'|'close'|'drag'){if(!isTauri())return;await run(async()=>{const win=getCurrentWindow();if(action==='minimize')await win.minimize();if(action==='maximize'){await win.toggleMaximize();maximized=await win.isMaximized();}if(action==='close')await win.close();if(action==='drag')await win.startDragging();});}
 async function entryMenu(entry:Entry,trigger:HTMLElement){
  copyOptionsFor='';activeEntry=entry;await recordMenu.show(trigger);
 }
</script>

<svelte:window onresize={()=>{if(!suspended){viewportWidth=innerWidth;viewportHeight=innerHeight;}}} onkeydown={key} onpaste={paste} ondragover={dragOver} ondragenter={dragEnter} ondragleave={dragLeave} ondrop={drop}/>
{#snippet filterFields()}
 <div class="filter-fields">
  <label>{$t('类型')}<SelectField label={$t('类型 · 可多选')} multiple={filterTypes} emptyLabel={$t('所有类型')} onchange={toggleTypeFilter}
   options={[{value:'',label:$t('所有类型')},...typeOptions]}/></label>
  <label>{$t('状态')}<SelectField label={$t('状态筛选')} bind:value={status} options={[{value:'',label:$t('所有状态')},...['Open','Done'].map(s=>({value:s,label:labels[s]}))]}/></label>
  <label>{$t('标签')}<SelectField label={$t('标签筛选')} bind:value={tag} options={[{value:'',label:$t('所有标签')},...tags.map(t=>({value:t,label:'#'+t}))]}/></label>
  <label class="images-filter">{$t('有图片')}<input type="checkbox" bind:checked={hasImages}/></label>
 </div>
 {#if filterCount && !panelWindow}<button class="blue-text clear-filter" onclick={clearFilters}>{$t('清除筛选')}</button>{/if}
{/snippet}
{#snippet feedback()}
 {#if error||notice}
  <div class="feedback journal-feedback" class:error role={error?'alert':'status'}>
   <span>{error||(notice&&$t(notice.key,notice.values))}</span>
   {#if error&&retryAction}<button disabled={busy} onclick={retryAction}>{$t('重试')}</button>{/if}
   <button aria-label={$t('关闭提示')} onclick={()=>{error='';notice=null;retryAction=null;}}><Icon name="close" size={14}/></button>
  </div>
 {/if}
{/snippet}
<div class="app-shell" role="presentation" onmouseenter={notebookActivity} class:editor-window={editorWindow} class:panel-window={panelWindow}>
 {#if auxiliary}<WindowBar title={editorWindow?$t('写记录 · {project}',{project:displayProject(draftProject,'DevPad')}):panelTitles[panel||'more']}/>{/if}
 {#if initializationError}<div class="initialization-error" role="alert">{initializationError}<button onclick={()=>location.reload()}>{$t('重试')}</button><button onclick={()=>windowAction('close')}>{$t('关闭')}</button></div>{/if}
 {#if !auxiliary}
 <header class="titlebar journal-titlebar" class:with-navigation={wideOrganizer&&navigationOpen}>
  <button id="project-picker" class="project-picker" bind:this={projectTrigger} aria-label={$t('切换项目')} aria-expanded={navigationOpen} aria-controls="project-navigation" data-tip={$t('项目列表')} onclick={()=>navigationOpen?closeNavigation():openPanel('filters')}><Icon name="menu" size={18}/></button>
  <label class="current-project" for="project-picker">{displayProject(project,$t('全部记录'))}</label>
  <div class="drag-space" role="presentation" onmousedown={(e)=>{if(e.button===0&&e.detail===1)void windowAction('drag');}} ondblclick={()=>windowAction('maximize')}></div>
  <button bind:this={searchTrigger} class="icon-button" aria-label={$t('搜索笔记')} aria-expanded={searching} data-tip={$t('搜索 · {key} F',{key:modifier})} onclick={()=>searching?closeSearch():openSearch()}><Icon name="search"/></button>
  <button class="journal-select" aria-pressed={selecting} aria-label={selecting?$t('退出多选'):$t('多选')} data-tip={selecting?$t('退出多选'):$t('多选')} onclick={toggleSelection}><Icon name="check" size={16}/><span class="selection-label" data-inactive={$t('多选')} data-active={$t('退出多选')}>{selecting?$t('退出多选'):$t('多选')}</span></button>
  {#if collapseFeedback}<span class="collapse-feedback" role="status">{collapseFeedback}<button aria-label={$t('关闭提示')} onclick={()=>collapseFeedback=''}><Icon name="close" size={13}/></button></span>{/if}
  <button data-notebook-collapse class="icon-button" aria-label={$t('收起为悬浮笔记本')} data-tip={$t('收起为悬浮笔记本')} onclick={()=>collapseNotebook()}><Icon name="notebook" size={18}/></button>
  <button class="icon-button settings-trigger" aria-label={$t('更多')} aria-haspopup="dialog" aria-expanded={panel==='more'} data-tip={$t('设置与工具')} onclick={()=>openPanel('more')}><Icon name="more"/></button>
 <div class="window-controls"><button aria-label={$t('最小化')} data-tip={$t('最小化')} onclick={()=>windowAction('minimize')}><Icon name="minimize" size={15}/></button><button aria-label={maximized?$t('还原窗口'):$t('最大化')} data-tip={maximized?$t('还原窗口'):$t('最大化')} onclick={()=>windowAction('maximize')}><Icon name={maximized?'restore':'maximize'} size={13}/></button><button class="window-close" aria-label={$t('关闭窗口')} data-tip={$t('关闭')} onclick={()=>windowAction('close')}><Icon name="close" size={17}/></button></div>
 </header>
 {/if}
 <div class="journal-layout" class:with-navigation={!auxiliary&&wideOrganizer&&navigationOpen}>
  {#if !auxiliary}
   <ProjectNavigation open={navigationOpen && (wideOrganizer || !(panel || preview || annotating))} docked={wideOrganizer}
    {projects} {entries} current={projectId} matched={visible.length} {filterCount}
    bind:creating={creatingProject} onselect={switchProject} oncreate={createNavigationProject} onclose={closeNavigation} onclosed={navigationClosed}>
    {#snippet filters()}{@render filterFields()}{/snippet}
   </ProjectNavigation>
  {/if}
  <div class="journal-workspace">
  {#if !auxiliary}
  {#if recoveredDrafts.length}<div class="journal-controls content-width"><button onclick={()=>openPanel('drafts')}>{$t('恢复草稿 · {count}',{count:recoveredDrafts.length})}</button></div>{/if}
  {#if searching}
   <div class="search-row content-width" transition:slide={{duration:motion()}}>
    <Icon name="search" size={18}/>
    <span class="sr-only" id="search-scope">{$t('搜索正文、标签、项目或图片文件名')}</span>
    <input type="search" aria-label={$t('搜索记录')} bind:this={searchInput} value={search} oncompositionstart={()=>composingSearch=true} oncompositionend={e=>{composingSearch=false;void changeSearch(e.currentTarget.value);}} oninput={e=>{if(!composingSearch&&!(e instanceof InputEvent&&e.isComposing))void changeSearch(e.currentTarget.value);}} aria-describedby="search-scope" placeholder={$t('在「{project}」中搜索',{project:displayProject(project,$t('全部记录'))})}/>
    <button aria-label={$t('关闭搜索')} onclick={closeSearch}><Icon name="close" size={18}/></button>
   </div>
  {/if}
  {#if filterCount}
   <div class="filter-summary content-width" transition:slide={{duration:motion()}} aria-label={$t('当前筛选')}>
    {#each filterTypes as filterType}<button onclick={()=>filterTypes=filterTypes.filter(v=>v!==filterType)} aria-label={$t('清除类型 {type}',{type:labels[filterType]})}>{labels[filterType]}<Icon name="close" size={12}/></button>{/each}
    {#if status}<button onclick={()=>status=''}>{labels[status]}<Icon name="close" size={12}/></button>{/if}
    {#if tag}<button onclick={()=>tag=''}>#{tag}<Icon name="close" size={12}/></button>{/if}
    {#if hasImages}<button onclick={()=>hasImages=false}>{$t('有图片')}<Icon name="close" size={12}/></button>{/if}
    <button onclick={clearFilters}>{$t('清除筛选')}</button>
   </div>
  {/if}
  <main class="notes-scroll" bind:this={scroller} aria-label={$t('工作日志')}>
   <div class="content-width notes-content journal-content">
    {#if !ready&&error}
     <div class="empty-state"><p>{$t('读取记录失败。')}</p><button onclick={()=>location.reload()}>{$t('重新打开')}</button></div>
    {:else if !ready}
     <div class="empty-state"><p>{$t('正在读取本地记录…')}</p></div>
    {:else}
     {#if !search&&!filterCount&&(!visible.length||day(visible[0].createdAt)!==$t('今天'))}
      <h2 class="day-label">{$t('今天')}</h2><p class="journal-empty">{$t('今天还没有记录。')}</p>
     {/if}
     {#each visible as e,i (e.id)}
      {#if i===0||day(visible[i-1].createdAt)!==day(e.createdAt)}<h2 class="day-label">{day(e.createdAt)}</h2>{/if}
      <article class:selected={selected.includes(e.id)} class:range-anchor={selecting&&anchor===e.id} onpointerdown={(event)=>{if((event.ctrlKey||event.metaKey||event.shiftKey)&&!(event.target as HTMLElement).closest('button'))select(e,event);}}
       oncontextmenu={(event)=>{event.preventDefault();const trigger=event.currentTarget.querySelector<HTMLButtonElement>('.note-menu');if(trigger)void entryMenu(e,trigger);}}>
       {#if selecting}
        <button class="selection-check" aria-label={$t('选择记录 {note}',{note:e.text.slice(0,30)||$t('图片记录')})} aria-pressed={selected.includes(e.id)} onclick={(event)=>select(e,event)}>{#if selected.includes(e.id)}<Icon name="check" size={15}/>{/if}</button>
       {/if}
       <div class="note-body">
        <div class="journal-note-head">
         <div class="note-meta">
          <time datetime={e.createdAt}>{new Date(e.createdAt).toLocaleTimeString($locale,{hour:'2-digit',minute:'2-digit',hour12:$locale==='en'})}</time>
          {#if !projectId}<span>{displayProject(projects.find(p=>p.id===e.projectId))}</span>{/if}
          {#if e.type!=='Note'}<span>{labels[e.type]??e.type}</span>{#if e.status==='Done'}<span>{labels[e.status]}</span>{/if}{/if}
         </div>
         {#if selecting}
          <button class="range-action" onclick={()=>selectTo(e)}>{$t('选择到这里')}</button>
         {:else}
          <div class="journal-note-actions">
           <CopyControl hasText={!!e.text.trim()} hasImages={!!e.attachments.length} disabled={busy}
            copied={copied?.id===e.id} open={copyOptionsFor===e.id} onopen={open=>offerCopies(e.id,open)}
            oncopy={mode=>copyOutput([e.id],mode)}/>
           <button class="icon-button note-menu" aria-label={$t('记录操作 {note}',{note:e.text.slice(0,30)||$t('图片记录')})} aria-expanded={recordMenuOpen&&activeEntry?.id===e.id} aria-controls="record-actions" aria-haspopup="menu" popovertarget="record-actions" data-tip={$t('记录操作')} onclick={(event)=>{event.preventDefault();void entryMenu(e,event.currentTarget);}}><Icon name="more" size={16}/></button>
          </div>
         {/if}
        </div>
        {#if copied?.id===e.id}<span class="sr-only" role="status">{$t(copiedLabels[copied.mode])}</span>{/if}
        {#if e.text}<p class="note-text" dir="auto">{e.text}</p>{/if}
        {#if e.attachments.length}<div class="note-images">{#each e.attachments as a}<button class="image-button" onclick={(event)=>{if(selecting||event.ctrlKey||event.metaKey||event.shiftKey)select(e,event);else void showImage(a,event.currentTarget);}}><img loading="lazy" src={convertFileSrc(a.path)} alt={a.name}/></button>{/each}</div>{/if}
       </div>
      </article>
     {:else}
      {#if search||filterCount}<p class="journal-empty">{$t('没有匹配的记录。')}</p>{/if}
     {/each}
    {/if}
   </div>
  </main>
 {/if}
 {#if !panelWindow}
  <div class="bottom-area content-width" bind:this={dockElement}>
   {#if !panel&&!preview}{@render feedback()}{/if}
   {#if selecting}
    <section class="selection-toolbar journal-selection" aria-label={$t('批量操作')}>
     <strong aria-live="polite">{$t('已选 {count} 条',{count:selected.length})}</strong>
     <button disabled={busy||!selected.length} onclick={()=>copyOutput(selected,selectionCopyMode)}>{$t('复制')}</button>
     <button aria-expanded={batchMenuOpen} aria-controls="batch-actions" aria-haspopup="menu" popovertarget="batch-actions" onclick={e=>{e.preventDefault();void selectionMenu.show(e.currentTarget);}}>{$t('更多')}</button>
     <ActionPopover id="batch-actions" label={$t('批量操作选项')} bind:this={selectionMenu} bind:open={batchMenuOpen}>
       <button role="menuitem" tabindex="-1" onclick={()=>{selectAll();dismissMenus();}}>{$t('全选当前结果')}</button>
       {#if selectionHasImages&&selectionHasText}
         <button role="menuitem" tabindex="-1" disabled={busy} onclick={()=>copyOutput(selected,'raw')}>{$t('仅复制正文')}</button>
         <button role="menuitem" tabindex="-1" disabled={busy} onclick={()=>copyOutput(selected,'images')}>{$t('仅复制图片')}</button>
       {/if}
       <hr/>
       <button role="menuitem" tabindex="-1" disabled={busy||!selected.length} onclick={()=>openPanel('delivery')}>{$t('导出…')}</button>
       <button role="menuitem" tabindex="-1" disabled={busy||!selected.length} onclick={()=>openMove(selected)}>{$t('移动项目')}</button>
       <button role="menuitem" tabindex="-1" disabled={busy||!selected.length} onclick={()=>{dismissMenus();void prepareTask(selected);}}>{$t('发布任务')}</button>
       {#if openStatusIds.length}<button role="menuitem" tabindex="-1" onclick={()=>batch('Done',openStatusIds)}>{$t('标记完成')}</button>{/if}
       {#if doneStatusIds.length}<button role="menuitem" tabindex="-1" onclick={()=>batch('Open',doneStatusIds)}>{$t('恢复待处理')}</button>{/if}
       <hr/>
       <button role="menuitem" tabindex="-1" class="danger-text" disabled={busy||!selected.length} onclick={()=>{dismissMenus();void batch('Delete');}}>{$t('删除')}</button>
     </ActionPopover>
     <button onclick={toggleSelectionOff}>{$t('退出')}</button>
    </section>
   {/if}
   {#if draftError&&!expanded}<div class="feedback error" role="alert"><span>{$t('草稿保存失败')}</span><button onclick={()=>persistDraft().catch(e=>draftError=String(e))}>{$t('重试')}</button></div>{/if}
   {#if (editorWindow||expanded)&&draftProjectId}
    <section class="composer journal-composer" aria-label={$t('编辑记录')} ondragover={(e)=>e.preventDefault()} ondrop={drop}>
     {#if editorWindow}
      <div class="editor-context"><button disabled={busy} onclick={()=>run(async()=>{await invoke('return_to_list');})}>{$t('返回列表')}</button><span>{displayProject(draftProject,$t('项目'))}</span></div>
     {/if}
     {#if draftError}<p class="feedback error" role="alert">{$t('草稿保存失败')}<button onclick={()=>persistDraft().catch(e=>draftError=String(e))}>{$t('重试')}</button></p>{/if}
     <div class="editor-scroll" inert={busy||updateLocked}>
      <label class="sr-only" for="entry-text">{$t('记录正文')}</label>
      <textarea id="entry-text" dir="auto" bind:this={editor} bind:value={text} placeholder={$t('记一句进展，或直接粘贴截图…')} rows="2" disabled={busy}></textarea>
      {#if suggestions!==undefined}<div class="tag-suggestions">{#each allTags.filter(t=>t.startsWith(suggestions)).slice(0,6) as t}<button onclick={()=>{text=text.replace(/#[\p{L}\p{M}\p{N}_-]*$/u,'#'+t);editor.focus();}}>#{t}</button>{/each}</div>{/if}
      {#if attachments.length}
       <div class="editor-images">{#each attachments as a}
        <div class="attachment"><button class="image-button" onclick={event=>showImage(a,event.currentTarget)}><img src={convertFileSrc(a.path)} alt={a.name}/></button><button class="annotate-image" aria-label={$t('标注 {filename}',{filename:a.name})} onclick={()=>annotating=a}>{$t('标注')}</button><button class="remove-image" aria-label={$t('移除 {filename}',{filename:a.name})} onclick={()=>attachments=attachments.filter(item=>item.id!==a.id)}><Icon name="close" size={16}/></button></div>
       {/each}</div>
      {/if}
      {#if editorDetails}
       <div class="editor-fields" transition:slide={{duration:motion()}}>
        <label>{$t('所属项目')}<SelectField label={$t('所属项目')} disabled={busy} bind:value={draftProjectId} options={projects.map(p=>({value:p.id,label:displayProject(p)}))}/></label>
        <label>{$t('类型')}<SelectField label={$t('笔记类型')} disabled={busy} bind:value={type} options={typeOptions} oncreate={addType}/></label>
        <TagField options={allTags} disabled={busy} bind:value={tagInput}/>
        {#if dirty||editing}<button disabled={busy} onclick={discardEditor}>{$t('丢弃草稿')}</button>{/if}
       </div>
       {#if type==='Draft'||references.length}
        <div class="draft-refs"><span>{$t('引用已有笔记')}</span><SelectField label={$t('引用已有笔记')} resetAfterPick value="" onchange={v=>{if(v)references=[...references,v];}} options={[{value:'',label:$t('选择记录…')},...entries.filter(e=>e.projectId===draftProjectId&&e.id!==editing&&e.type!=='Draft'&&!references.includes(e.id)).map(e=>({value:e.id,label:e.text.slice(0,60)||$t('图片记录')}))]}/>
         {#each references as id,i}<div class="reference"><span>{entries.find(e=>e.id===id)?.text.slice(0,70)||$t('记录已删除')}</span><button disabled={i===0} onclick={()=>moveRef(i,-1)} aria-label={$t('上移引用')}><Icon name="up" size={16}/></button><button disabled={i===references.length-1} onclick={()=>moveRef(i,1)} aria-label={$t('下移引用')}><Icon name="down" size={16}/></button><button onclick={()=>references=references.filter(x=>x!==id)} aria-label={$t('移除引用')}><Icon name="close" size={16}/></button></div>{/each}
        </div>
       {/if}
      {/if}
     </div>
     <div class="composer-footer journal-editor-actions">
      <button disabled={busy||updateLocked} aria-label={$t('添加图片')} data-tip={$t('添加图片')} onclick={()=>fileInput.click()}><Icon name="image" size={18}/></button>
      <button disabled={busy} aria-expanded={editorDetails} data-tip={$t('项目、标签与类型')} onclick={()=>editorDetails=!editorDetails}>{$t('整理')}</button>
      {#if !editorWindow&&dirty&&draftProject&&projectId&&draftProject.id!==projectId}<span class="draft-destination" data-tip={$t('草稿将保存到 {project}',{project:displayProject(draftProject)})}>{$t('存到 {project}',{project:displayProject(draftProject)})}</span>{/if}
      <span class="spacer"></span>
      {#if dirty&&canDraft}<span class="draft-state" role="status">{draftStored?$t('草稿已保存'):$t('保存草稿中…')}</span>{/if}
      {#if !editorWindow}<button disabled={busy} onclick={pauseEditor}>{$t('收起')}</button>{/if}
      <button class="blue-button" disabled={busy||updateLocked||(!text.trim()&&!attachments.length)} aria-label={$t('保存')} data-tip={$t('保存 · {key} Enter',{key:modifier})} onclick={save}>{busy?$t('处理中…'):$t('保存')}</button>
     </div>
    </section>
   {:else if !selecting}
    <button class="capture-bar" disabled={!ready||updateLocked} onclick={showEditor} ondragover={(e)=>e.preventDefault()} ondrop={drop}>
     <Icon name="plus" size={20}/><span>{dirty?$t('继续写草稿'):$t('记一条')}</span><kbd>{modifier} N</kbd>
    </button>
   {/if}
  </div>
 {/if}
  </div>
 </div>
 {#if dragging}<div transition:fade={{duration:motion()}} class="drop-hint" role="status"><Icon name="image" size={28}/><span>{$t('松开，添加图片到笔记')}</span></div>{/if}
 <input class="sr-only" tabindex="-1" aria-label={$t('选择图片')} type="file" accept="image/png,image/jpeg,image/webp" multiple bind:this={fileInput} onchange={(e)=>{void importFiles(Array.from(e.currentTarget.files||[]));e.currentTarget.value='';}}/>
</div>
{#snippet recordActions(entry:Entry)}
 <button role={panelWindow ? undefined : 'menuitem'} tabindex={panelWindow ? undefined : -1} class="menu-row" onclick={()=>edit(entry)}>{$t('编辑记录')}</button>
 {#if entry.attachments.length&&entry.text.trim()}
   <button role={panelWindow ? undefined : 'menuitem'} tabindex={panelWindow ? undefined : -1} class="menu-row" onclick={()=>copyOutput([entry.id],'raw')}>{$t('仅复制正文')}</button>
   <button role={panelWindow ? undefined : 'menuitem'} tabindex={panelWindow ? undefined : -1} class="menu-row" onclick={()=>copyOutput([entry.id],'images')}>{$t('仅复制图片')}</button>
 {/if}
 <hr/>
 <button role={panelWindow ? undefined : 'menuitem'} tabindex={panelWindow ? undefined : -1} class="menu-row" onclick={()=>openMove([entry.id])}>{$t('移动到项目…')}</button>
 <button role={panelWindow ? undefined : 'menuitem'} tabindex={panelWindow ? undefined : -1} class="menu-row" onclick={()=>run(()=>viewDelivery(makeSession([entry.id])))}>{$t('导出…')}</button>
 <button role={panelWindow ? undefined : 'menuitem'} tabindex={panelWindow ? undefined : -1} class="menu-row" onclick={()=>prepareTask([entry.id])}>{$t('发布任务…')}</button>
 {#if tracksStatus(entry)}<button role={panelWindow ? undefined : 'menuitem'} tabindex={panelWindow ? undefined : -1} class="menu-row" onclick={()=>batch(entry.status==='Done'?'Open':'Done',[entry.id])}>{entry.status==='Done'?$t('恢复待处理'):$t('标记完成')}</button>{/if}
 <hr/>
 <button role={panelWindow ? undefined : 'menuitem'} tabindex={panelWindow ? undefined : -1} class="menu-row danger-text" onclick={()=>batch('Delete',[entry.id])}>{$t('删除记录')}</button>
{/snippet}
{#if !auxiliary}
 <ActionPopover id="record-actions" label={$t('记录操作')} bind:this={recordMenu} bind:open={recordMenuOpen}>
  {#if activeEntry}{@render recordActions(activeEntry)}{/if}
 </ActionPopover>
{/if}
<dialog class="sheet" class:standalone={panelWindow} class:delivery={panel==='delivery'} class:settings-sheet={panel==='more'} bind:this={modal} onclose={()=>afterSurfaceClose(modal,()=>panel=null)} onclick={(event)=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePanel();}}} aria-label={panelTitles[panel||'more']}>
 <div class="sheet-header"><h2>{panelTitles[panel||'more']}</h2><button class="icon-button" aria-label={$t('关闭面板')} onclick={closePanel}><Icon name="close"/></button></div>
 <div class="sheet-body">
  {#if panel==='projects'||panel==='filters'}
  <div class="menu-section"><h3>{$t('项目')}</h3><button class="menu-row" aria-pressed={!projectId} onclick={()=>switchProject('')}>{$t('全部记录')}</button>{#each projects as p}<button class="menu-row" aria-pressed={p.id===projectId} onclick={()=>switchProject(p.id)}><span>{displayProject(p)}</span>{#if p.id===projectId}<Icon name="check" size={18}/>{/if}</button>{/each}<button class="menu-row blue-text" onclick={()=>openPanel('new-project')}><span>{$t('新建项目')}</span><Icon name="plus" size={18}/></button></div>
   {#if panel==='filters'}{@render filterFields()}<div class="sheet-actions"><button onclick={clearFilters}>{$t('清除筛选')}</button><button class="blue-button" onclick={closePanel}>{$t('查看 {count} 条笔记',{count:visible.length})}</button></div>{/if}
  {:else if panel==='new-project'}<form onsubmit={(e)=>{e.preventDefault();void newProject();}}><label for="project-name">{$t('项目名称')}</label><input id="project-name" bind:value={projectName} placeholder={$t('例如：订单系统')} required maxlength="60"/><div class="sheet-actions"><button type="button" onclick={()=>openPanel('projects')}>{$t('返回')}</button><button class="blue-button" disabled={!projectName.trim()}>{$t('创建项目')}</button></div></form>
  {:else if panel==='move'}<form onsubmit={(event)=>{event.preventDefault();void moveNotes();}}><p class="secondary">{$t('将 {count} 条笔记移动到其他项目，内容、图片与引用保留。',{count:moveIds.length})}</p><span class="move-project-label">{$t('目标项目')}</span><SelectField label={$t('移动到项目')} disabled={busy} bind:value={moveTarget} options={moveProjects.map(p=>({value:p.id,label:displayProject(p)}))}/>{#if !moveProjects.length}<p class="secondary">{$t('请先创建另一个项目。')}</p>{/if}<div class="sheet-actions"><button type="button" disabled={busy} onclick={closePanel}>{$t('取消')}</button><button class="blue-button" disabled={busy||!moveTarget}>{busy?$t('移动中…'):$t('移动')}</button></div></form>
  {:else if panel==='windows'}{#each openWindows as w}<button class="menu-row" onclick={()=>run(async()=>{await invoke('focus_editor',{label:w.label});closePanel();})}>{w.project} · {w.summary||$t('新笔记')}{w.dirty?$t(' · 未保存'):''}</button>{:else}<p class="secondary">{$t('没有打开的笔记窗口')}</p>{/each}
  {:else if panel==='more'}
   <SettingsPanel {theme} {chooseTheme} {startup} {startupBusy} {chooseStartup} {notebookMode} {chooseNotebook}
    {notebookDelay} {chooseDelay} {pinned} {pinBusy} {choosePinned} {modifier} {dataDir}
    onopen={openPanel} onwindows={showWindows} onnew={newEntry} ondraft={newReferenceDraft}
    onexit={()=>run(()=>invoke('resident_action',{action:'exit'}))}/>
  {:else if panel==='agents'}<AgentPanel/>
  {:else if panel==='publish'}<p>{$t('发布所选 {count} 条笔记的内容快照。完成结果可在“Agent 与 MCP”查看。',{count:taskIds.length})}</p><label for="task-instructions">{$t('任务说明（可选）')}</label><textarea id="task-instructions" bind:value={taskInstructions} placeholder={$t('希望 agent 完成什么，以及如何验证')}></textarea><button class="blue-button" disabled={busy} onclick={publishTask}>{$t('发布给 Agent')}</button>
  {:else if panel==='help'}<HelpPanel/>
  {:else if panel==='updates'}<UpdatePanel/>
  {:else if panel==='templates'}<TemplateSettings/>
  {:else if panel==='drafts'}{#each recoveredDrafts as draft}<div class="menu-section"><p>{draft.payload.text?.slice(0,100)||$t('图片草稿')}</p><button onclick={()=>run(()=>restoreDraft(draft))}>{$t('继续编辑')}</button><button onclick={()=>run(async()=>{if(await confirmation.ask('丢弃后无法恢复这份草稿。','丢弃草稿','丢弃草稿？','保留')){await invoke('discard_draft',{id:draft.id});await refreshDrafts();}})}>{$t('丢弃')}</button></div>{:else}<p>{$t('没有待恢复的草稿')}</p>{/each}
  {:else if panel==='entry'&&activeEntry}
   <div class="menu-section">{@render recordActions(activeEntry)}</div>
  {:else if panel==='delivery'}
   <div class="delivery-format" role="group" aria-label={$t('导出方式')}>
    <button aria-pressed={deliveryFormat==='original'} onclick={()=>deliveryFormat='original'}>{$t('原文与原图')}</button>
    <button aria-pressed={deliveryFormat==='template'} onclick={()=>deliveryFormat='template'}>{$t('使用模板')}</button>
   </div>
   {#if deliveryFormat==='template'}<label>{$t('导出模板')}<SelectField label={$t('本次导出模板')} disabled={busy} bind:value={templateId} options={availableTemplates.map(template=>({value:template.id,label:templateLabel(template,$t)}))}/></label>{/if}
   <div class="delivery-summary">
    <span>{$t('{count} 条记录 · {images} 张图片',{count:deliveryFormat==='original'?deliveryOriginal.count:bundle.count,images:deliveryFormat==='original'?deliveryOriginal.files.length:bundle.files.length})}</span>
    <SelectField label={$t('导出顺序')} disabled={busy} bind:value={deliveryOrder} options={[{value:'selected',label:$t('列表顺序')},{value:'oldest',label:$t('时间从早到晚')},{value:'newest',label:$t('时间从晚到早')}]}/>
   </div>
   <textarea class="prompt-preview" dir="auto" aria-label={$t('导出内容预览')} readonly value={deliveryFormat==='original'?deliveryOriginal.markdown:bundle.text}></textarea>
   <div class="delivery-actions"><button class="blue-button" disabled={busy||!deliveryEntries.length} onclick={exportDelivery}>{deliveryFormat==='original'?$t('导出图文'):$t('导出模板文件')}</button></div>
   {#if staleSource}<p class="source-warning" role="status">{$t('源内容已变化。重新打开导出窗口即可使用最新内容。')}</p>{/if}
  {:else if panel==='image'&&preview}
   <img class="standalone-image" src={convertFileSrc(preview.path)} alt={preview.name}/>
   <button disabled={busy} onclick={()=>preview&&copySingleImage(preview)}>{$t('复制这张图片')}</button>
  {/if}
  {#if panel}{@render feedback()}{/if}
 </div>
</dialog>
<dialog class="lightbox" bind:this={imageModal} onclose={()=>afterSurfaceClose(imageModal,()=>preview=null)}
 onclick={e=>{if(e.target===imageModal){const r=imageModal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>=r.right||e.clientY<r.top||e.clientY>=r.bottom)imageModal.close();}}} aria-label={$t('图片预览')}>
 {#if preview}
  <div class="sheet-header"><span>{preview.name}</span><button disabled={busy} onclick={()=>preview&&copySingleImage(preview)}>{$t('复制这张图片')}</button><button class="icon-button" onclick={()=>imageModal.close()} aria-label={$t('关闭图片预览')}><Icon name="close"/></button></div>
  <img src={convertFileSrc(preview.path)} alt={preview.name}/>
  {#if error||notice}{@render feedback()}{/if}
 {/if}
</dialog>

<ConfirmDialog bind:this={confirmation}/>

{#if annotating}<ImageAnnotator attachment={annotating} onsave={saveAnnotation} onclose={()=>annotating=null}/>{/if}
