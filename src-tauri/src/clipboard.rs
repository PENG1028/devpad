use crate::{err, ExportFile, Result, Store};
use crate::locale::Language;
use base64::Engine;
use tauri::Manager;
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
pub(crate) fn html(text: &str, files: &[ExportFile], language: Language) -> Result<String> {
    let mut body = format!(
        "<div><pre style=\"white-space:pre-wrap\">{}</pre>",
        escape(text)
    );
    let mut total = 0_u64;
    for file in files {
        let path = std::fs::canonicalize(&file.source).map_err(err)?;
        total += std::fs::metadata(&path).map_err(err)?.len();
        if total > 75 * 1024 * 1024 {
            return Err(language.text("图文复制总量超过 75 MB，请使用完整导出或 MCP").into());
        }
        // Files are copied into a durable local package before clipboard publication.
        let url = tauri::Url::from_file_path(&path).map_err(|_| language.text("图片路径无法转换").to_string())?;
        body.push_str(&format!(
            "<figure><figcaption>{}</figcaption><img src=\"{}\" alt=\"{}\"></figure>",
            escape(&file.name),
            escape(url.as_str()),
            escape(&file.name)
        ));
    }
    body.push_str("</div>");
    Ok(body)
}

fn records_html(manifest: &serde_json::Value, files: &[ExportFile], language: Language) -> Result<String> {
    let records = manifest["records"]
        .as_array()
        .ok_or(language.text("图文对应清单格式错误"))?;
    let mut body = String::from("<div>");
    let mut total = 0_u64;
    for record in records {
        body.push_str(&format!(
            "<pre style=\"white-space:pre-wrap;font-family:inherit\">{}</pre>",
            escape(record["text"].as_str().ok_or(language.text("清单正文格式错误"))?)
        ));
        for reference in record["files"].as_array().ok_or(language.text("清单图片格式错误"))? {
            let file = files
                .iter()
                .find(|f| Some(f.name.as_str()) == reference["name"].as_str())
                .ok_or(language.text("清单与图片不一致"))?;
            let path = std::fs::canonicalize(&file.source).map_err(err)?;
            total += std::fs::metadata(&path).map_err(err)?.len();
            if total > 75 * 1024 * 1024 {
                return Err(language.text("图文复制总量超过 75 MB，请使用完整导出或 MCP").into());
            }
            let mime = match path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
                "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp", _ => "image/png",
            };
            // Rich editors can paste the pixels without permission to read a local file URL.
            let bytes = std::fs::read(path).map_err(err)?;
            body.push_str(&format!(
                "<img src=\"data:{};base64,{}\" alt=\"{}\">",
                mime, base64::engine::general_purpose::STANDARD.encode(bytes),
                escape(reference["displayName"].as_str().or_else(|| reference["originalName"].as_str()).unwrap_or(language.text("图片")))
            ));
        }
    }
    body.push_str("</div>");
    Ok(body)
}
#[cfg(windows)]
fn write_windows_formats(text: &str, rich: &str, files: &[ExportFile], language: Language) -> Result<()> {
    use clipboard_win::{formats, options::NoClear, raw, Clipboard};
    let format = formats::Html::new().ok_or(language.text("无法注册图文剪贴板格式"))?;
    let paths: Vec<_> = files.iter().map(|file| &file.source).collect();
    let _lock = Clipboard::new_attempts(10).map_err(err)?;
    raw::empty().map_err(err)?;
    raw::set_html_with(format.code(), rich, NoClear).map_err(err)?;
    if !paths.is_empty() {
        raw::set_file_list_with(&paths, NoClear).map_err(err)?;
    }
    raw::set_string_with(text, NoClear).map_err(err)?;
    Ok(())
}
#[cfg(windows)]
pub fn image_files_and_text() -> Option<(Vec<String>, String)> {
    use clipboard_win::{formats, raw, Clipboard};
    let _lock = Clipboard::new_attempts(10).ok()?;
    let mut files = Vec::new();
    raw::get_file_list(&mut files).ok()?;
    if files.is_empty() { return None; }
    let mut bytes = Vec::new();
    // File managers also provide paths as text. A rich clipboard offers a separate text fallback.
    if formats::Html::new().is_some_and(|format| raw::is_format_avail(format.code())) {
        let _ = raw::get_string(&mut bytes);
    }
    Some((files, String::from_utf8_lossy(&bytes).into_owned()))
}
#[tauri::command]
pub async fn copy_bundle(
    app: tauri::AppHandle,
    text: String,
    files: Vec<ExportFile>,
    manifest: serde_json::Value,
) -> Result<usize> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = app.state::<Store>();
        let dir = s
            .root
            .join("exports")
            .join(uuid::Uuid::new_v4().to_string());
        crate::export_to(&s, &dir, &text, &files)?;
        std::fs::write(
            dir.join("manifest.json"),
            serde_json::to_vec_pretty(&manifest).map_err(err)?,
        )
        .map_err(err)?;
        let exported: Vec<_> = files
            .iter()
            .map(|f| ExportFile {
                source: dir.join(&f.name).to_string_lossy().into(),
                name: f.name.clone(),
                mark: None,
            })
            .collect();
        let language = s.language();
        let rich = if manifest["layout"] == "records" {
            records_html(&manifest, &exported, language)?
        } else {
            html(&text, &exported, language)?
        };
        #[cfg(windows)]
        write_windows_formats(&text, &rich, &exported, language)?;
        #[cfg(not(windows))]
        {
            arboard::Clipboard::new()
                .map_err(err)?
                .set_html(rich, Some(text))
                .map_err(err)?;
        }
        Ok(files.len())
    })
    .await
    .map_err(err)?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn windows_publishes_text_html_and_image_files_together() {
        // The child has its own Windows clipboard. The user's current clipboard stays untouched.
        const CHILD: &str = "DEVPAD_PRIVATE_CLIPBOARD_TEST";
        if std::env::var_os(CHILD).is_none() {
            let status = std::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "clipboard::tests::windows_publishes_text_html_and_image_files_together"])
                .env(CHILD, "1").status().unwrap();
            assert!(status.success());
            return;
        }
        use std::{ffi::c_void, ptr::null};
        #[link(name="user32")]
        extern "system" {
            fn CreateWindowStationW(name:*const u16, flags:u32, access:u32, security:*const c_void) -> *mut c_void;
            fn GetProcessWindowStation() -> *mut c_void;
            fn GetUserObjectInformationW(object:*mut c_void, index:i32, buffer:*mut c_void, length:u32, needed:*mut u32) -> i32;
            fn SetProcessWindowStation(station:*mut c_void) -> i32;
            fn CreateDesktopW(name:*const u16, device:*const u16, mode:*const c_void, flags:u32, access:u32, security:*const c_void) -> *mut c_void;
            fn SetThreadDesktop(desktop:*mut c_void) -> i32;
            fn CreateWindowExW(ex:u32,class:*const u16,name:*const u16,style:u32,x:i32,y:i32,w:i32,h:i32,parent:*mut c_void,menu:*mut c_void,instance:*mut c_void,param:*mut c_void)->*mut c_void;
            fn SendMessageW(window:*mut c_void,msg:u32,w:usize,l:isize)->isize;
            fn DestroyWindow(window:*mut c_void)->i32;
        }
        let station_name:Vec<_>=format!("DevPadTest-{}\0",uuid::Uuid::new_v4()).encode_utf16().collect();
        let desktop_name:Vec<_>=format!("Clipboard-{}\0",uuid::Uuid::new_v4()).encode_utf16().collect();
        fn station_name_of(station:*mut c_void)->Vec<u16>{
            let mut name=[0u16;256];
            let mut needed=0;
            assert_ne!(unsafe{GetUserObjectInformationW(station,2,name.as_mut_ptr().cast(),512,&mut needed)},0);
            name[..needed as usize/2].to_vec()
        }
        unsafe {
            let mut station=CreateWindowStationW(station_name.as_ptr(),0,0x10000000,null());
            if station.is_null(){station=CreateWindowStationW(null(),0,0x10000000,null());}
            assert!(!station.is_null());
            assert_ne!(station_name_of(station),station_name_of(GetProcessWindowStation()));
            assert!(!station.is_null() && SetProcessWindowStation(station)!=0,"{}",std::io::Error::last_os_error());
            let desktop=CreateDesktopW(desktop_name.as_ptr(),null(),null(),0,0x10000000,null());
            assert!(!desktop.is_null() && SetThreadDesktop(desktop)!=0,"{}",std::io::Error::last_os_error());
        }
        let store=crate::tests::store();
        let names=["A.png","B.png"];
        let files:Vec<_>=names.iter().map(|name|{
            let path=store.root.join("attachments").join(name);
            std::fs::write(&path,name).unwrap();
            ExportFile{source:path.to_string_lossy().into(),name:name.to_string(),mark:None}
        }).collect();
        let manifest=serde_json::json!({"records":[{"text":"正文","files":[{"name":"A.png","originalName":"一.png"},{"name":"B.png","originalName":"二.png"}]}]});
        let rich=records_html(&manifest,&files,store.language()).unwrap();
        let plain="正文\n[图片] 一.png\n[图片] 二.png";
        write_windows_formats(plain,&rich,&files,store.language()).unwrap();
        // Ask a real multiline Windows edit control to paste from the private clipboard.
        let class:Vec<_>="EDIT\0".encode_utf16().collect();
        let edit=unsafe{CreateWindowExW(0,class.as_ptr(),null(),0x80000004,0,0,320,100,std::ptr::null_mut(),std::ptr::null_mut(),std::ptr::null_mut(),std::ptr::null_mut())};
        assert!(!edit.is_null(),"{}",std::io::Error::last_os_error());
        let mut pasted=[0u16;256];
        unsafe { SendMessageW(edit,0x0302,0,0); } // WM_PASTE
        let len=unsafe{SendMessageW(edit,0x000D,pasted.len(),pasted.as_mut_ptr() as isize)} as usize;
        unsafe { DestroyWindow(edit); }
        assert_eq!(String::from_utf16(&pasted[..len]).unwrap().replace("\r\n","\n"),plain);
        let (round_trip_files,round_trip_text)=image_files_and_text().unwrap();
        assert_eq!(round_trip_files.len(),2);
        assert_eq!(round_trip_text,plain);
        let _read=clipboard_win::Clipboard::new_attempts(10).unwrap();
        let (mut text,mut html,mut paths)=(Vec::new(),Vec::new(),Vec::new());
        clipboard_win::raw::get_string(&mut text).unwrap();
        clipboard_win::raw::get_html(clipboard_win::formats::Html::new().unwrap().code(),&mut html).unwrap();
        clipboard_win::raw::get_file_list(&mut paths).unwrap();
        assert_eq!(String::from_utf8(text).unwrap(),plain);
        assert_eq!(String::from_utf8(html).unwrap(),rich);
        assert_eq!(paths,files.iter().map(|file|file.source.as_str()).collect::<Vec<_>>());
        std::fs::remove_dir_all(store.root).unwrap();
    }
    #[test]
    fn plain_rich_copy_keeps_each_notes_images_without_engineering_captions() {
        let s = crate::tests::store();
        let path = s.root.join("attachments/image.png");
        std::fs::write(&path, "image").unwrap();
        let files = vec![ExportFile {
            source: path.to_string_lossy().into(),
            name: "BATCH-R1-P1.png".into(),
            mark: None,
        }];
        let manifest = serde_json::json!({"records":[{"text":"第一条","files":[{"name":"BATCH-R1-P1.png","originalName":"原图.png"}]},{"text":"第二条","files":[]}]});
        let body = records_html(&manifest, &files, s.language()).unwrap();
        assert!(body.find("第一条").unwrap() < body.find("<img").unwrap());
        assert!(body.find("<img").unwrap() < body.find("第二条").unwrap());
        assert!(!body.contains("<figcaption>"));
        assert!(body.contains("alt=\"原图.png\""));
        let wrong =
            serde_json::json!({"records":[{"text":"正文","files":[{"name":"missing.png"}]}]});
        assert!(records_html(&wrong, &files, s.language()).is_err());
        std::fs::remove_dir_all(s.root).unwrap();
    }
    #[test]
    fn rich_html_escapes_source_text_and_names() {
        let s = crate::tests::store();
        let path = s.root.join("attachments/image.png");
        std::fs::write(&path, "image").unwrap();
        let body = html(
            "<script>alert('x')</script>",
            &[ExportFile {
                source: path.to_string_lossy().into(),
                name: "\"<&.png".into(),
                mark: None,
            }],
            s.language(),
        )
        .unwrap();
        assert!(!body.contains("<script>"));
        assert!(body.contains("&lt;script&gt;"));
        assert!(body.contains("file:///"));
        assert!(body.contains("&quot;&lt;&amp;.png"));
        std::fs::remove_dir_all(s.root).unwrap();
    }
}
