use crate::{err, Result};
use serde::Serialize;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Mutex};
use tauri::{Emitter, Manager};

#[derive(Clone, Default, Serialize)]
pub struct EditorState {
    pub label: String,
    pub entry: String,
    pub project: String,
    pub summary: String,
    pub dirty: bool,
    pub busy: bool,
    pub revision: u64,
    pub fingerprint: String,
}
#[derive(Default)]
pub struct ExitState { pub active: bool, pub waiting: Option<String>, pub approved: HashMap<String,u64> }
#[derive(Default)]
pub struct Windows {
    pub payloads: Mutex<HashMap<String,Value>>,
    pub editors: Mutex<HashMap<String,EditorState>>,
    pub exit: Mutex<ExitState>,
}
#[tauri::command]
pub fn window_payload(window:tauri::WebviewWindow,state:tauri::State<Windows>)->Result<Value>{
    state.payloads.lock().map_err(err)?.get(window.label()).cloned().ok_or("窗口内容不可用，请关闭后重新打开".into())
}
#[tauri::command]
pub fn editor_dirty(window:tauri::WebviewWindow,state:tauri::State<Windows>,dirty:bool,busy:bool,entry:String,project:String,summary:String,fingerprint:String)->Result<()> {
    let mut editors=state.editors.lock().map_err(err)?;
    if let Some(editor)=editors.get_mut(window.label()) {
        if editor.fingerprint!=fingerprint || editor.busy!=busy {editor.revision+=1;}
        editor.dirty=dirty;editor.busy=busy;editor.entry=entry;editor.project=project;editor.summary=summary;editor.fingerprint=fingerprint;
    }
    Ok(())
}
#[tauri::command]
pub fn editor_release(window:tauri::WebviewWindow,state:tauri::State<Windows>)->Result<()> {
    if let Some(editor)=state.editors.lock().map_err(err)?.get_mut(window.label()){editor.entry.clear();}
    Ok(())
}
#[tauri::command]
pub fn editor_windows(state:tauri::State<Windows>)->Result<Vec<EditorState>> {
    let mut result:Vec<_>=state.editors.lock().map_err(err)?.values().cloned().collect();result.sort_by(|a,b|a.label.cmp(&b.label));Ok(result)
}
#[tauri::command]
pub fn focus_editor(app:tauri::AppHandle,label:String)->Result<()> {
    if !app.state::<Windows>().editors.lock().map_err(err)?.contains_key(&label){return Err("笔记窗口已关闭".into())}
    let window=app.get_webview_window(&label).ok_or("笔记窗口已关闭")?;
    window.unminimize().map_err(err)?;window.show().map_err(err)?;window.set_focus().map_err(err)
}
#[tauri::command]
pub async fn open_aux(app:tauri::AppHandle,kind:String,payload:Value)->Result<String> {
    let (title,w,h)=match kind.as_str(){"editor"=>("写笔记 · DevPad",620.,650.),"more"=>("设置 · DevPad",520.,630.),"agents"=>("Agent 与 MCP",620.,700.),"help"=>("帮助 · DevPad",560.,660.),"updates"=>("更新 · DevPad",560.,580.),"templates"=>("导出模板 · DevPad",620.,700.),"projects"|"filters"|"new-project"=>("项目与筛选 · DevPad",500.,600.),"delivery"=>("模板与完整导出 · DevPad",720.,700.),"image"=>("图片预览 · DevPad",800.,650.),_=>return Err("未知窗口".into())};
    let entry=payload["entry"]["id"].as_str().unwrap_or("");
    // Reserve the entry while holding the registry lock, including during window startup.
    let label=if kind=="editor" {
        let state=app.state::<Windows>();let mut editors=state.editors.lock().map_err(err)?;
        if !entry.is_empty() {if let Some(existing)=editors.values().find(|e|e.entry==entry){
            let label=existing.label.clone();drop(editors);
            if let Some(win)=app.get_webview_window(&label){win.unminimize().map_err(err)?;win.show().map_err(err)?;win.set_focus().map_err(err)?;}
            return Ok(label)
        }}
        let label=format!("editor-{}",uuid::Uuid::new_v4());
        editors.insert(label.clone(),EditorState{label:label.clone(),entry:entry.into(),project:payload["projectId"].as_str().unwrap_or("").into(),busy:true,..Default::default()});label
    } else if kind=="delivery"||kind=="image" {format!("{kind}-{}",uuid::Uuid::new_v4())}
    else if ["projects","filters","new-project"].contains(&kind.as_str()) {"organizer".into()} else {kind.clone()};
    let value=json!({"kind":kind,"data":payload});
    app.state::<Windows>().payloads.lock().map_err(err)?.insert(label.clone(),value.clone());
    let pinned=app.get_webview_window("main").and_then(|w|w.is_always_on_top().ok()).unwrap_or(false);
    if let Some(win)=app.get_webview_window(&label){win.emit("aux-input",value).map_err(err)?;win.unminimize().map_err(err)?;win.show().map_err(err)?;win.set_focus().map_err(err)?;return Ok(label)}
    if let Err(e)=tauri::WebviewWindowBuilder::new(&app,&label,tauri::WebviewUrl::App(format!("index.html?window={}&instance={label}",if label=="organizer"{"organizer"}else{&kind}).into()))
        .title(title).inner_size(w,h).min_inner_size(420.,380.).decorations(false).visible(false).disable_drag_drop_handler().always_on_top(pinned).center().build() {
        cleanup(&app,&label);return Err(err(e))
    }
    Ok(label)
}
pub fn cleanup(app:&tauri::AppHandle,label:&str){
    if let Ok(mut values)=app.state::<Windows>().payloads.lock(){values.remove(label);}
    if let Ok(mut values)=app.state::<Windows>().editors.lock(){values.remove(label);}
    if let Ok(mut exit)=app.state::<Windows>().exit.lock(){if exit.waiting.as_deref()==Some(label){*exit=ExitState::default();}}
    let _=app.emit("drafts-changed",());
}
pub fn request_exit(app:&tauri::AppHandle){
    if let Ok(mut exit)=app.state::<Windows>().exit.lock(){if exit.active{return}exit.active=true;}
    advance_exit(app);
}
fn advance_exit(app:&tauri::AppHandle){
    let state=app.state::<Windows>();
    let editors=match state.editors.lock(){Ok(e)=>e,Err(_)=>return};
    let mut exit=match state.exit.lock(){Ok(e)=>e,Err(_)=>return};
    if !exit.active{return}
    let pending=editors.values().filter(|e|e.busy || (e.dirty&&exit.approved.get(&e.label)!=Some(&e.revision))).min_by_key(|e|&e.label).cloned();
    if let Some(editor)=pending {
        exit.waiting=Some(editor.label.clone());drop(exit);drop(editors);
        if let Some(win)=app.get_webview_window(&editor.label){let _=win.unminimize();let _=win.show();let _=win.set_focus();let _=win.emit("request-exit",editor.revision);}
    }else{drop(exit);drop(editors);app.exit(0);}
}
#[tauri::command]
pub fn exit_decision(app:tauri::AppHandle,window:tauri::WebviewWindow,approve:bool,revision:u64)->Result<()> {
    let state=app.state::<Windows>();let mut exit=state.exit.lock().map_err(err)?;
    if exit.waiting.as_deref()!=Some(window.label()){return Err("退出请求已失效".into())}
    if !approve{*exit=ExitState::default();return Ok(())}
    exit.approved.insert(window.label().into(),revision);exit.waiting=None;drop(exit);advance_exit(&app);Ok(())
}
