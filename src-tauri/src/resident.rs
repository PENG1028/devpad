use crate::{docking, err, Result, Windows};
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use tauri::{Emitter, Manager, menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}};

#[derive(Default)]
pub struct Resident { pub hidden: AtomicBool, pub visible_before_hide: Mutex<Vec<String>> }

pub fn restore(app: &tauri::AppHandle) {
    let was_hidden=app.state::<Resident>().hidden.swap(false, Ordering::SeqCst);
    let labels=if was_hidden {app.state::<Resident>().visible_before_hide.lock().map(|mut labels|std::mem::take(&mut *labels)).unwrap_or_default()}else{Vec::new()};
    let app=app.clone();
    tauri::async_runtime::spawn(async move {
        let _=docking::edge_restore(app.clone(), false).await;
        for label in labels {if let Some(editor)=app.get_webview_window(&label){let _=editor.unminimize();let _=editor.show();}}

    });
}

#[tauri::command]
pub async fn hide_to_tray(app:tauri::AppHandle)->Result<()> {
    // Let an in-progress slide finish before removing the edge tab.
    for _ in 0..30 {
        let moving=app.state::<Mutex<docking::Dock>>().lock().map_err(err)?.moving;
        if !moving {break;}
        tauri::async_runtime::spawn_blocking(||std::thread::sleep(std::time::Duration::from_millis(20))).await.map_err(err)?;
    }
    if !app.state::<Resident>().hidden.swap(true,Ordering::SeqCst){
        *app.state::<Resident>().visible_before_hide.lock().map_err(err)?=app.webview_windows().iter().filter(|(label,w)|label.as_str()!="main"&&label.as_str()!="bubble"&&w.is_visible().unwrap_or(false)).map(|(label,_)|label.clone()).collect();
    }
    app.emit("tray-hide",()).map_err(err)?;
    for (label,window) in app.webview_windows() {if label=="bubble" {window.destroy().map_err(err)?;} else {window.hide().map_err(err)?;}}
    // Keep the compact state so tray restore expands this same window.
    Ok(())
}

pub fn request_exit(app:&tauri::AppHandle) {crate::windows::request_exit(app);}

#[tauri::command]
pub fn exit_app(app:tauri::AppHandle,discard:bool)->Result<()> {
    let _=discard;
    if app.state::<Windows>().editors.lock().map_err(err)?.values().any(|e|e.dirty||e.busy){return Err("请先处理所有未保存的笔记".into());}
    app.exit(0);Ok(())
}

#[tauri::command]
pub fn resident_action(app:tauri::AppHandle,action:String)->Result<()> {
    match action.as_str(){"open"=>restore(&app),"exit"=>request_exit(&app),_=>return Err("未知托盘操作".into())}Ok(())
}

pub fn setup(app:&tauri::App)->std::result::Result<(),Box<dyn std::error::Error>> {
    let open=MenuItem::with_id(app,"open","打开 DevPad",true,None::<&str>)?;
    let exit=MenuItem::with_id(app,"exit","退出 DevPad",true,None::<&str>)?;
    let menu=Menu::with_items(app,&[&open,&exit])?;
    let icon=tauri::include_image!("icons/32x32.png");
    TrayIconBuilder::with_id("devpad").icon(icon).tooltip("DevPad · 点击打开，右键退出")
        .menu(&menu).show_menu_on_left_click(false)
        .on_menu_event(|app,event|{let _=resident_action(app.clone(),event.id.as_ref().to_owned());})
        .on_tray_icon_event(|tray,event|{if matches!(event,TrayIconEvent::Click{button:MouseButton::Left,button_state:MouseButtonState::Up,..}){restore(tray.app_handle());}})
        .build(app)?;
    Ok(())
}

#[cfg(windows)]
fn run_key()->String {
    // Isolated native tests never register a real logon task.
    if std::env::var("DEVPAD_TEST_STARTUP").as_deref()==Ok("1"){return "Software\\DevPad\\TestStartup".into();}
    "Software\\Microsoft\\Windows\\CurrentVersion\\Run".into()
}
#[cfg(windows)]
fn startup_command()->Result<String>{let exe=std::env::current_exe().map_err(err)?;let command=format!("\"{}\" --autostart",exe.display());if command.chars().count()>260{return Err("程序路径过长，请移到更短的固定目录后开启".into());}Ok(command)}
#[cfg(windows)]
fn approval_key()->String{if std::env::var("DEVPAD_TEST_STARTUP").as_deref()==Ok("1"){"Software\\DevPad\\TestStartupApproval".into()}else{"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run".into()}}

#[tauri::command]
pub fn startup_enabled()->Result<bool>{
    #[cfg(windows)]{
        use winreg::{RegKey,enums::HKEY_CURRENT_USER};
        let key=match RegKey::predef(HKEY_CURRENT_USER).open_subkey(run_key()){Ok(key)=>key,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(false),Err(e)=>return Err(err(e))};
        let value=match key.get_value::<String,_>("DevPad"){Ok(value)=>value,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(false),Err(e)=>return Err(err(e))};
        let blocked=RegKey::predef(HKEY_CURRENT_USER).open_subkey(approval_key()).ok().and_then(|key|key.get_raw_value("DevPad").ok()).is_some_and(|value|value.bytes.first()==Some(&3));
        Ok(value==startup_command()?&&!blocked)
    }
    #[cfg(not(windows))]{Ok(false)}
}
#[tauri::command]
pub fn set_startup(enabled:bool)->Result<bool>{
    #[cfg(windows)]{
        use winreg::{RegKey,enums::HKEY_CURRENT_USER};
        let (key,_)=RegKey::predef(HKEY_CURRENT_USER).create_subkey(run_key()).map_err(err)?;
        if enabled {key.set_value("DevPad",&startup_command()?).map_err(err)?;
            if let Ok(approved)=RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(approval_key(),winreg::enums::KEY_SET_VALUE){match approved.delete_value("DevPad"){Ok(())=>(),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(),Err(e)=>return Err(err(e))}}
        }
        else {match key.delete_value("DevPad"){Ok(())=>(),Err(e) if e.kind()==std::io::ErrorKind::NotFound=>(),Err(e)=>return Err(err(e))}}
        startup_enabled()
    }
    #[cfg(not(windows))]{let _=enabled;Err("仅支持 Windows".into())}
}
