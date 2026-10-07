<script lang="ts">
 import { fade, fly } from 'svelte/transition';
 import { onMount, tick } from 'svelte';
 import { invoke, convertFileSrc, isTauri } from '@tauri-apps/api/core';
 import { emit, emitTo, listen } from '@tauri-apps/api/event';
 import { getCurrentWindow } from '@tauri-apps/api/window';
 import Icon from './Icon.svelte';
 import CopyControl from './CopyControl.svelte';
 import UpdatePanel from './UpdatePanel.svelte';
 import HelpPanel from './HelpPanel.svelte';
 import AgentPanel from './AgentPanel.svelte';
 import TemplateSettings from './TemplateSettings.svelte';
 import {loadTemplates,defaultTemplate} from './templates';
 import SelectField from './SelectField.svelte';
 import ImageAnnotator from './ImageAnnotator.svelte';
 let annotating:Attachment|null=$state(null);
 async function saveAnnotation(data:string){const source=annotating;if(!source)return;const saved=await invoke<Attachment>('add_image',{name:source.name.replace(/\.[^.]+$/,'')+'-标注.png',data});attachments=attachments.map(a=>a.id===source.id?saved:a);}
 import WindowBar from './WindowBar.svelte';
 import { preference } from './theme';
 import ConfirmDialog from './ConfirmDialog.svelte';
 let {suspended=false}=$props<{suspended?:boolean}>();
 let confirmation:ConfirmDialog;
 import { types, tagsOf, editorSignature, compose, createDelivery, deliveryFingerprint, sourceChanged, expandEntries, type DeliverySession, type Entry, type Project, type Attachment } from './core';
 type Panel='agents'|'publish'|'help'|'updates'|'templates'|'drafts'|'projects'|'filters'|'more'|'entry'|'delivery'|'new-project'|'image'|'windows'|'move'|null;
 let projects:Project[]=$state([]), entries:Entry[]=$state([]), projectId=$state('');
 let search=$state(''), filterTypes:string[]=$state([]), status=$state(''), tag=$state('');
 let text=$state(''), type=$state('Note'), tagInput=$state(''), attachments:Attachment[]=$state([]), references:string[]=$state([]), editing=$state('');
 let selected:string[]=$state([]), anchor=$state(''), selecting=$state(false), expanded=$state(false), searching=$state(false);
 let panel:Panel=$state(null), activeEntry:Entry|null=$state(null), preview:Attachment|null=$state(null);
 let busy=$state(false), error=$state(''), notice=$state(''), dataDir=$state(''), projectName=$state(''), ready=$state(false);
 let theme=$state(preference()), systemDark=$state(matchMedia('(prefers-color-scheme: dark)').matches), pinned=$state(false), maximized=$state(false);
 let editor=$state<HTMLTextAreaElement>(null!), fileInput=$state<HTMLInputElement>(null!), searchInput=$state<HTMLInputElement>(null!);
 let modal=$state<HTMLDialogElement>(null!), imageModal=$state<HTMLDialogElement>(null!), scroller=$state<HTMLElement>(null!);
 const windowKind=new URLSearchParams(location.search).get('window')||'main';
 let initialized=$state(false),initializationError=$state('');
 let editRevision=$state(0);
 let taskInstructions=$state(''),taskIds:string[]=$state([]);
 async function publishTask(){if(busy)return;busy=true;await run(async()=>{await invoke('publish_task',{ids:taskIds,instructions:taskInstructions});closePanel();notice='已发布，agent 可通过 MCP 领取';});busy=false;}
 async function prepareTask(ids:string[]){taskIds=visible.filter(e=>ids.includes(e.id)).map(e=>e.id);taskInstructions='';panel='publish';await tick();modal.showModal();}
 let updateLocked=$state(false),draftStored=$state(false),draftError=$state(''),previousDraftId='';
 let recoveredDrafts:{id:string;payload:any;updatedAt:string}[]=$state([]);
 let availableTemplates=$state(loadTemplates()),templateId=$state(defaultTemplate().id);
 const exportTemplate=$derived(availableTemplates.find(t=>t.id===templateId)||availableTemplates[0]);
 function reloadTemplates(){availableTemplates=loadTemplates();templateId=defaultTemplate().id;}
 function draftPayload(){return {projectId,text,type,tagInput,attachments:[...attachments],references:[...references],editing,revision:editRevision};}
 let draftQueue:Promise<void>=Promise.resolve();
 function persistDraft():Promise<void>{if(!editorWindow||!initialized)return Promise.resolve();const fingerprint=editorReport().fingerprint,payload=draftPayload(),changed=dirty,previousId=previousDraftId||null;
  const operation=draftQueue.catch(()=>{}).then(async()=>{if(changed){await invoke('save_draft',{payload,fingerprint,previousId});}else{await invoke('discard_draft',{id:getCurrentWindow().label});if(previousId)await invoke('discard_draft',{id:previousId});}previousDraftId='';draftStored=editorReport().fingerprint===fingerprint;draftError='';});draftQueue=operation;return operation;
 }
 async function refreshDrafts(){if(!auxiliary&&isTauri())recoveredDrafts=await invoke<typeof recoveredDrafts>('list_drafts');}
 async function restoreDraft(draft:typeof recoveredDrafts[number]){await openEditor({projectId:draft.payload.projectId,draft:draft.payload,draftId:draft.id});closePanel();await refreshDrafts();}
 $effect(()=>{if(editorWindow&&initialized){editorReport().fingerprint;if(!dirty||busy)return;draftStored=false;const timer=setTimeout(()=>void persistDraft().catch(e=>draftError=String(e)),400);return()=>clearTimeout(timer);}});
 let openWindows:{label:string;project:string;summary:string;dirty:boolean}[]=$state([]);
 let draftGeneration=0;
 let moveIds:string[]=$state([]),moveTarget=$state('');
 function dismissMenus(){opened='';hovered='';window.dispatchEvent(new Event('dismiss-note-popovers'));}
 function toggleSelection(){dismissMenus();if(selecting){selecting=false;selected=[];anchor='';}else void selectMode();}
 async function openMove(ids:string[]){dismissMenus();moveIds=[...ids];moveTarget=projects.find(p=>p.id!==projectId)?.id||'';panel='move';await tick();if(!modal.open)modal.showModal();}
 async function moveNotes(){if(busy||!moveTarget||!moveIds.length)return;busy=true;await run(async()=>{await invoke('move_entries',{ids:moveIds,projectId:moveTarget,updatedAt:new Date().toISOString()});await emit('db-changed');await refresh();selected=[];closePanel();notice=`已移动 ${moveIds.length} 条笔记到 ${projects.find(p=>p.id===moveTarget)?.name||'目标项目'}`;});busy=false;}
 const auxiliary=isTauri()&&windowKind!=='main';
 const editorWindow=auxiliary&&windowKind==='editor';
 const panelWindow=auxiliary&&!editorWindow&&windowKind!=='bubble';
 let viewportWidth=$state(innerWidth),viewportHeight=$state(innerHeight);
 $effect(()=>{if(!suspended){viewportWidth=innerWidth;viewportHeight=innerHeight;}});
 const wideOrganizer=$derived(viewportWidth>=760&&viewportHeight>=460);
 const organizerPanel=(value:Panel)=>!!value&&['projects','filters','new-project'].includes(value);
 const sidebarOpen=$derived(!auxiliary&&wideOrganizer&&organizerPanel(panel));
 let transferring=false;
 $effect(()=>{if(!auxiliary&&ready&&!suspended){const wide=wideOrganizer;if(!wide&&organizerPanel(panel)&&!transferring)void transferOrganizer();else if(wide&&isTauri())void emitTo('organizer','dock-organizer');}});
 async function transferOrganizer(){if(transferring)return;transferring=true;const kind=panel;const payload=snapshot();panel=null;modal?.close();try{await invoke('open_aux',{kind,payload});}catch(e){error=String(e);}finally{transferring=false;}}

 let hovered=$state(''), opened=$state(''), menuX=$state(0), menuY=$state(0), dragging=$state(false), dragDepth=0;
 function positionActions(target:HTMLElement){const rect=target.getBoundingClientRect();menuX=Math.max(8,Math.min(innerWidth-172,rect.right-164));menuY=Math.max(8,Math.min(innerHeight-230,rect.bottom));}
 let allowClose=false;
 const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?0:160;
 $effect(()=>{if(notice){const timer=setTimeout(()=>notice='',5000);return()=>clearTimeout(timer);}});
 function editorReport(){return {dirty,busy:busy||!initialized,entry:editing,project:project?.name||projectId,summary:text.slice(0,60)||(attachments.length?'图片笔记':'新笔记'),fingerprint:JSON.stringify({text,type,tagInput,attachments,references,editing,projectId})};}
 $effect(()=>{if(editorWindow&&initialized)void invoke('editor_dirty',editorReport());});
 function snapshot(){return {projectId,selected:[...selected],filterTypes:[...filterTypes],status,tag,search,projectName};}
 let filterKey='';
 $effect(()=>{const next=JSON.stringify({projectId,filterTypes,status,tag,search});if(filterKey!==next){filterKey=next;selected=[];anchor='';}});
 async function sendMain(action:string,data:unknown={}){await emitTo('main','main-action',{action,data});}
 async function openEditor(data:Record<string,unknown>={}){await run(async()=>{await invoke('open_aux',{kind:'editor',payload:{projectId,...data}});});}
 async function acceptAux(payload:any){
  const data=payload.data||{};
  if(editorWindow){
   if(payload.kind!=='editor'||initialized)return;
   if(data.entry){if(dirty&&!await confirmation.ask('放弃当前未保存的编辑，打开这条笔记？'))return;reset();projectId=data.projectId;await refresh();await edit(data.entry);}
   else if(!dirty){projectId=data.projectId||projectId;await refresh();if(data.type)type=data.type;}
   if(data.attachments?.length)attachments=[...attachments,...data.attachments];
   if(data.text)text+=data.text;
   if(data.draft){const d=data.draft;projectId=d.projectId;await refresh();if(d.editing){const old=entries.find(e=>e.id===d.editing);if(old)await edit(old);}text=d.text;type=d.type;tagInput=d.tagInput;attachments=d.attachments;references=d.references;previousDraftId=data.draftId||'';editRevision=d.revision||0;}
   expanded=true;await tick();editor?.focus();return;
  }
  if(windowKind==='delivery'&&payload.kind!=='delivery')return;
  if(windowKind==='image'&&payload.kind!=='image')return;
  if(payload.kind==='delivery'){deliverySession=data.session;deliveryBatch=data.session.batch;previousDelivery=JSON.stringify(compose(data.session.project.name,orderedRecords(data.session,'oldest'),data.session.records,'',exportTemplate));}
  preview=data.preview||null;projectId=data.projectId||projectId;selected=data.selected||[];filterTypes=data.filterTypes||[];status=data.status||'';tag=data.tag||'';search=data.search||'';projectName=data.projectName||'';
  panel=payload.kind;await tick();if(!modal.open)modal.show();
  const prompt=modal.querySelector<HTMLTextAreaElement>('.prompt-preview');if(prompt){prompt.setSelectionRange(0,0);prompt.scrollTop=0;}
 }
 async function selectMode(){selecting=true;expanded=false;closePanel();}
 let startup=$state(false), startupBusy=$state(false);
 async function chooseStartup(enabled:boolean){startupBusy=true;await run(async()=>{startup=await invoke<boolean>('set_startup',{enabled});});startupBusy=false;}
 let notebookMode=$state(localStorage.getItem('devpad-notebook-mode')==='true');
 let notebookDelay=$state(Number(localStorage.getItem('devpad-notebook-delay'))||30);
 let notebookSleeping=false;
 $effect(()=>{if(!auxiliary&&isTauri())void invoke('notebook_pause',{reason:'busy',paused:busy||!!panel||dragging});});
 async function syncNotebook(){await invoke('notebook_config',{enabled:notebookMode,delaySeconds:notebookDelay,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});}
 function notebookActivity(){if(!auxiliary&&notebookMode&&!notebookSleeping&&!suspended)void invoke('notebook_activity');}
 function chooseNotebook(enabled:boolean){notebookMode=enabled;localStorage.setItem('devpad-notebook-mode',String(enabled));}
 function chooseDelay(value:number){notebookDelay=value;localStorage.setItem('devpad-notebook-delay',String(value));}
 async function collapseNotebook(){if(suspended)return;const rect=document.querySelector('[data-notebook-collapse]')?.getBoundingClientRect();if(!rect)return;await run(async()=>{await invoke('notebook_collapse',{target:{x:rect.left+(rect.width-36)/2,y:rect.top+(rect.height-36)/2}});});}

 function dragOver(event:DragEvent){if(suspended)return;if(panelWindow)return;if(Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';dragging=true;}}
 function dragEnter(event:DragEvent){if(suspended)return;if(panelWindow)return;if(Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();dragDepth++;dragging=true;}}
 function dragLeave(){dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)dragging=false;}

 const labels:Record<string,string>={Bug:'Bug',UX:'体验',Feature:'功能',Idea:'想法',Question:'疑问',Note:'笔记',Draft:'Draft',Open:'待处理',Done:'已完成',};
 const panelTitles:Record<string,string>={agents:'Agent 与 MCP',publish:'发布任务',help:'帮助',updates:'版本与更新',templates:'导出模板',drafts:'恢复草稿','projects':'项目','filters':'项目与筛选','more':'设置与工具','entry':'笔记操作','delivery':'模板与完整导出','new-project':'新建项目','image':'图片预览','windows':'已打开笔记','move':'移动到其他项目'};
 const project=$derived(projects.find(p=>p.id===projectId));
 const projectEntries=$derived(entries.filter(e=>e.projectId===projectId));
 const tags=$derived([...new Set(projectEntries.flatMap(e=>e.tags))].sort());
 const visible=$derived(projectEntries.filter(e=>(!filterTypes.length||filterTypes.includes(e.type))&&(!status||e.status===status)&&(!tag||e.tags.includes(tag))&&(!search||`${e.text} ${e.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
 const chosen=$derived(projectEntries.filter(e=>selected.includes(e.id)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)));
 const hiddenSelected=$derived(chosen.filter(e=>!visible.some(v=>v.id===e.id)).length);
 let deliverySession:DeliverySession|null=$state(null),lastQuickSession:DeliverySession|null=$state(null);
 const quickSessions=new Map<string,DeliverySession>();
 let deliveryOrder=$state('selected');
 function orderedRecords(session:DeliverySession,order:string){const chosen=session.selected.map(id=>session.records.find(e=>e.id===id)).filter((e):e is Entry=>!!e);return order==='selected'?chosen:chosen.sort((a,b)=>order==='newest'?b.createdAt.localeCompare(a.createdAt):a.createdAt.localeCompare(b.createdAt));}
 const deliveryEntries=$derived(deliverySession?orderedRecords(deliverySession,deliveryOrder):chosen);
 let deliveryBatch=$state(crypto.randomUUID().slice(0,8).toUpperCase()),copiedTextBatch=$state(''),copiedImagesBatch=$state('');
 let previousDelivery='';
 $effect(()=>{if(!deliverySession)return;const fingerprint=JSON.stringify(compose(deliverySession.project.name,deliveryEntries,deliverySession.records,'',exportTemplate));if(fingerprint!==previousDelivery){previousDelivery=fingerprint;deliveryBatch=crypto.randomUUID().slice(0,8).toUpperCase();}});
 const bundle=$derived.by(()=>compose(deliverySession?.project.name||project?.name||'项目',deliveryEntries,deliverySession?.records||entries,deliveryBatch,exportTemplate));
 const deliveryChanged=$derived((!!copiedTextBatch&&copiedTextBatch!==deliveryBatch)||(!!copiedImagesBatch&&copiedImagesBatch!==deliveryBatch));
 const staleSource=$derived(!!deliverySession&&sourceChanged(deliverySession,entries));
 function makeSession(ids:string[]){ids=visible.filter(e=>ids.includes(e.id)).map(e=>e.id);return createDelivery(project||{id:projectId,name:'项目'},ids.map(id=>entries.find(e=>e.id===id)).filter((e):e is Entry=>!!e),entries);}
 function quickSession(ids:string[]){const fresh=makeSession(ids),key=JSON.stringify([projectId,ids]);const old=quickSessions.get(key);if(old&&deliveryFingerprint(old)===deliveryFingerprint(fresh))return old;if(old)notice='内容已变化，请重新复制提示词和图片';quickSessions.set(key,fresh);return fresh;}
 async function viewDelivery(session:DeliverySession){if(isTauri()){await invoke('open_aux',{kind:'delivery',payload:{session}});return;}deliverySession=session;deliveryBatch=session.batch;previousDelivery=JSON.stringify(compose(session.project.name,orderedRecords(session,'oldest'),session.records,''));panel='delivery';await tick();modal.showModal();}
 async function quickCopy(ids:string[],mode:'raw'|'text'|'images'|'export'|'bundle'){
  if(busy||!ids.length)return;if(mode==='export'){await run(()=>viewDelivery(makeSession(ids)));return;}busy=true;await run(async()=>{const previous=quickSessions.get(JSON.stringify([projectId,ids]));const session=quickSession(ids);const changed=!!previous&&previous.batch!==session.batch;lastQuickSession=session;const output=compose(session.project.name,orderedRecords(session,'selected'),session.records,session.batch,defaultTemplate());
   if(mode==='bundle'){await invoke('copy_bundle',{text:output.text,files:output.files,manifest:output.manifest});notice='图文已复制；目标输入框需支持图文粘贴';}
   else if(mode==='images'){await invoke('copy_images',{files:output.files});notice='图片已复制 · 批次 '+session.batch;}
   else{await invoke('copy_text',{text:mode==='raw'?session.selected.map(id=>session.records.find(e=>e.id===id)!.text).join('\n\n'):output.text});notice=mode==='raw'?'原文已复制':'模板内容已复制 · 批次 '+session.batch;}
   if(changed&&mode!=='raw')notice+=' · 内容已变化，请重新复制配套的提示词和图片';
  });busy=false;
 }
 function hasImages(ids:string[]){return expandEntries(ids.map(id=>entries.find(e=>e.id===id)).filter((e):e is Entry=>!!e),entries).some(e=>e.attachments.length>0);}
 async function showWindows(){await run(async()=>{openWindows=await invoke('editor_windows');panel='windows';await tick();modal.showModal();});}
 const suggestions=$derived(text.match(/#([\p{L}\p{N}_-]*)$/u)?.[1]);
 let editBaseline=$state('');
 const editFingerprint=$derived(editorSignature({text,type,tagInput,attachments,references,projectId}));
 const dirty=$derived(editing?editFingerprint!==editBaseline:!!(text||attachments.length||references.length||tagInput));
 const resolvedTheme=$derived(theme==='system'?(systemDark?'dark':'light'):theme);
 $effect(()=>{document.documentElement.dataset.theme=resolvedTheme;document.documentElement.style.colorScheme=resolvedTheme;});
 function chooseTheme(value:'light'|'dark'|'system'){theme=value;if(localStorage.getItem('devpad-theme')!==value)localStorage.setItem('devpad-theme',value);}
 async function refresh(){const previousProject=entries.find(e=>e.id===editing)?.projectId;const data=await invoke<{projects:Project[];entries:Entry[];dataDir:string}>('load');if(editorWindow&&editing&&previousProject){const current=data.entries.find(e=>e.id===editing);if(current&&current.projectId!==previousProject&&projectId===previousProject){projectId=current.projectId;const baseline=JSON.parse(editBaseline);baseline.projectId=projectId;editBaseline=JSON.stringify(baseline);}}projects=data.projects;entries=data.entries;dataDir=data.dataDir;if(!projectId)projectId=projects[0]?.id||'';selected=selected.filter(id=>visible.some(e=>e.id===id));}
 async function run(action:()=>Promise<void>){error='';try{await action();}catch(e){error=String(e);}}
 onMount(()=>{
  const media=matchMedia('(prefers-color-scheme: dark)');systemDark=media.matches;const changed=()=>systemDark=media.matches;media.addEventListener('change',changed);
  let stopped=false;const cleanup:(()=>void)[]=[];
  const storage=(event:StorageEvent)=>{if(event.key?.startsWith('devpad-export')||event.key==='devpad-default-template')reloadTemplates();if(event.key==='devpad-theme')theme=preference();if(event.key==='devpad-notebook-mode'){notebookMode=localStorage.getItem('devpad-notebook-mode')==='true';if(!auxiliary)void run(async()=>{await syncNotebook();if(!notebookMode)await invoke('edge_restore',{animate:false});});}if(event.key==='devpad-notebook-delay'){notebookDelay=Number(localStorage.getItem('devpad-notebook-delay'))||30;if(!auxiliary)void syncNotebook();}};window.addEventListener('storage',storage);window.addEventListener('devpad-templates-changed',reloadTemplates);
  if(isTauri())void run(async()=>{
   const subscriptions=await Promise.all([
    getCurrentWindow().listen<any>('aux-input',event=>void run(()=>acceptAux(event.payload))),
    listen('db-changed',()=>void run(refresh)),
    listen('drafts-changed',()=>void run(refreshDrafts)),
    listen('prepare-update',()=>{if(editorWindow){updateLocked=true;void persistDraft().catch(e=>draftError=String(e));}}),
    listen('update-installing',()=>updateLocked=true),
    listen('update-install-failed',()=>updateLocked=false),
    listen('dock-organizer',()=>{if(windowKind==='organizer'&&!busy&&!transferring){transferring=true;void run(async()=>{await sendMain('organizer-inline',{...snapshot(),panel});await getCurrentWindow().destroy();}).finally(()=>transferring=false);}}),
    getCurrentWindow().listen('notebook-collapse-request',()=>{if(!auxiliary)void collapseNotebook();}),
    listen('notebook-expanded',()=>{notebookSleeping=false;notebookActivity();}),
    listen('tray-hide',()=>{notebookSleeping=true;if(panelWindow&&panel==='filters')void sendMain('filters',{filterTypes:[...filterTypes],status,tag,search});}),
    getCurrentWindow().listen<number>('request-exit',event=>{if(!editorWindow)return;void run(async()=>{if(busy||!initialized){error='正在保存或处理图片，请完成后再退出';await invoke('exit_decision',{approve:false,revision:event.payload});return;}try{await persistDraft();await invoke('editor_dirty',editorReport());await invoke('exit_decision',{approve:true,revision:event.payload});}catch(e){error=String(e);await invoke('exit_decision',{approve:false,revision:event.payload});}});}),
    listen<any>('main-action',event=>{if(auxiliary)return;void run(async()=>{const {action,data}=event.payload;if(action==='organizer-inline'){projectId=data.projectId;selected=data.selected;filterTypes=data.filterTypes;status=data.status;tag=data.tag;search=data.search;projectName=data.projectName;if(wideOrganizer){panel=data.panel;await tick();if(!modal.open)modal.show();}else{await openPanel(data.panel);}}if(action==='project'){await refresh();await switchProject(data.id);if(data.created)await newEntry();}if(action==='filters'){filterTypes=data.filterTypes;status=data.status;tag=data.tag;search=data.search;}if(action==='new')await newEntry();if(action==='search')await openSearch();if(action==='draft')await openEditor({type:'Draft'});if(action==='select')await selectMode();});})
   ]);if(stopped)subscriptions.forEach(f=>f());else cleanup.push(...subscriptions);
   await refresh();
   if(auxiliary)await acceptAux(await invoke('window_payload'));
   initialized=true;ready=true;await refreshDrafts();if(editorWindow&&dirty)await persistDraft();
   if(windowKind==='more')startup=await invoke<boolean>('startup_enabled');
  }).finally(async()=>{if(auxiliary){if(!initialized)initializationError=error||'窗口初始化失败';await tick();await invoke('window_ready');}});
  void run(async()=>{if(!isTauri()){await refresh();ready=true;initialized=true;}if(isTauri()){const win=getCurrentWindow();pinned=await win.isAlwaysOnTop();maximized=await win.isMaximized();const resize=await win.onResized(async()=>{maximized=await win.isMaximized();});const moved=await win.onMoved(notebookActivity);const close=await win.onCloseRequested(async(event)=>{if(annotating){event.preventDefault();return;}if(panelWindow&&panel==='filters')await sendMain('filters',{filterTypes:[...filterTypes],status,tag,search});if(!auxiliary){event.preventDefault();return;}if(busy){event.preventDefault();notice='正在处理，请稍后再关闭';return;}if(dirty&&!allowClose&&editorWindow){event.preventDefault();try{await persistDraft();allowClose=true;await win.close();}catch(e){error='草稿保存失败：'+String(e);}return;}if(dirty&&!allowClose){event.preventDefault();if(await confirmation.ask('当前文字、图片和引用尚未保存。你可以继续编辑，或放弃后关闭窗口。','放弃并关闭',editorWindow?'关闭写笔记窗口？':'关闭 DevPad？','继续编辑')){allowClose=true;await win.close();}} });if(stopped){resize();close();moved();}else cleanup.push(resize,close,moved);}}).finally(async()=>{if(isTauri()&&!auxiliary){await tick();await invoke('window_ready');}});
  if(!auxiliary&&isTauri()){void syncNotebook();document.addEventListener('keydown',notebookActivity);}
  return()=>{document.removeEventListener('keydown',notebookActivity);stopped=true;window.removeEventListener('storage',storage);window.removeEventListener('devpad-templates-changed',reloadTemplates);media.removeEventListener('change',changed);cleanup.forEach(f=>f());};
 });
 async function openPanel(value:Panel){
  dismissMenus();
  if(value==='delivery'){await run(()=>viewDelivery(makeSession(selected)));return;}
  if(organizerPanel(value)){
   if(panelWindow&&windowKind==='organizer'){panel=value;return;}
   if(!auxiliary&&wideOrganizer){
    if(isTauri()){const windows=await invoke<string[]>('plugin:window|get_all_windows');if(windows.includes('organizer')){await emitTo('organizer','dock-organizer');return;}}
    panel=value;await tick();if(!modal.open)modal.show();return;
   }
  }
  if(isTauri()&&value&&['more','projects','filters','new-project','delivery','help','updates','templates','agents'].includes(value)){
   await run(async()=>{await invoke('open_aux',{kind:value,payload:snapshot()});});return;
  }
  panel=value;await tick();if(value&&!modal.open)modal.showModal();
 }
 function closePanel(){if(panelWindow){void run(async()=>{if(panel==='filters')await sendMain('filters',{filterTypes:[...filterTypes],status,tag,search});await getCurrentWindow().close();});return;}modal?.close();panel=null;}
 function reset(){draftGeneration++;if(editorWindow)void invoke('editor_release');editing='';editRevision=0;text='';tagInput='';attachments=[];references=[];type='Note';}
 async function switchProject(id:string){if(panelWindow){void sendMain('project',{id});closePanel();return;}if(id===projectId){closePanel();return;}if(dirty&&!await confirmation.ask('放弃当前未保存的输入并切换项目？'))return;reset();expanded=false;projectId=id;selected=[];selecting=false;filterTypes=[];tag='';search='';status='';closePanel();scroller?.scrollTo(0,0);}
 async function newProject(){await run(async()=>{if(dirty&&!await confirmation.ask('放弃当前未保存的输入并新建项目？'))return;const p=await invoke<Project>('create_project',{name:projectName});reset();await refresh();if(panelWindow){await emit('db-changed');await sendMain('project',{id:p.id,created:true});closePanel();return;}await switchProject(p.id);projectName='';await newEntry();});}
 async function showEditor(){if(!projectId){await openPanel('new-project');return;}if(isTauri()&&!editorWindow){await openEditor();return;}if(!projectId){await openPanel('new-project');return;}closePanel();selecting=false;selected=[];expanded=true;await tick();editor?.focus();}
 async function newEntry(){if(editorWindow){await openEditor();return;}if(isTauri()&&!editorWindow){if(!projectId){await openPanel('new-project');return;}if(panelWindow){await sendMain('new');closePanel();}else await openEditor();return;}if(editing){if(dirty&&!await confirmation.ask('放弃当前编辑并新建笔记？'))return;reset();}await showEditor();}
 async function save(){if(busy||updateLocked||!projectId||(!text.trim()&&!attachments.length))return;busy=true;await run(async()=>{const old=entries.find(e=>e.id===editing);if(editing&&!old)throw new Error('原笔记已删除，请复制内容后新建笔记');const now=new Date().toISOString();const e:Entry={revision:editRevision,id:editing||crypto.randomUUID(),projectId,type,text,attachments:[...attachments],tags:[...new Set([...tagsOf(text),...tagsOf(tagInput)])],status:old?.status||'Open',createdAt:old?.createdAt||now,updatedAt:now,references:type==='Draft'?[...references]:[]};if(editorWindow)await persistDraft();await invoke('save_entry',{entry:e});if(editorWindow){await invoke('discard_draft',{id:getCurrentWindow().label});if(previousDraftId)await invoke('discard_draft',{id:previousDraftId});previousDraftId='';}if(editorWindow)await invoke('editor_release');await refresh();if(isTauri())await emit('db-changed');reset();expanded=false;notice='已保存到 '+(project?.name||'项目');busy=false;await tick();if(editorWindow){await invoke('editor_dirty',editorReport());await getCurrentWindow().close();}});busy=false;}
 async function edit(e:Entry){if(isTauri()&&!editorWindow){await openEditor({entry:e,projectId:e.projectId});return;}if(dirty&&!await confirmation.ask('放弃当前未保存的输入并编辑这条记录？'))return;editing=e.id;editRevision=e.revision||0;text=e.text.replace(/\r\n?/g,'\n');type=e.type;tagInput=e.tags.filter(t=>!tagsOf(e.text).includes(t)).map(t=>'#'+t).join(' ');attachments=[...e.attachments];references=[...e.references];editBaseline=editorSignature({text,type,tagInput,attachments,references,projectId});await showEditor();}
 function select(e:Entry,event:MouseEvent){selecting=true;expanded=false;if(event.shiftKey&&anchor){const a=visible.findIndex(x=>x.id===anchor),b=visible.findIndex(x=>x.id===e.id);if(a>=0){selected=[...new Set([...selected,...visible.slice(Math.min(a,b),Math.max(a,b)+1).map(x=>x.id)])];return;}}selected=selected.includes(e.id)?selected.filter(id=>id!==e.id):[...selected,e.id];anchor=e.id;}
 function selectAll(){selecting=true;expanded=false;selected=visible.map(e=>e.id);}
 function selectTo(e:Entry){const start=visible.findIndex(e=>e.id===anchor),end=visible.findIndex(x=>x.id===e.id);if(start<0){selected=[e.id];anchor=e.id;}else selected=[...new Set([...selected,...visible.slice(Math.min(start,end),Math.max(start,end)+1).map(x=>x.id)])];}
 async function batch(next:string,ids=selected){if(busy||!ids.length)return;if(next==='Delete'&&!await confirmation.ask(`将删除选中的 ${ids.length} 条记录，此操作不可撤销。`,'删除记录','删除这些记录？','保留记录'))return;await run(async()=>{await invoke('batch',{ids,status:next,updatedAt:new Date().toISOString()});await refresh();if(isTauri())await emit('db-changed');selected=selected.filter(id=>!ids.includes(id));if(next==='Delete'&&ids.includes(editing)){reset();expanded=false;}opened='';hovered='';closePanel();notice=next==='Delete'?'已删除记录':'已更新状态';});}
 async function importFiles(files:File[]){if(panelWindow||!files.length||busy)return;const destination=projectId,generation=draftGeneration;if(!projectId){notice='先创建一个项目，再添加图片';await openPanel('new-project');return;}const imported:Attachment[]=[];if(!isTauri()||editorWindow)expanded=true;busy=true;await run(async()=>{for(const file of files){if(!/\.(png|jpe?g|webp)$/i.test(file.name)&&!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('仅支持 PNG、JPG、WebP 图片');if(file.size>25*1024*1024)throw new Error('单张图片请小于 25 MB');const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});const a=await invoke<Attachment>('add_image',{name:file.name,data});imported.push(a);}if(generation!==draftGeneration)throw new Error('编辑位置已改变，请重新添加图片');if(isTauri()&&!editorWindow)await openEditor({projectId:destination,attachments:imported});else attachments=[...attachments,...imported];});busy=false;await tick();editor?.focus();}
 function canPasteIntoNote(target:EventTarget|null){const element=target as HTMLElement|null;return !annotating&&!panelWindow&&!confirmation?.isOpen()&&(!modal?.open||sidebarOpen)&&!imageModal?.open&&(element===editor||!element?.closest('input,textarea,select,[contenteditable="true"]'));}
 async function nativePaste(){
  if(busy){notice='正在处理，请稍后再粘贴';return;}
  if(!projectId){notice='先创建一个项目，再粘贴截图';await openPanel('new-project');return;}
  const destination=projectId,entryId=editing,generation=draftGeneration;
  const start=document.activeElement===editor?editor.selectionStart:text.length,end=document.activeElement===editor?editor.selectionEnd:text.length;
  busy=true;
  await run(async()=>{
   const content=await invoke<{attachments:Attachment[];text:string}>('paste_clipboard');
   if(generation!==draftGeneration||entryId!==editing||(editorWindow&&destination!==projectId)){notice='编辑位置已改变，请重新粘贴';return;}
   if(!content.attachments.length&&!content.text){notice='剪贴板中没有可粘贴的图片或文字';return;}
   if(isTauri()&&!editorWindow){await openEditor({...content,projectId:destination});notice=content.attachments.length?'图片已添加到写笔记窗口':'文字已添加到写笔记窗口';return;}
   expanded=true;await tick();
   if(content.attachments.length){attachments=[...attachments,...content.attachments];notice=`已粘贴 ${content.attachments.length} 张图片`;}
   else {editor.setRangeText(content.text,start,end,'end');text=editor.value;notice='已粘贴文字';}
  });
  busy=false;await tick();if(expanded)editor?.focus();
 }
 function paste(event:ClipboardEvent){if(suspended)return;
  if(event.defaultPrevented||!canPasteIntoNote(event.target))return;
  const files=Array.from(event.clipboardData?.files||[]);
  if(files.length){event.preventDefault();if(!projectId){notice='先创建一个项目，再粘贴截图';void openPanel('new-project');}else void importFiles(files);}
 }
 function drop(event:DragEvent){if(suspended)return;event.preventDefault();event.stopPropagation();dragging=false;dragDepth=0;void importFiles(Array.from(event.dataTransfer?.files||[]));}
 async function copy(mode:'text'|'images'|'export'|'bundle'){if(busy)return;const snapshot=bundle,batchId=deliveryBatch;busy=true;await run(async()=>{if(mode==='bundle'){await invoke('copy_bundle',{text:snapshot.text,files:snapshot.files,manifest:snapshot.manifest});notice='图文已复制；目标输入框需支持图文粘贴';}else if(mode==='text'){await invoke('copy_text',{text:snapshot.text});copiedTextBatch=batchId;notice='模板内容已复制';}else if(mode==='images'){const count=await invoke<number>('copy_images',{files:snapshot.files});copiedImagesBatch=batchId;notice=`已复制 ${count} 张图片文件`;}else{const path=await invoke<string|null>('export_bundle',{text:snapshot.text,files:snapshot.files,manifest:snapshot.manifest});if(path)notice=`已导出至 ${path}`;}});busy=false;}
 async function openSearch(){if(auxiliary){await sendMain('search');return;}searching=true;closePanel();await tick();searchInput?.focus();}
 function key(event:KeyboardEvent){if(suspended||annotating||updateLocked)return;const target=event.target as HTMLElement;const input=['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable;if(event.isComposing||confirmation?.isOpen()||document.querySelector('[data-copy-expanded="true"]'))return;
  if(event.key==='Escape'&&sidebarOpen){closePanel();return;}if(event.key==='Escape'){opened='';hovered='';if(editorWindow&&!modal?.open){void windowAction('close');return;}if(imageModal?.open||modal?.open)return;if(expanded){expanded=false;return;}if(searching){searching=false;return;}selecting=false;selected=[];}
  if(event.key==='Escape'&&sidebarOpen){closePanel();return;}if(panelWindow||(modal?.open&&!sidebarOpen)||imageModal?.open)return;
  if(event.ctrlKey&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='v'&&isTauri()&&canPasteIntoNote(event.target)){event.preventDefault();void nativePaste();return;}
  if(event.ctrlKey&&event.key==='Enter'){event.preventDefault();if(expanded)void save();}
  if(event.ctrlKey&&event.key.toLowerCase()==='n'){event.preventDefault();void newEntry();}
  if(event.ctrlKey&&event.key.toLowerCase()==='f'){event.preventDefault();void openSearch();}
  if(event.ctrlKey&&event.key.toLowerCase()==='a'&&!input){event.preventDefault();selecting=true;expanded=false;selected=visible.map(e=>e.id);}
  if(event.altKey&&/^[1-6]$/.test(event.key)){event.preventDefault();type=types[Number(event.key)-1];if(isTauri()&&!editorWindow)void openEditor({type});else void showEditor();}
 }
 async function showImage(a:Attachment){if(isTauri()){await run(async()=>{await invoke('open_aux',{kind:'image',payload:{preview:a}});});return;}preview=a;await tick();imageModal.showModal();}
 function moveRef(index:number,delta:number){const next=[...references];[next[index],next[index+delta]]=[next[index+delta],next[index]];references=next;}
 function clearFilters(){filterTypes=[];status='';tag='';search='';}
 function day(value:string){const d=new Date(value);const today=new Date();const yesterday=new Date();yesterday.setDate(today.getDate()-1);return d.toDateString()===today.toDateString()?'今天':d.toDateString()===yesterday.toDateString()?'昨天':d.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});}
 async function windowAction(action:'pin'|'minimize'|'maximize'|'close'|'drag'){if(!isTauri())return;await run(async()=>{const win=getCurrentWindow();if(action==='pin'){await win.setAlwaysOnTop(!pinned);pinned=await win.isAlwaysOnTop();}if(action==='minimize')await win.minimize();if(action==='maximize'){await win.toggleMaximize();maximized=await win.isMaximized();}if(action==='close')await win.close();if(action==='drag')await win.startDragging();});}
 function entryMenu(e:Entry){activeEntry=e;opened=opened===e.id?'':e.id;const trigger=document.querySelector(`[data-note-menu="${e.id}"]`);if(trigger)positionActions(trigger as HTMLElement);}
</script>

<svelte:window onresize={()=>{if(!suspended){viewportWidth=innerWidth;viewportHeight=innerHeight;}}} onclick={(event)=>{if(!(event.target as HTMLElement).closest('.note-actions')){opened='';hovered='';}}} onkeydown={key} onpaste={paste} ondragover={dragOver} ondragenter={dragEnter} ondragleave={dragLeave} ondrop={drop}/>
<div class="app-shell" class:sidebar-open={sidebarOpen} role="presentation" onmouseenter={notebookActivity} class:editor-window={editorWindow} class:panel-window={panelWindow}>
 {#if auxiliary}<WindowBar title={editorWindow?`写笔记 · ${project?.name||'项目'}`:panelTitles[panel||'more']}/>{/if}
 {#if initializationError}<div class="initialization-error" role="alert">{initializationError}<button onclick={()=>location.reload()}>重试</button><button onclick={()=>windowAction('close')}>关闭</button></div>{/if}
 {#if !auxiliary}
 <header class="titlebar">
  <button class="icon-button" aria-label="项目与筛选" title="项目与筛选" onclick={()=>sidebarOpen?closePanel():openPanel('filters')}><Icon name="menu"/></button>
  <div class="drag-space" role="presentation" onmousedown={(e)=>{if(e.button===0&&e.detail===1)void windowAction('drag');}} ondblclick={()=>windowAction('maximize')}></div>
  <button class="project-picker" aria-label="切换项目" title="切换或新建项目" onclick={()=>openPanel('projects')}><span>{project?.name||'DevPad'}</span><Icon name="chevron" size={15}/></button>
  <div class="drag-space" role="presentation" onmousedown={(e)=>{if(e.button===0&&e.detail===1)void windowAction('drag');}} ondblclick={()=>windowAction('maximize')}></div>
  <button class="icon-button" aria-label="搜索笔记" title="搜索 · Ctrl F" onclick={openSearch}><Icon name="search"/></button>
  <button class="product-action" aria-label="帮助" title="帮助" onclick={()=>openPanel('help')}><Icon name="help" size={16}/><span>帮助</span></button><button class="product-action" aria-label="更新" title="版本与更新" onclick={()=>openPanel('updates')}><Icon name="refresh" size={16}/><span>更新</span></button>
  <button data-notebook-collapse class="icon-button" aria-label="收起为悬浮笔记本" title="收起为悬浮笔记本" onclick={collapseNotebook}><Icon name="notebook" size={18}/></button>
  <button class="icon-button" aria-label="更多" title="更多" onclick={()=>openPanel('more')}><Icon name="more"/></button>
  <button class="icon-button pin-button" class:pressed={pinned} aria-label="窗口置顶" aria-pressed={pinned} title={pinned?'取消置顶':'固定在其他窗口上方'} onclick={()=>windowAction('pin')}><Icon name="pin" size={18}/></button>
  <div class="window-controls"><button aria-label="最小化" title="最小化" onclick={()=>windowAction('minimize')}><Icon name="minimize" size={15}/></button><button aria-label={maximized?'还原窗口':'最大化'} title={maximized?'还原窗口':'最大化'} onclick={()=>windowAction('maximize')}><Icon name={maximized?'restore':'maximize'} size={13}/></button><button class="window-close" aria-label="关闭窗口" title="关闭" onclick={()=>windowAction('close')}><Icon name="close" size={17}/></button></div>
 </header>
 <div class="list-tools content-width"><div class="list-heading"><strong>笔记</strong><span>{visible.length}</span></div><button class="select-mode-button" aria-pressed={selecting} onclick={toggleSelection}><Icon name="check" size={15}/>{selecting?'退出多选':'多选'}</button><button onclick={showWindows}>已打开笔记</button>{#if recoveredDrafts.length}<button onclick={()=>openPanel('drafts')}>恢复草稿 · {recoveredDrafts.length}</button>{/if}{#if lastQuickSession}<button onclick={()=>run(()=>viewDelivery(lastQuickSession!))}>查看上次导出</button>{/if}</div>
 {#if searching}<div class="search-row content-width" transition:fly={{y:-5,duration:motion()}}><Icon name="search" size={18}/><input aria-label="搜索记录" bind:this={searchInput} bind:value={search} placeholder="搜索文字或标签"/><button aria-label="收起搜索" onclick={()=>searching=false}><Icon name="close" size={18}/></button></div>{/if}
 {#if filterTypes.length||status||tag||search}<div class="filter-summary content-width" aria-label="当前筛选">{#each filterTypes as t}<button onclick={()=>filterTypes=filterTypes.filter(v=>v!==t)} aria-label={`清除类型 ${labels[t]}`}>{labels[t]}<Icon name="close" size={12}/></button>{/each}{#if status}<button onclick={()=>status=''}>{labels[status]}<Icon name="close" size={12}/></button>{/if}{#if tag}<button onclick={()=>tag=''}>#{tag}<Icon name="close" size={12}/></button>{/if}{#if search}<button onclick={()=>search=''}>搜索：{search}<Icon name="close" size={12}/></button>{/if}<button class="clear-filters" onclick={clearFilters}>清除全部</button></div>{/if}
 <main class="notes-scroll" bind:this={scroller} onscroll={dismissMenus}>
  <div class="content-width notes-content">
   <div class="section-title"><div><p class="section-eyebrow">DevPad <span aria-hidden="true">/</span> 我的工作笔记</p><h1>随手记</h1><p class="section-description">记下问题和灵感，整理后交给 Agent。</p></div>{#if ready&&projectId}<span class="note-count">{visible.length} 条笔记</span>{/if}</div>
   {#if !ready&&!error}<div class="empty-state"><p>正在读取本地笔记…</p></div>
   {:else if !projectId}<div class="empty-state"><h2>留一个地方，给随时出现的想法。</h2><p>文字、截图和待办，先记下来。</p><button class="blue-button" onclick={()=>openPanel('new-project')}>创建第一个项目</button></div>
   {:else}
    {#each visible as e,i (e.id)}
     {#if i===0||day(visible[i-1].createdAt)!==day(e.createdAt)}<div class="day-label">{day(e.createdAt)}</div>{/if}
     <article in:fade={{duration:motion()}} class:selected={selected.includes(e.id)} class:selecting role="group" onpointerdown={(event)=>{if((event.ctrlKey||event.shiftKey)&&!(event.target as HTMLElement).closest('button'))select(e,event);}} aria-label={`${labels[e.type]}：${e.text.slice(0,60)}`} oncontextmenu={(event)=>{event.preventDefault();entryMenu(e);}}>
      {#if selecting}<button class="selection-check" aria-label={`选择记录 ${e.text.slice(0,30)}`} aria-pressed={selected.includes(e.id)} onclick={(event)=>select(e,event)}>{#if selected.includes(e.id)}<Icon name="check" size={15}/>{/if}</button>{/if}
      <div class="note-body">
       <div class="note-heading"><h2>{e.text.split('\n')[0]||'图片记录'}</h2><div class="note-heading-tools"><CopyControl disabled={busy} hasImages={hasImages([e.id])} oncopy={(mode)=>quickCopy([e.id],mode)}/><div class="note-actions" role="group" aria-label="记录快捷操作"><button class="note-menu icon-button" data-note-menu={e.id} aria-expanded={opened===e.id||hovered===e.id} aria-label={`笔记操作 ${e.text.slice(0,30)}`} title="笔记操作" onclick={()=>entryMenu(e)}><Icon name="more" size={18}/></button>
        {#if opened===e.id||hovered===e.id}<div class="quick-actions" style:left={menuX+'px'} style:top={menuY+'px'} role="group" aria-label="笔记操作">
         <button onclick={()=>batch(e.status==='Done'?'Open':'Done',[e.id])}><Icon name="check" size={16}/>{e.status==='Done'?'重新打开':'标记完成'}</button>
         <button onclick={()=>{opened='';hovered='';void edit(e);}}><Icon name="edit" size={16}/>编辑</button>
         <button onclick={()=>{selected=[e.id];selecting=true;opened='';hovered='';void openPanel('delivery');}}><Icon name="send" size={16}/>交给 Agent</button>
         <button onclick={()=>{selected=[...new Set([...selected,e.id])];selecting=true;expanded=false;opened='';hovered='';}}>选择此笔记</button>
         <button onclick={()=>prepareTask([e.id])}>发布任务</button><button onclick={()=>openMove([e.id])}><Icon name="folder" size={15}/>移动到其他项目</button>
         <button class="danger-text" onclick={()=>batch('Delete',[e.id])}>删除笔记</button>
        </div>{/if}
       </div></div></div>
       {#if selecting}<div class="range-selection"><button onclick={()=>selectTo(e)}>选择到这里</button></div>{/if}
       {#if e.text.includes('\n')}<p class="note-text">{e.text.slice(e.text.indexOf('\n')+1)}</p>{/if}
       {#if e.attachments.length}<div class="note-images">{#each e.attachments as a}<button class="image-button" onclick={()=>showImage(a)}><img loading="lazy" src={convertFileSrc(a.path)} alt={a.name}/></button>{/each}</div>{/if}
       <div class="note-meta"><span class="note-type">{labels[e.type]}</span><time datetime={e.createdAt}>{new Date(e.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</time>{#if e.attachments.length}<span class="attachment-count"><Icon name="image" size={13}/>{e.attachments.length} 张图片</span>{/if}{#if e.type==='Draft'&&e.references.length}<span>{e.references.length} 条引用</span>{/if}{#each e.tags as noteTag}<span class="note-tag">#{noteTag}</span>{/each}{#if e.type!=='Note'}{#key e.status}<span in:fade={{duration:motion()}} class="note-status" class:done={e.status==='Done'}><Icon name={e.status==='Done'?'check':'circle'} size={13}/>{labels[e.status]}</span>{/key}{/if}</div>
      </div>
     </article>
    {:else}<div class="empty-state"><h2>{projectEntries.length?'没有符合条件的笔记':'想到什么，就记点什么。'}</h2><p>{projectEntries.length?'调整筛选，或清除条件查看全部。':'在下方写一句话，也可以直接粘贴图片。'}</p>{#if projectEntries.length}<button onclick={clearFilters}>清除筛选</button>{:else}<button class="blue-button" onclick={newEntry}>写第一条笔记</button>{/if}</div>{/each}
   {/if}
  </div>
 </main>
 {/if}
 {#if !panelWindow}<div class="bottom-area content-width">
 {#if editorWindow}<div class="editor-context"><button disabled={busy} onclick={()=>run(async()=>{await invoke('return_to_list');})}>返回列表</button><span>{project?.name||'项目'}</span><span>{draftError?'草稿保存失败':dirty?(draftStored?'草稿已保存':'正在保存草稿…'):'笔记已保存'}</span></div>{/if}
  {#if (error||notice)&&!panel}<div class="feedback" class:error role={error?'alert':'status'}><span>{error||notice}</span>{#if error}<button onclick={()=>run(refresh)}>重试</button>{/if}<button aria-label="关闭提示" onclick={()=>{error='';notice='';}}><Icon name="close" size={14}/></button></div>{/if}
  {#if selecting}<section transition:fly={{y:8,duration:motion()}} class="selection-toolbar" aria-label="批量操作"><div class="selection-info"><strong>已选 {selected.length} 条</strong><button onclick={selectAll}>全选</button><button disabled={!selected.length} onclick={()=>{selected=[];anchor='';}}>清空</button><span class="spacer"></span><button disabled={busy||!selected.length} onclick={()=>quickCopy(selected,'text')}>按模板复制</button>{#if hasImages(selected)}<button disabled={busy} onclick={()=>quickCopy(selected,'images')}>复制图片</button>{/if}<button disabled={busy||!selected.length} onclick={()=>quickCopy(selected,'raw')}>复制原文</button></div><div class="selection-actions"><button disabled={busy||!selected.length} onclick={()=>quickCopy(selected,'bundle')}>复制图文</button><button disabled={busy||!selected.length} onclick={()=>quickCopy(selected,'export')}>完整导出</button><button disabled={busy||!selected.length} onclick={()=>prepareTask(selected)}>发布任务</button><button disabled={busy||!selected.length} onclick={()=>openMove(selected)}><Icon name="folder" size={15}/>移动项目</button><button disabled={busy||!selected.length} onclick={()=>batch('Done')}>完成</button><button disabled={busy||!selected.length} onclick={()=>batch('Open')}>恢复待处理</button><button disabled={busy||!selected.length} onclick={()=>batch('Delete')}>删除</button></div></section>{/if}
  {#if (editorWindow||(!isTauri()&&expanded))&&projectId}
   <section class="composer" aria-label="编辑笔记" ondragover={(e)=>e.preventDefault()} ondrop={drop}>
    <div class="composer-head"><span>{editing?'编辑笔记':'新笔记'}</span><button aria-label="收起编辑器" title="收起，保留未保存内容" onclick={()=>editorWindow?windowAction('close'):expanded=false}><Icon name="chevron" size={18}/></button></div>
    {#if draftError}<p class="feedback error" role="alert">{draftError}<button onclick={()=>run(persistDraft)}>重试保存草稿</button></p>{/if}<div class="editor-scroll" inert={busy||updateLocked}>
     <label class="sr-only" for="entry-text">记录内容</label><textarea id="entry-text" bind:this={editor} bind:value={text} placeholder="记点什么…粘贴或拖入图片" rows="3" disabled={busy}></textarea>
     {#if suggestions!==undefined}<div class="tag-suggestions">{#each tags.filter(t=>t.startsWith(suggestions)&&t!==suggestions).slice(0,6) as t}<button onclick={()=>{text=text.replace(/#[\p{L}\p{N}_-]*$/u,`#${t} `);editor.focus();}}>#{t}</button>{/each}</div>{/if}
     {#if attachments.length}<div class="editor-images">{#each attachments as a}<div class="attachment"><button class="image-button" onclick={()=>showImage(a)}><img src={convertFileSrc(a.path)} alt={a.name}/></button><button class="annotate-image" aria-label={`标注 ${a.name}`} onclick={()=>annotating=a}>标注</button><button class="remove-image" aria-label={`移除 ${a.name}`} onclick={()=>attachments=attachments.filter(x=>x.id!==a.id)}><Icon name="close" size={14}/></button></div>{/each}</div>{/if}
     <div class="editor-fields"><label>所属项目<SelectField label="所属项目" disabled={busy} bind:value={projectId} options={projects.map(p=>({value:p.id,label:p.name}))}/></label><label>类型<SelectField label="笔记类型" disabled={busy} bind:value={type} options={[...types,'Draft'].map(t=>({value:t,label:labels[t]}))}/></label><label class="tags-field">标签<input aria-label="笔记标签" disabled={busy} bind:value={tagInput} list="existing-tags" placeholder="#标签（可选）"/></label><datalist id="existing-tags">{#each tags as t}<option value={'#'+t}></option>{/each}</datalist></div>
     {#if type==='Draft'}<div class="draft-refs"><span>引用已有笔记</span><SelectField label="引用已有笔记" resetAfterPick value="" onchange={v=>{if(v)references=[...references,v];}} options={[{value:'',label:'选择要加入上下文的笔记…'},...projectEntries.filter(e=>e.id!==editing&&e.type!=='Draft'&&!references.includes(e.id)).map(e=>({value:e.id,label:labels[e.type]+' · '+e.text.slice(0,60)}))]}/>{#each references as id,i}<div class="reference"><span>{i+1}. {entries.find(e=>e.id===id)?.text.slice(0,70)||'引用已删除'}{#if entries.find(e=>e.id===id)?.projectId!==projectId} · {projects.find(p=>p.id===entries.find(e=>e.id===id)?.projectId)?.name||'其他项目'}{/if}</span><button disabled={i===0} onclick={()=>moveRef(i,-1)} aria-label="上移引用"><Icon name="up" size={16}/></button><button disabled={i===references.length-1} onclick={()=>moveRef(i,1)} aria-label="下移引用"><Icon name="down" size={16}/></button><button onclick={()=>references=references.filter(x=>x!==id)} aria-label="移除引用"><Icon name="close" size={16}/></button></div>{/each}</div>{/if}
    </div>
    <div class="composer-footer"><button disabled={busy} onclick={()=>fileInput.click()}><Icon name="image" size={19}/>添加图片</button><span class="spacer"></span>{#if dirty||editing}<button disabled={busy} onclick={async()=>{if(!dirty||await confirmation.ask('当前文字、图片和引用尚未保存。放弃后无法恢复。')){reset();expanded=false;}}}>取消编辑</button>{/if}<button class="blue-button" disabled={busy||(!text.trim()&&!attachments.length)} onclick={save}>{busy?'处理中…':'保存'}<kbd>Ctrl ↵</kbd></button></div>
   </section>
  {:else if !selecting}<button class="capture-bar" onclick={showEditor} ondragover={(e)=>e.preventDefault()} ondrop={drop}><Icon name="plus" size={22}/><span>{dirty?'继续编辑未保存的笔记…':'记点什么…'}</span><kbd>Ctrl N</kbd><span class="capture-icon"><Icon name="edit" size={20}/></span></button>{/if}
 </div>{/if}
 {#if dragging}<div transition:fade={{duration:motion()}} class="drop-hint" role="status"><Icon name="image" size={28}/><span>松开，添加图片到笔记</span></div>{/if}
 <input class="sr-only" tabindex="-1" aria-label="选择图片" type="file" accept="image/png,image/jpeg,image/webp" multiple bind:this={fileInput} onchange={(e)=>{void importFiles(Array.from(e.currentTarget.files||[]));e.currentTarget.value='';}}/>
</div>
<dialog class="sheet" class:sidebar={sidebarOpen} class:standalone={panelWindow} class:delivery={panel==='delivery'} bind:this={modal} onclose={()=>{if(!modal.open)panel=null;}} onclick={(event)=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closePanel();}}} aria-label={panelTitles[panel||'more']}>
 <div class="sheet-header"><h2>{panelTitles[panel||'more']}</h2><button class="icon-button" aria-label="关闭面板" onclick={closePanel}><Icon name="close"/></button></div>
 <div class="sheet-body">
  {#if panel==='projects'||panel==='filters'}
   <div class="menu-section"><h3>项目</h3>{#each projects as p}<button class="menu-row" aria-pressed={p.id===projectId} onclick={()=>switchProject(p.id)}><span>{p.name}</span>{#if p.id===projectId}<Icon name="check" size={18}/>{/if}</button>{/each}<button class="menu-row blue-text" onclick={()=>openPanel('new-project')}><span>新建项目</span><Icon name="plus" size={18}/></button></div>
   {#if panel==='filters'}<div class="menu-section"><h3>类型 · 可多选</h3><div class="filter-types">{#each [...types,'Draft'] as t}<button class:active={filterTypes.includes(t)} aria-pressed={filterTypes.includes(t)} onclick={()=>filterTypes=filterTypes.includes(t)?filterTypes.filter(v=>v!==t):[...filterTypes,t]}>{labels[t]}{#if filterTypes.includes(t)}<Icon name="check" size={14}/>{/if}</button>{/each}</div></div><div class="menu-section filter-fields"><label>状态<SelectField label="状态筛选" bind:value={status} options={[{value:'',label:'所有状态'},...['Open','Done'].map(s=>({value:s,label:labels[s]}))]}/></label><label>标签<SelectField label="标签筛选" bind:value={tag} options={[{value:'',label:'所有标签'},...tags.map(t=>({value:t,label:'#'+t}))]}/></label></div><div class="sheet-actions"><button onclick={clearFilters}>清除筛选</button><button class="blue-button" onclick={closePanel}>查看 {visible.length} 条笔记</button></div>{/if}
  {:else if panel==='new-project'}<form onsubmit={(e)=>{e.preventDefault();void newProject();}}><label for="project-name">项目名称</label><input id="project-name" bind:value={projectName} placeholder="例如：订单系统" required maxlength="60"/><div class="sheet-actions"><button type="button" onclick={()=>openPanel('projects')}>返回</button><button class="blue-button" disabled={!projectName.trim()}>创建项目</button></div></form>
  {:else if panel==='move'}<form onsubmit={(event)=>{event.preventDefault();void moveNotes();}}><p class="secondary">将 {moveIds.length} 条笔记移动到其他项目，内容、图片与引用保留。</p><span class="move-project-label">目标项目</span><SelectField label="移动到项目" disabled={busy} bind:value={moveTarget} options={projects.filter(p=>p.id!==projectId).map(p=>({value:p.id,label:p.name}))}/>{#if projects.length<2}<p class="secondary">请先创建另一个项目。</p>{/if}<div class="sheet-actions"><button type="button" disabled={busy} onclick={closePanel}>取消</button><button class="blue-button" disabled={busy||!moveTarget}>{busy?'移动中…':'移动'}</button></div></form>
  {:else if panel==='windows'}{#each openWindows as w}<button class="menu-row" onclick={()=>run(async()=>{await invoke('focus_editor',{label:w.label});closePanel();})}>{w.project} · {w.summary||'新笔记'}{w.dirty?' · 未保存':''}</button>{:else}<p class="secondary">没有打开的笔记窗口</p>{/each}
  {:else if panel==='more'}
   <div class="menu-section"><button class="menu-row" onclick={()=>openPanel('agents')}>Agent 与 MCP</button><button class="menu-row" onclick={()=>openPanel('help')}>帮助</button><button class="menu-row" onclick={()=>openPanel('updates')}>版本与更新</button><button class="menu-row" onclick={()=>openPanel('templates')}>导出模板</button></div><div class="menu-section"><button class="menu-row" onclick={()=>{if(panelWindow){void sendMain('select');closePanel();}else void selectMode();}}><span>选择笔记</span><Icon name="check" size={18}/></button><button class="menu-row" onclick={newEntry}><span>新建笔记</span><kbd>Ctrl N</kbd></button><button class="menu-row" onclick={async()=>{if(panelWindow){await sendMain('draft');closePanel();}else{await newEntry();if(!editing)type='Draft';}}}><span>新建 Draft</span><Icon name="edit" size={18}/></button></div>
   <div class="menu-section"><label class="edge-option"><span>开机自启</span><input type="checkbox" checked={startup} disabled={startupBusy} onchange={(event)=>chooseStartup(event.currentTarget.checked)}/></label><p class="secondary">登录后静默进入托盘。关闭主窗口会收进右下角托盘，正在写的内容保留；点击托盘图标重新打开。</p><button class="menu-row" onclick={()=>run(()=>invoke('resident_action',{action:'exit'}))}><span>退出 DevPad</span><Icon name="close" size={16}/></button></div>
   <div class="menu-section"><label class="edge-option"><span>笔记本模式</span><input type="checkbox" checked={notebookMode} onchange={(event)=>chooseNotebook(event.currentTarget.checked)}/></label><p class="secondary">鼠标离开后收成悬浮笔记本；拖到屏幕外缘变成小点，点击展开。仅主窗口参与。</p>{#if notebookMode}<label class="notebook-delay">离开多久收起<SelectField label="自动收起等待时间" value={String(notebookDelay)} onchange={v=>chooseDelay(Number(v))} options={[{value:'15',label:'15 秒'},{value:'30',label:'30 秒'},{value:'60',label:'1 分钟'}]}/></label>{/if}</div>
   <div class="menu-section"><h3>外观</h3><div class="theme-options">{#each [{id:'light',label:'浅色'},{id:'dark',label:'深色'},{id:'system',label:'跟随系统'}] as option}<button class:active={theme===option.id} aria-pressed={theme===option.id} onclick={()=>chooseTheme(option.id as 'light'|'dark'|'system')}><Icon name={option.id==='light'?'sun':option.id==='dark'?'moon':'monitor'} size={16}/>{option.label}</button>{/each}</div></div>
   <div class="menu-section shortcut-list"><h3>快捷键 · 仅应用内生效</h3><p><span>新建 / 继续输入</span><kbd>Ctrl N</kbd></p><p><span>保存笔记</span><kbd>Ctrl Enter</kbd></p><p><span>搜索</span><kbd>Ctrl F</kbd></p><p><span>全选筛选结果（非输入区）</span><kbd>Ctrl A</kbd></p><p><span>切换类型</span><kbd>Alt 1–6</kbd></p><p><span>连续选择</span><kbd>Shift + 点击</kbd></p></div><details class="storage-info"><summary>本地存储位置</summary><p>{dataDir}</p></details>
  {:else if panel==='agents'}<AgentPanel/>
  {:else if panel==='publish'}<p>发布所选 {taskIds.length} 条笔记的内容快照。完成结果可在“Agent 与 MCP”查看。</p><label for="task-instructions">任务说明（可选）</label><textarea id="task-instructions" bind:value={taskInstructions} placeholder="希望 agent 完成什么，以及如何验证"></textarea><button class="blue-button" disabled={busy} onclick={publishTask}>发布给 Agent</button>
  {:else if panel==='help'}<HelpPanel/>
  {:else if panel==='updates'}<UpdatePanel/>
  {:else if panel==='templates'}<TemplateSettings/>
  {:else if panel==='drafts'}{#each recoveredDrafts as draft}<div class="menu-section"><p>{draft.payload.text?.slice(0,100)||'图片草稿'}</p><button onclick={()=>run(()=>restoreDraft(draft))}>继续编辑</button><button onclick={()=>run(async()=>{if(await confirmation.ask('丢弃后无法恢复这份草稿。','丢弃草稿','丢弃草稿？','保留')){await invoke('discard_draft',{id:draft.id});await refreshDrafts();}})}>丢弃</button></div>{:else}<p>没有待恢复的草稿</p>{/each}
  {:else if panel==='entry'&&activeEntry}
   <p class="entry-excerpt">{activeEntry.text||'图片记录'}</p><p class="secondary">{labels[activeEntry.type]} · {labels[activeEntry.status]}{activeEntry.tags.length?' · '+activeEntry.tags.map(t=>'#'+t).join(' '):''}</p>
   <div class="menu-section"><button class="menu-row" onclick={()=>{if(activeEntry)void openMove([activeEntry.id]);}}>移动到其他项目<Icon name="folder" size={16}/></button><button class="menu-row" onclick={()=>{if(activeEntry)void edit(activeEntry);}}>编辑笔记<Icon name="edit" size={18}/></button><button class="menu-row" onclick={()=>{if(activeEntry){selecting=true;selected=[...new Set([...selected,activeEntry.id])];}closePanel();}}>选择此笔记<Icon name="check" size={18}/></button><button class="menu-row" onclick={()=>{if(activeEntry){selecting=true;selected=[activeEntry.id];void openPanel('delivery');}}}>模板与完整导出<Icon name="send" size={18}/></button></div>
   <div class="menu-section">{#each ['Open','Done'] as s}<button class="menu-row" onclick={()=>batch(s,[activeEntry!.id])}><span>{labels[s]}</span>{#if activeEntry.status===s}<Icon name="check" size={16}/>{/if}</button>{/each}</div><button class="menu-row" onclick={()=>batch('Delete',[activeEntry!.id])}>删除笔记</button>
  {:else if panel==='delivery'}<label>导出模板<SelectField label="本次导出模板" disabled={busy} bind:value={templateId} options={availableTemplates.map(t=>({value:t.id,label:t.name}))}/></label><div class="delivery-summary"><span>{bundle.count} 条记录 · {bundle.files.length} 张图片</span><SelectField label="交付顺序" disabled={busy} bind:value={deliveryOrder} options={[{value:'oldest',label:'时间从早到晚'},{value:'newest',label:'时间从晚到早'},{value:'selected',label:'选中顺序'}]}/></div><textarea class="prompt-preview" aria-label="导出内容预览" readonly value={bundle.text}></textarea><div class="delivery-actions"><button disabled={busy||!deliveryEntries.length} onclick={()=>copy('bundle')}>复制图文</button><button class="blue-button" disabled={busy||!deliveryEntries.length} onclick={()=>copy('text')}>按模板复制</button>{#if bundle.files.length}<button disabled={busy} onclick={()=>copy('images')}>复制图片文件 · {bundle.files.length}</button>{/if}<button disabled={busy||!deliveryEntries.length} onclick={()=>copy('export')}>完整导出</button></div><p class="delivery-help">模板只影响本次输出。复制正文不会增加指令，完整导出包含全部图片和对应清单。<br/>交付批次 {deliveryBatch}</p>{#if staleSource}<p class="source-warning" role="status">源内容已变化，此处保留打开时的内容。需要最新内容时，请从列表重新发起交付。</p>{/if}{#if deliveryChanged}<p class="delivery-warning" role="status">内容或顺序已改变，请使用本次预览重新导出。</p>{/if}
  {:else if panel==='image'&&preview}<img class="standalone-image" src={convertFileSrc(preview.path)} alt={preview.name}/><p class="secondary">{preview.name}</p>{/if}
  {#if (error||notice)&&panel}<div class="feedback" class:error role={error?'alert':'status'}><span>{error||notice}</span><button aria-label="关闭提示" onclick={()=>{error='';notice='';}}><Icon name="close" size={14}/></button></div>{/if}
 </div>
</dialog>
<dialog class="lightbox" bind:this={imageModal} onclose={()=>preview=null} aria-label="图片预览">{#if preview}<div class="sheet-header"><span>{preview.name}</span><button class="icon-button" onclick={()=>imageModal.close()} aria-label="关闭图片预览"><Icon name="close"/></button></div><img src={convertFileSrc(preview.path)} alt={preview.name}/>{/if}</dialog>







<ConfirmDialog bind:this={confirmation}/>

{#if annotating}<ImageAnnotator attachment={annotating} onsave={saveAnnotation} onclose={()=>annotating=null}/>{/if}
