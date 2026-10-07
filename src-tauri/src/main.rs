#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{fs, path::{Path, PathBuf}, sync::Mutex};
use tauri::Manager;
mod docking;
mod delivery;
mod resident;
use resident::{hide_to_tray,exit_app,resident_action,startup_enabled,set_startup};
use docking::{edge_check,edge_restore,notebook_tick,notebook_config,notebook_pause,notebook_activity,notebook_collapse,bubble_status,bubble_settle};

mod windows;
use windows::{Windows,open_aux,window_payload,editor_dirty,editor_release,editor_windows,focus_editor,exit_decision};

#[tauri::command]
fn window_ready(window:tauri::WebviewWindow)->Result<()> {if window.state::<resident::Resident>().hidden.load(std::sync::atomic::Ordering::SeqCst){return Ok(())}if window.label()=="bubble"{return docking::tab_ready(window.app_handle(),&window)}window.show().map_err(err)?;window.set_focus().map_err(err)?;Ok(())}
#[tauri::command]
async fn return_to_list(app:tauri::AppHandle,window:tauri::WebviewWindow)->Result<()> {
    edge_restore(app,false).await?;window.hide().map_err(err)
}

struct Store { db: Mutex<Connection>, root: PathBuf }
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn attachment_path(s: &Store, path: &str) -> Result<PathBuf> {
    let p = fs::canonicalize(path).map_err(err)?;
    let root = fs::canonicalize(s.root.join("attachments")).map_err(err)?;
    if !p.starts_with(root) || !p.is_file() { return Err("附件路径不合法".into()); }
    Ok(p)
}
#[tauri::command]
fn load(s: tauri::State<Store>) -> Result<Value> {
    let db=s.db.lock().map_err(err)?;
    let mut q=db.prepare("SELECT id,name FROM projects ORDER BY rowid").map_err(err)?;
    let projects=q.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?}))).map_err(err)?.collect::<std::result::Result<Vec<_>,_>>().map_err(err)?;
    let mut q=db.prepare("SELECT payload FROM entries ORDER BY rowid DESC").map_err(err)?;
    let rows=q.query_map([],|r|r.get::<_,String>(0)).map_err(err)?.collect::<std::result::Result<Vec<_>,_>>().map_err(err)?;
    let entries=rows.iter().map(|v|serde_json::from_str::<Value>(v).map_err(err)).collect::<Result<Vec<_>>>()?;
    Ok(json!({"projects":projects,"entries":entries,"dataDir":s.root}))
}
#[tauri::command]
fn create_project(s:tauri::State<Store>, name:String)->Result<Value>{
    let name=name.trim();if name.is_empty() || name.len()>200{return Err("请输入 1–200 字节的项目名称".into())}
    let id=uuid::Uuid::new_v4().to_string();
    s.db.lock().map_err(err)?.execute("INSERT INTO projects(id,name) VALUES(?1,?2)",params![id,name]).map_err(err)?;
    Ok(json!({"id":id,"name":name}))
}
#[tauri::command]
fn save_entry(s:tauri::State<Store>, entry:Value)->Result<()> {
    save_record(&s,entry)
}
fn save_record(s:&Store,entry:Value)->Result<()> {
    if !["Open","Done"].contains(&entry["status"].as_str().unwrap_or("")){return Err("未知记录状态".into())}
    let id=entry["id"].as_str().ok_or("缺少记录 ID")?;
    let project=entry["projectId"].as_str().ok_or("缺少项目")?;
    if !["Bug","UX","Feature","Idea","Question","Note","Draft"].contains(&entry["type"].as_str().unwrap_or("")) {return Err("未知记录类型".into())}
    for a in entry["attachments"].as_array().ok_or("附件格式错误")? {attachment_path(&s,a["path"].as_str().ok_or("附件路径错误")?)?;}
    let db=s.db.lock().map_err(err)?;
    if !db.query_row("SELECT EXISTS(SELECT 1 FROM projects WHERE id=?1)",[project],|r|r.get::<_,bool>(0)).map_err(err)? {return Err("目标项目不存在，请重新选择所属项目".into());}
    db.execute("INSERT INTO entries(id,project_id,payload) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,payload=excluded.payload",params![id,project,entry.to_string()]).map_err(err)?;Ok(())
}
#[tauri::command]
fn batch(s:tauri::State<Store>, ids:Vec<String>, status:String, updated_at:String)->Result<()> {
    if !["Open","Done","Delete"].contains(&status.as_str()){return Err("未知状态".into())}
    let mut db=s.db.lock().map_err(err)?;let tx=db.transaction().map_err(err)?;
    for id in ids {if status=="Delete"{tx.execute("DELETE FROM entries WHERE id=?1",[id]).map_err(err)?;}else{
        let raw:String=tx.query_row("SELECT payload FROM entries WHERE id=?1",[&id],|r|r.get(0)).map_err(err)?;
        let mut v:Value=serde_json::from_str(&raw).map_err(err)?;v["status"]=json!(status);v["updatedAt"]=json!(updated_at);
        tx.execute("UPDATE entries SET payload=?1 WHERE id=?2",params![v.to_string(),id]).map_err(err)?;
    }} tx.commit().map_err(err)?;Ok(())
}
#[tauri::command]
fn move_entries(s:tauri::State<Store>,windows:tauri::State<Windows>,ids:Vec<String>,project_id:String,updated_at:String)->Result<()> {
    let editors=windows.editors.lock().map_err(err)?;
    if editors.values().any(|editor|ids.contains(&editor.entry)&&(editor.dirty||editor.busy)) {
        return Err("选中的笔记有未保存的编辑，请先保存或关闭对应编辑窗口，再移动项目".into());
    }
    move_records(&s,&ids,&project_id,&updated_at)
}
fn move_records(s:&Store,ids:&[String],project:&str,updated:&str)->Result<()> {
    if ids.is_empty(){return Err("请先选择笔记".into())}
    let mut db=s.db.lock().map_err(err)?;let tx=db.transaction().map_err(err)?;
    if !tx.query_row("SELECT EXISTS(SELECT 1 FROM projects WHERE id=?1)",[project],|r|r.get::<_,bool>(0)).map_err(err)?{return Err("目标项目不存在，请重新选择".into())}
    for id in ids {
        let raw:String=tx.query_row("SELECT payload FROM entries WHERE id=?1",[id],|r|r.get(0)).map_err(|_|"部分笔记已删除，请重新选择后移动".to_owned())?;
        let mut entry:Value=serde_json::from_str(&raw).map_err(err)?;
        if entry["projectId"]==project{continue}
        entry["projectId"]=json!(project);entry["updatedAt"]=json!(updated);
        tx.execute("UPDATE entries SET project_id=?1,payload=?2 WHERE id=?3",params![project,entry.to_string(),id]).map_err(err)?;
    }
    tx.commit().map_err(err)
}
#[tauri::command]
fn add_image(s:tauri::State<Store>, name:String, data:String)->Result<Value>{
    let bytes=base64::engine::general_purpose::STANDARD.decode(data).map_err(err)?;
    store_image(&s, name, bytes)
}
fn store_image(s:&Store, name:String, bytes:Vec<u8>)->Result<Value>{
    if bytes.len()>25*1024*1024{return Err("单张图片请小于 25 MB".into())}
    let format=image::guess_format(&bytes).map_err(err)?;
    let ext=match format{image::ImageFormat::Png=>"png",image::ImageFormat::Jpeg=>"jpg",image::ImageFormat::WebP=>"webp",_=>return Err("仅支持 PNG、JPG、WebP".into())};
    let id=uuid::Uuid::new_v4().to_string();let path=s.root.join("attachments").join(format!("{id}.{ext}"));fs::write(&path,bytes).map_err(err)?;
    Ok(json!({"id":id,"name":name,"path":path}))
}
// Read only in response to an explicit paste action, never by polling.
fn read_clipboard(s:&Store)->Result<Value>{
    #[cfg(target_os="windows")]
    if let Ok(paths)=clipboard_win::get_clipboard::<Vec<String>,_>(clipboard_win::formats::FileList) {
        if !paths.is_empty(){
            let mut attachments=Vec::new();
            // Validate the complete list before importing any files.
            let mut images=Vec::new();
            for path in paths {
                let p=PathBuf::from(path);
                let ext=p.extension().and_then(|x|x.to_str()).unwrap_or("").to_lowercase();
                if !["png","jpg","jpeg","webp"].contains(&ext.as_str()){return Err("剪贴板文件仅支持 PNG、JPG、WebP 图片".into())}
                if fs::metadata(&p).map_err(err)?.len()>25*1024*1024{return Err("单张图片请小于 25 MB".into())}
                images.push(p);
            }
            for p in images {attachments.push(store_image(s,p.file_name().unwrap().to_string_lossy().into(),fs::read(&p).map_err(err)?)?);}
            return Ok(json!({"attachments":attachments,"text":""}));
        }
    }
    let mut clipboard=arboard::Clipboard::new().map_err(err)?;
    match clipboard.get_image(){
        Ok(raw)=>{
            let pixels=raw.width.checked_mul(raw.height).ok_or("图片尺寸过大")?;
            if pixels>64*1024*1024{return Err("截图尺寸过大，请裁剪后重试".into())}
            let rgba=image::RgbaImage::from_raw(raw.width.try_into().map_err(err)?,raw.height.try_into().map_err(err)?,raw.bytes.into_owned()).ok_or("无法读取截图像素")?;
            let mut bytes=std::io::Cursor::new(Vec::new());
            image::DynamicImage::ImageRgba8(rgba).write_to(&mut bytes,image::ImageFormat::Png).map_err(err)?;
            let a=store_image(s,"clipboard.png".into(),bytes.into_inner())?;
            return Ok(json!({"attachments":[a],"text":""}));
        }
        Err(arboard::Error::ContentNotAvailable)=>{},
        Err(e)=>return Err(format!("读取截图失败：{e}")),
    }
    match clipboard.get_text(){
        Ok(text)=>Ok(json!({"attachments":[],"text":text})),
        Err(arboard::Error::ContentNotAvailable)=>Ok(json!({"attachments":[],"text":""})),
        Err(e)=>Err(format!("读取剪贴板失败：{e}")),
    }
}
#[tauri::command]
async fn paste_clipboard(app:tauri::AppHandle)->Result<Value>{
    tauri::async_runtime::spawn_blocking(move||read_clipboard(&app.state::<Store>())).await.map_err(err)?
}
#[tauri::command]
fn copy_text(text:String)->Result<()>{arboard::Clipboard::new().map_err(err)?.set_text(text).map_err(err)}
#[derive(Serialize,Deserialize)]
struct ExportFile { source:String, name:String, #[serde(default)] mark:Option<delivery::Mark> }
fn export_to(s:&Store,dir:&Path,text:&str,files:&[ExportFile])->Result<()> {
    for file in files {if Path::new(&file.name).components().count()!=1 || file.name.contains(['/', '\\']) || file.name==".." {return Err("非法导出名称".into())} attachment_path(s,&file.source)?;}
    fs::create_dir_all(dir).map_err(err)?;
    for file in files {let source=attachment_path(s,&file.source)?;let destination=dir.join(&file.name);if let Some(mark)=&file.mark {delivery::render(&source,&destination,mark)?;}else{fs::copy(source,destination).map_err(err)?;}}
    fs::write(dir.join("prompt.md"),text).map_err(err)?;Ok(())
}
#[tauri::command]
async fn export_bundle(app:tauri::AppHandle,text:String,files:Vec<ExportFile>)->Result<Option<String>>{
    let folder=rfd::AsyncFileDialog::new().set_title("选择 Agent 上下文导出目录").pick_folder().await;
    let Some(folder)=folder else{return Ok(None)};
    let dir=folder.path().join(format!("devpad-context-{}",uuid::Uuid::new_v4()));
    tauri::async_runtime::spawn_blocking(move||{export_to(&app.state::<Store>(),&dir,&text,&files)?;Ok(Some(dir.to_string_lossy().into()))}).await.map_err(err)?
}
#[tauri::command]
async fn copy_images(app:tauri::AppHandle,files:Vec<ExportFile>)->Result<usize>{
    tauri::async_runtime::spawn_blocking(move||{let s=app.state::<Store>();
    if files.is_empty(){return Err("没有图片可复制".into())}
    let dir=s.root.join("exports").join(uuid::Uuid::new_v4().to_string());
    export_to(&s,&dir,"",&files)?;
    #[cfg(target_os="windows")]{
        use clipboard_win::Setter;
        let paths:Vec<String>=files.iter().map(|f|dir.join(&f.name).to_string_lossy().into()).collect();
        let _clipboard=clipboard_win::Clipboard::new_attempts(10).map_err(err)?;
        clipboard_win::formats::FileList.write_clipboard(&paths).map_err(err)?;
        Ok(files.len())
    }
    #[cfg(not(target_os="windows"))]{Err("当前系统请使用导出附件包".into())}
    }).await.map_err(err)?
}
fn migrate_records(db:&mut Connection,root:&Path)->Result<()> {
    let version:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(err)?;
    if version>=1{return Ok(())}
    let backup=root.join(format!("before-78F1BC58-{}.sqlite",uuid::Uuid::new_v4()));
    db.execute("VACUUM INTO ?1",[backup.to_string_lossy().as_ref()]).map_err(err)?;
    let tx=db.transaction().map_err(err)?;
    let rows:Vec<(String,String)>={let mut q=tx.prepare("SELECT id,payload FROM entries").map_err(err)?;let result=q.query_map([],|r|Ok((r.get(0)?,r.get(1)?))).map_err(err)?.collect::<std::result::Result<Vec<_>,_>>().map_err(err)?;result};
    for (id,raw) in rows {
        let mut value:Value=serde_json::from_str(&raw).map_err(err)?;
        if value["status"]=="Ignore"{value["status"]=json!("Open");}
        let project=value["projectId"].as_str().ok_or("笔记缺少项目，迁移已取消")?;
        tx.execute("UPDATE entries SET project_id=?1,payload=?2 WHERE id=?3",params![project,value.to_string(),id]).map_err(err)?;
    }
    tx.execute_batch("PRAGMA user_version=1").map_err(err)?;tx.commit().map_err(err)
}
fn main(){let mut context=tauri::generate_context!();if let Some(root)=std::env::var_os("DEVPAD_DATA_DIR"){use std::hash::{Hash,Hasher};let mut hash=std::collections::hash_map::DefaultHasher::new();root.hash(&mut hash);context.config_mut().identifier=format!("local.devpad.test-{:x}",hash.finish());}tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app,args,_|{if !args.iter().any(|arg|arg=="--autostart"){resident::restore(app);}})).manage(Windows::default()).manage(resident::Resident::default()).manage(Mutex::new(docking::Dock::default())).on_window_event(|window,event|{
    if let tauri::WindowEvent::CloseRequested{api,..}=event {if window.label()=="main"{api.prevent_close();let app=window.app_handle().clone();tauri::async_runtime::spawn(async move {let _=hide_to_tray(app).await;});}}
    if matches!(event,tauri::WindowEvent::Destroyed){
        windows::cleanup(window.app_handle(),window.label());
        if window.label()=="main" {window.app_handle().exit(0);}
    }
}).setup(|app|{
    app.state::<resident::Resident>().hidden.store(std::env::args().any(|arg|arg=="--autostart"),std::sync::atomic::Ordering::SeqCst);
    resident::setup(app)?;
    let root=std::env::var_os("DEVPAD_DATA_DIR").map(PathBuf::from).unwrap_or(app.path().app_data_dir()?);fs::create_dir_all(root.join("attachments"))?; app.asset_protocol_scope().allow_directory(root.join("attachments"), true)?;
    let mut db=Connection::open(root.join("devpad.sqlite"))?;
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS entries_project ON entries(project_id);")?;
    migrate_records(&mut db,&root).map_err(std::io::Error::other)?;
    app.manage(Store{db:Mutex::new(db),root});docking::start_clock(app.handle().clone());Ok(())
}).invoke_handler(tauri::generate_handler![load,create_project,save_entry,batch,move_entries,add_image,paste_clipboard,copy_text,copy_images,export_bundle,open_aux,window_payload,editor_dirty,editor_release,editor_windows,focus_editor,exit_decision,window_ready,docking::notebook_surface_ready,docking::notebook_drag,edge_check,edge_restore,return_to_list,hide_to_tray,exit_app,resident_action,startup_enabled,set_startup,notebook_tick,notebook_config,notebook_pause,notebook_activity,notebook_collapse,bubble_status,bubble_settle]).run(context).expect("DevPad 启动失败");}

#[cfg(test)]
mod tests {
    use super::*;
    fn schema(db:&Connection){db.execute_batch("PRAGMA foreign_keys=ON; CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT); CREATE TABLE entries(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),payload TEXT); INSERT INTO projects VALUES('a','A'),('b','B');").unwrap();}
    #[test]
    fn batch_move_is_atomic_and_preserves_records(){
        let s=store();schema(&s.db.lock().unwrap());
        for id in ["one","two"]{save_record(&s,json!({"id":id,"projectId":"a","type":"Note","status":"Done","text":"保留内容","attachments":[],"references":["reference"],"createdAt":"original"})).unwrap();}
        assert!(move_records(&s,&["one".into(),"missing".into()],"b","now").is_err());
        assert_eq!(s.db.lock().unwrap().query_row("SELECT project_id FROM entries WHERE id='one'",[],|r|r.get::<_,String>(0)).unwrap(),"a");
        move_records(&s,&["one".into(),"two".into()],"b","now").unwrap();
        let db=s.db.lock().unwrap();let mut query=db.prepare("SELECT project_id,payload FROM entries").unwrap();let rows=query.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).unwrap();
        for row in rows{let (project,raw)=row.unwrap();let value:Value=serde_json::from_str(&raw).unwrap();assert_eq!(project,"b");assert_eq!(value["projectId"],"b");assert_eq!(value["text"],"保留内容");assert_eq!(value["status"],"Done");assert_eq!(value["createdAt"],"original");assert_eq!(value["references"],json!(["reference"]));}
        drop(query);drop(db);fs::remove_dir_all(s.root).unwrap();
    }
    #[test]
    fn migration_preserves_content_and_runs_once(){
        let s=store();let mut db=s.db.lock().unwrap();schema(&db);
        let old=json!({"id":"one","projectId":"b","text":"完整笔记","attachments":[{"id":"image"}],"references":["ref"],"status":"Ignore"});
        db.execute("INSERT INTO entries VALUES('one','a',?1)",[old.to_string()]).unwrap();
        migrate_records(&mut db,&s.root).unwrap();migrate_records(&mut db,&s.root).unwrap();
        let (project,raw):(String,String)=db.query_row("SELECT project_id,payload FROM entries",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();
        let mut expected=old.clone();expected["status"]=json!("Open");assert_eq!(project,"b");assert_eq!(serde_json::from_str::<Value>(&raw).unwrap(),expected);
        let backups:Vec<_>=fs::read_dir(&s.root).unwrap().flatten().filter(|f|f.path().extension().is_some_and(|e|e=="sqlite")).collect();assert_eq!(backups.len(),1);
        let backup=Connection::open(backups[0].path()).unwrap();let raw:String=backup.query_row("SELECT payload FROM entries",[],|r|r.get(0)).unwrap();assert_eq!(serde_json::from_str::<Value>(&raw).unwrap(),old);
        drop(backup);drop(db);fs::remove_dir_all(s.root).unwrap();
    }
    #[test]
    fn migration_failure_rolls_back(){
        let s=store();let mut db=s.db.lock().unwrap();schema(&db);db.execute("INSERT INTO entries VALUES('one','a',?1)",[json!({"projectId":"missing","status":"Ignore"}).to_string()]).unwrap();
        assert!(migrate_records(&mut db,&s.root).is_err());let version:i64=db.query_row("PRAGMA user_version",[],|r|r.get(0)).unwrap();assert_eq!(version,0);let raw:String=db.query_row("SELECT payload FROM entries",[],|r|r.get(0)).unwrap();assert!(raw.contains("Ignore"));drop(db);fs::remove_dir_all(s.root).unwrap();
    }
    #[test]
    fn moving_note_updates_both_project_fields_and_rejects_invalid_save(){
        let s=store();schema(&s.db.lock().unwrap());
        let mut note=json!({"id":"one","projectId":"a","type":"Note","status":"Open","text":"移动","attachments":[],"references":["ref"]});save_record(&s,note.clone()).unwrap();
        note["projectId"]=json!("b");save_record(&s,note.clone()).unwrap();
        note["projectId"]=json!("missing");assert!(save_record(&s,note.clone()).is_err());note["status"]=json!("Ignore");assert!(save_record(&s,note).is_err());
        let (project,raw):(String,String)=s.db.lock().unwrap().query_row("SELECT project_id,payload FROM entries",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();assert_eq!(project,"b");assert_eq!(serde_json::from_str::<Value>(&raw).unwrap()["projectId"],"b");fs::remove_dir_all(s.root).unwrap();
    }
    fn store()->Store {
        let root=std::env::temp_dir().join(format!("devpad-test-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("attachments")).unwrap();
        Store{db:Mutex::new(Connection::open_in_memory().unwrap()),root}
    }
    #[test]
    fn bundle_copies_exact_bytes_and_prompt(){
        let s=store();let source=s.root.join("attachments/test.png");fs::write(&source,b"test image content").unwrap();
        let out=s.root.join("export");export_to(&s,&out,"中文提示词",&[ExportFile{source:source.to_string_lossy().into(),name:"001-test.png".into(),mark:None}]).unwrap();
        assert_eq!(fs::read(out.join("001-test.png")).unwrap(),b"test image content");assert_eq!(fs::read_to_string(out.join("prompt.md")).unwrap(),"中文提示词");fs::remove_dir_all(s.root).unwrap();
    }
    #[test]
    fn bundle_rejects_outside_source_and_traversal(){
        let s=store();let outside=s.root.join("secret.txt");fs::write(&outside,"private").unwrap();
        assert!(attachment_path(&s,&outside.to_string_lossy()).is_err());
        let source=s.root.join("attachments/image.png");fs::write(&source,"image").unwrap();
        assert!(export_to(&s,&s.root.join("export"),"",&[ExportFile{source:source.to_string_lossy().into(),name:"../escape.png".into(),mark:None}]).is_err());fs::remove_dir_all(s.root).unwrap();
    }
    #[test]
    fn sqlite_persists_unicode_across_reopen(){
        let s=store();let path=s.root.join("test.sqlite");{
            let db=Connection::open(&path).unwrap();db.execute_batch("CREATE TABLE entries(id TEXT PRIMARY KEY,payload TEXT NOT NULL)").unwrap();db.execute("INSERT INTO entries VALUES(?1,?2)",params!["one",json!({"text":"库存没有刷新","tags":["仓库"]}).to_string()]).unwrap();
        }let db=Connection::open(&path).unwrap();let raw:String=db.query_row("SELECT payload FROM entries WHERE id='one'",[],|r|r.get(0)).unwrap();assert_eq!(serde_json::from_str::<Value>(&raw).unwrap()["text"],"库存没有刷新");drop(db);fs::remove_dir_all(s.root).unwrap();
    }
}


