use std::{sync::Mutex,time::{Duration,Instant}};
use tauri::{Emitter,Manager,PhysicalPosition,PhysicalSize,WebviewWindow};
use crate::{err,Result};

#[derive(Default)]
pub struct Dock {pub(crate) hidden:bool,pub(crate) moving:bool,ready:bool,dot:bool,enabled:bool,delay:u64,busy:bool,confirm:bool,idle_since:Option<Instant>,origin:Option<PhysicalPosition<i32>>,anchor:Option<PhysicalPosition<i32>>,full_size:Option<PhysicalSize<u32>>,corner:Corner,pinned:bool,prepared:bool,reduced_motion:bool}
fn dragging()->bool{#[cfg(windows)]{#[link(name="user32")]extern "system"{fn GetAsyncKeyState(key:i32)->i16;}unsafe{GetAsyncKeyState(1)<0}}#[cfg(not(windows))]{false}}
fn inside(win:&WebviewWindow)->Result<bool>{let p=win.outer_position().map_err(err)?;let s=win.outer_size().map_err(err)?;let c=win.cursor_position().map_err(err)?;Ok(c.x>=p.x as f64&&c.x<(p.x+s.width as i32)as f64&&c.y>=p.y as f64&&c.y<(p.y+s.height as i32)as f64)}
pub fn tab_ready(app:&tauri::AppHandle,window:&WebviewWindow)->Result<()>{let state=app.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;dock.ready=true;if dock.hidden&&!dock.moving{window.show().map_err(err)?;}Ok(())}
pub fn start_clock(app:tauri::AppHandle){std::thread::spawn(move||loop{std::thread::sleep(Duration::from_secs(1));let settings={let state=app.state::<Mutex<Dock>>();let dock=state.lock().unwrap();if dock.enabled{Some(dock.delay)}else{None}};if let Some(delay)=settings{let _=tauri::async_runtime::block_on(notebook_tick(app.clone(),delay));}});}
#[tauri::command]
pub fn notebook_config(app:tauri::AppHandle,enabled:bool,delay_seconds:u64,reduced_motion:Option<bool>)->Result<()>{let state=app.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;dock.reduced_motion=reduced_motion.unwrap_or(false);dock.enabled=enabled;dock.delay=delay_seconds.clamp(5,300);dock.idle_since=None;Ok(())}
#[tauri::command]
pub fn notebook_pause(window:WebviewWindow,reason:String,paused:bool)->Result<()>{if window.label()!="main"{return Ok(())}let state=window.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;if reason=="confirm"{dock.confirm=paused;}else{dock.busy=paused;}dock.idle_since=None;Ok(())}
#[tauri::command]
pub fn notebook_activity(app:tauri::AppHandle){if let Ok(mut dock)=app.state::<Mutex<Dock>>().lock(){dock.idle_since=None;}}
#[tauri::command]
pub async fn notebook_tick(app:tauri::AppHandle,delay_seconds:u64)->Result<bool>{
 let main=app.get_webview_window("main").ok_or("主窗口未打开")?;
 let paused=!main.is_visible().map_err(err)?||main.is_minimized().map_err(err)?||main.is_maximized().map_err(err)?||dragging()||inside(&main)?||app.webview_windows().iter().any(|(label,w)|label!="main"&&label!="bubble"&&w.is_visible().unwrap_or(false));
 let collapse={let state=app.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;if paused||dock.busy||dock.confirm||dock.moving||dock.hidden{dock.idle_since=None;false}else{dock.idle_since.get_or_insert_with(Instant::now).elapsed()>=Duration::from_secs(delay_seconds.clamp(5,300))}};
 if collapse {main.emit("notebook-collapse-request",()).map_err(err)?;return Ok(true)}Ok(false)
}
// Each transition resizes the main HWND; no replacement webview is created.
#[derive(Clone,Copy,Default)]
struct Corner {right:bool,bottom:bool}
fn nearest_corner(p:PhysicalPosition<i32>,s:PhysicalSize<u32>,area:tauri::Rect)->Corner {
 let o=area.position.to_physical::<i32>(1.);let e=area.size.to_physical::<u32>(1.);
 Corner{right:(o.x+e.width as i32-p.x-s.width as i32).abs()<=(p.x-o.x).abs(),bottom:(o.y+e.height as i32-p.y-s.height as i32).abs()<(p.y-o.y).abs()}
}
fn anchored(p:PhysicalPosition<i32>,from:PhysicalSize<u32>,to:PhysicalSize<u32>,c:Corner)->PhysicalPosition<i32>{
 PhysicalPosition::new(p.x+if c.right{from.width as i32-to.width as i32}else{0},p.y+if c.bottom{from.height as i32-to.height as i32}else{0})
}
fn expansion_size(p:PhysicalPosition<i32>,from:PhysicalSize<u32>,desired:PhysicalSize<u32>,origin:PhysicalPosition<i32>,extent:PhysicalSize<u32>,c:Corner)->PhysicalSize<u32>{
 let width=if c.right{p.x+from.width as i32-origin.x}else{origin.x+extent.width as i32-p.x};
 let height=if c.bottom{p.y+from.height as i32-origin.y}else{origin.y+extent.height as i32-p.y};
 PhysicalSize::new(desired.width.min(width.max(1)as u32),desired.height.min(height.max(1)as u32))
}
fn surface(main:&WebviewWindow,phase:&str,c:Corner,size:PhysicalSize<u32>)->Result<()> {
 let scale=main.scale_factor().map_err(err)?;
 main.emit("notebook-surface",serde_json::json!({"phase":phase,"right":c.right,"bottom":c.bottom,"width":size.width as f64/scale,"height":size.height as f64/scale})).map_err(err)
}
#[tauri::command]
pub fn notebook_surface_ready(app:tauri::AppHandle)->Result<()> {app.state::<Mutex<Dock>>().lock().map_err(err)?.prepared=true;Ok(())}
async fn resize_surface(main:&WebviewWindow,p:PhysicalPosition<i32>,from:PhysicalSize<u32>,to:PhysicalSize<u32>,c:Corner,animate:bool,destination:Option<PhysicalPosition<i32>>)->Result<()> {
 let win=main.clone();
 tauri::async_runtime::spawn_blocking(move||->Result<()>{
  let waiting=Instant::now();
  while !win.state::<Mutex<Dock>>().lock().map_err(err)?.prepared {
   if waiting.elapsed()>Duration::from_secs(2){return Err("窗口动画尚未就绪，请重试".into())}
   std::thread::sleep(Duration::from_millis(8));
  }
  let started=Instant::now();
  loop {
   let t=if animate{(started.elapsed().as_secs_f64()/0.28).min(1.)}else{1.};
   let eased=t*t*(3.-2.*t);
   let blend=|a:u32,b:u32|(a as f64+(b as f64-a as f64)*eased).round()as u32;
   let size=PhysicalSize::new(blend(from.width,to.width),blend(from.height,to.height));
   let position=if let Some(end)=destination{PhysicalPosition::new((p.x as f64+(end.x-p.x)as f64*eased).round()as i32,(p.y as f64+(end.y-p.y)as f64*eased).round()as i32)}else{anchored(p,from,size,c)};
   morph_rect(&win,position,size)?;
   if t>=1.{break}std::thread::sleep(Duration::from_millis(16));
  }Ok(())
 }).await.map_err(err)?
}
#[tauri::command]
pub async fn notebook_collapse(app:tauri::AppHandle,target:tauri::LogicalPosition<f64>)->Result<()> {
 let main=app.get_webview_window("main").ok_or("主窗口未打开")?;
 if !main.is_visible().map_err(err)?||main.is_minimized().map_err(err)?||main.is_maximized().map_err(err)?{return Ok(())}
 if app.webview_windows().iter().any(|(label,w)|label!="main"&&w.is_visible().unwrap_or(false)){return Err("请先关闭辅助窗口，再收起笔记本".into())}
 let p=main.outer_position().map_err(err)?;let size=main.outer_size().map_err(err)?;
 let c=Corner{right:true,bottom:false};
 let scale=main.scale_factor().map_err(err)?;
 if !target.x.is_finite()||!target.y.is_finite(){return Err("无法读取收起按钮位置".into())}
 let small=PhysicalSize::new((36.*scale).round()as u32,(36.*scale).round()as u32);
 let client=main.inner_position().map_err(err)?;
 let destination=PhysicalPosition::new(client.x+(target.x*scale).round()as i32,client.y+(target.y*scale).round()as i32);
 let animate={let state=app.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;
  if dock.hidden||dock.moving{return Ok(())}if dock.busy||dock.confirm{return Err("请先完成当前操作，再收起笔记本".into())}
  dock.pinned=main.is_always_on_top().map_err(err)?;dock.moving=true;dock.prepared=false;dock.dot=false;dock.origin=Some(p);dock.full_size=Some(size);dock.corner=c;dock.anchor=Some(destination);!dock.reduced_motion};
 let result:Result<()>=async {
  main.set_min_size(Some(tauri::LogicalSize::new(24.,24.))).map_err(err)?;
  main.set_resizable(false).map_err(err)?;
  main.set_shadow(false).map_err(err)?;
  surface(&main,"collapsing",c,size)?;
  resize_surface(&main,p,size,small,c,animate,Some(destination)).await?;
  main.set_always_on_top(true).map_err(err)?;
  main.set_skip_taskbar(true).map_err(err)?;
  surface(&main,"compact",c,size)?;Ok(())
 }.await;
 if result.is_err(){let _=morph_rect(&main,p,size);let _=main.set_min_size(Some(tauri::LogicalSize::new(400.,320.)));let _=main.set_resizable(true);let _=main.set_shadow(true);let _=main.set_skip_taskbar(false);let pinned=app.state::<Mutex<Dock>>().lock().map_err(err)?.pinned;let _=main.set_always_on_top(pinned);let _=surface(&main,"expanded",c,size);}
 let state=app.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;dock.moving=false;dock.hidden=result.is_ok();dock.idle_since=None;result
}
#[tauri::command]
pub fn bubble_status(app:tauri::AppHandle)->Result<bool>{Ok(app.state::<Mutex<Dock>>().lock().map_err(err)?.dot)}
#[tauri::command]
pub fn bubble_settle(app:tauri::AppHandle)->Result<bool>{
 if !app.state::<Mutex<Dock>>().lock().map_err(err)?.hidden{return Ok(false)}let bubble=app.get_webview_window("main").ok_or("悬浮窗口未打开")?;let monitor=bubble.current_monitor().map_err(err)?.ok_or("无法读取屏幕位置")?;let area=monitor.work_area();let p=bubble.outer_position().map_err(err)?;let size=bubble.outer_size().map_err(err)?;let margin=(16.*monitor.scale_factor())as i32;
 let left=area.position.x;let top=area.position.y;let right=left+area.size.width as i32;let bottom=top+area.size.height as i32;
 let candidates=[((p.x-left).abs(),0),((p.x+size.width as i32-right).abs(),1),((p.y-top).abs(),2)];let &(distance,side)=candidates.iter().min_by_key(|x|x.0).unwrap();
 let seam=app.get_webview_window("main").unwrap().available_monitors().map_err(err)?.iter().any(|other|{if other.position()==monitor.position(){return false}let q=other.position();let s=other.size();match side{0=>q.x+s.width as i32==monitor.position().x&&q.y<p.y+size.height as i32&&q.y+s.height as i32>p.y,1=>q.x==monitor.position().x+monitor.size().width as i32&&q.y<p.y+size.height as i32&&q.y+s.height as i32>p.y,_=>q.y+s.height as i32==monitor.position().y&&q.x<p.x+size.width as i32&&q.x+s.width as i32>p.x}});
 let dot=distance<=margin&&!seam;let scale=monitor.scale_factor();let target=PhysicalSize::new(((if dot{24.}else{36.})*scale)as u32,((if dot{24.}else{36.})*scale)as u32);
 let pos=if dot{match side{0=>PhysicalPosition::new(left,p.y),1=>PhysicalPosition::new(right-target.width as i32,p.y),_=>PhysicalPosition::new(p.x,top)}}else{p};
 let pos=PhysicalPosition::new(pos.x.clamp(left,(right-target.width as i32).max(left)),pos.y.clamp(top,(bottom-target.height as i32).max(top)));
 morph_rect(&bubble,pos,target)?;app.state::<Mutex<Dock>>().lock().map_err(err)?.dot=dot;bubble.emit("bubble-style",dot).map_err(err)?;Ok(dot)
}
// Enter the OS move loop on the window thread. Its return marks the actual release;
// no queued cursor reads or set-position requests survive mouse-up.
#[tauri::command]
pub async fn notebook_drag(app:tauri::AppHandle)->Result<bool>{
 let main=app.get_webview_window("main").ok_or("主窗口未打开")?;
 {let state=app.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;if !dock.hidden||dock.moving{return Ok(dock.dot)}dock.moving=true;}
 let result:Result<()>=async {
  #[cfg(windows)] {
   let handle=main.hwnd().map_err(err)?.0 as isize;
   let (send,receive)=std::sync::mpsc::channel();
   main.run_on_main_thread(move||{
    #[repr(C)]struct Point{x:i32,y:i32}
    #[link(name="user32")]extern "system"{fn ReleaseCapture()->i32;fn GetCursorPos(point:*mut Point)->i32;fn SendMessageW(hwnd:*mut std::ffi::c_void,msg:u32,w:usize,l:isize)->isize;}
    if dragging(){unsafe{let mut p=Point{x:0,y:0};if GetCursorPos(&mut p)!=0{ReleaseCapture();let packed=(p.x as u16 as u32)|((p.y as u16 as u32)<<16);SendMessageW(handle as *mut _,0x00A1,2,packed as isize);}}}
    let _=send.send(());
   }).map_err(err)?;
   tauri::async_runtime::spawn_blocking(move||receive.recv().map_err(err)).await.map_err(err)??;
  }
  #[cfg(not(windows))]{main.start_dragging().map_err(err)?;}
  Ok(())
 }.await;
 app.state::<Mutex<Dock>>().lock().map_err(err)?.moving=false;
 result?;bubble_settle(app)
}
fn morph_rect(window:&WebviewWindow,position:PhysicalPosition<i32>,size:PhysicalSize<u32>)->Result<()> {
 #[cfg(windows)] {
  #[link(name="user32")] extern "system" {fn SetWindowPos(hwnd:*mut std::ffi::c_void,after:*mut std::ffi::c_void,x:i32,y:i32,w:i32,h:i32,flags:u32)->i32;}
  let handle=window.hwnd().map_err(err)?;
  if unsafe{SetWindowPos(handle.0,std::ptr::null_mut(),position.x,position.y,size.width as i32,size.height as i32,0x0014)}==0{return Err(err(std::io::Error::last_os_error()))}Ok(())
 }
 #[cfg(not(windows))] {window.set_position(position).map_err(err)?;window.set_size(size).map_err(err)}
}
#[tauri::command]
pub async fn edge_restore(app:tauri::AppHandle,animate:bool)->Result<()> {
 let main=app.get_webview_window("main").ok_or("主窗口未打开")?;
 let (compact,stored,c,pinned)={let state=app.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;if dock.moving{return Ok(())}dock.moving=true;dock.prepared=false;(dock.hidden,dock.full_size,dock.corner,dock.pinned)};
 let result:Result<()>=async {
  if compact {
   let start=main.outer_position().map_err(err)?;let from=main.outer_size().map_err(err)?;
   let monitor=main.current_monitor().map_err(err)?.ok_or("无法读取屏幕位置")?;let area=monitor.work_area();
   let stored=stored.unwrap_or(PhysicalSize::new(1040,780));
   let c=nearest_corner(start,from,tauri::Rect{position:area.position.into(),size:area.size.into()});
   // Keep the corner stationary even after dragging to a different monitor.
   let size=expansion_size(start,from,stored,area.position,area.size,c);
   surface(&main,"expanding",c,size)?;
   resize_surface(&main,start,from,size,c,animate,None).await?;
   let scale=main.scale_factor().map_err(err)?;
   main.set_min_size(Some(tauri::LogicalSize::new((size.width as f64/scale).min(400.),(size.height as f64/scale).min(320.)))).map_err(err)?;main.set_resizable(true).map_err(err)?;main.set_shadow(true).map_err(err)?;
   main.set_always_on_top(pinned).map_err(err)?;main.set_skip_taskbar(false).map_err(err)?;
   surface(&main,"expanded",c,size)?;
  }
  main.unminimize().map_err(err)?;main.show().map_err(err)?;main.set_focus().map_err(err)?;
  main.emit("notebook-expanded",()).map_err(err)?;Ok(())
 }.await;
 if result.is_err()&&compact {
  let origin=app.state::<Mutex<Dock>>().lock().map_err(err)?.origin;
  if let (Some(p),Some(s))=(origin,stored){let _=morph_rect(&main,p,s);let _=surface(&main,"expanded",c,s);}
  let _=main.set_min_size(Some(tauri::LogicalSize::new(400.,320.)));let _=main.set_resizable(true);let _=main.set_shadow(true);let _=main.set_always_on_top(pinned);let _=main.set_skip_taskbar(false);let _=main.show();
 }
 let state=app.state::<Mutex<Dock>>();let mut dock=state.lock().map_err(err)?;dock.moving=false;dock.hidden=false;dock.idle_since=None;result
}
// Legacy callers no longer move full windows near Windows Snap zones.
#[tauri::command]
pub async fn edge_check(_app:tauri::AppHandle,animate:bool,leaving:bool)->Result<String>{let _=(animate,leaving);Ok("paused".into())}

#[cfg(test)]
mod morph_tests {
 use super::*;
 #[test]
 fn all_four_corners_remain_fixed_and_reverse_exactly(){
  for right in [false,true]{for bottom in [false,true]{
   let c=Corner{right,bottom};let origin=PhysicalPosition::new(-1500,120);let full=PhysicalSize::new(1040,780);
   for size in [PhysicalSize::new(40,48),PhysicalSize::new(240,200),PhysicalSize::new(750,520)]{
    let p=anchored(origin,full,size,c);
    assert_eq!(p.x+if right{size.width as i32}else{0},origin.x+if right{full.width as i32}else{0});
    assert_eq!(p.y+if bottom{size.height as i32}else{0},origin.y+if bottom{full.height as i32}else{0});
    assert_eq!(anchored(p,size,full,c),origin);
   }
  }}
 }
 #[test]
 fn nearest_edges_choose_corner_on_negative_monitor(){
  let area=||tauri::Rect{position:PhysicalPosition::new(-1920,0).into(),size:PhysicalSize::new(1920,1040).into()};
  let size=PhysicalSize::new(800,600);
  let upper=nearest_corner(PhysicalPosition::new(-820,20),size,area());assert!(upper.right&&!upper.bottom);
  let lower=nearest_corner(PhysicalPosition::new(-1900,420),size,area());assert!(!lower.right&&lower.bottom);
 }
 #[test]
 fn dragged_window_fits_available_space_without_moving_anchor(){
  let p=PhysicalPosition::new(-1000,30);let from=PhysicalSize::new(40,48);let c=Corner{right:true,bottom:false};
  let size=expansion_size(p,from,PhysicalSize::new(1040,1200),PhysicalPosition::new(-1920,0),PhysicalSize::new(1920,1040),c);
  assert_eq!(size,PhysicalSize::new(960,1010));
  assert_eq!(anchored(p,from,size,c),PhysicalPosition::new(-1920,30));
 }
}
