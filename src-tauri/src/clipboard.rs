use crate::{err, ExportFile, Result, Store};
use tauri::Manager;
fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
pub(crate) fn html(text: &str, files: &[ExportFile]) -> Result<String> {
    let mut body = format!(
        "<div><pre style=\"white-space:pre-wrap\">{}</pre>",
        escape(text)
    );
    let mut total = 0_u64;
    for file in files {
        let path = std::fs::canonicalize(&file.source).map_err(err)?;
        total += std::fs::metadata(&path).map_err(err)?.len();
        if total > 75 * 1024 * 1024 {
            return Err("图文复制总量超过 75 MB，请使用完整导出或 MCP".into());
        }
        // Files are copied into a durable local package before clipboard publication.
        let url = tauri::Url::from_file_path(&path).map_err(|_| "图片路径无法转换".to_string())?;
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
        let rich = html(&text, &exported)?;
        #[cfg(windows)]
        {
            let _lock = clipboard_win::Clipboard::new_attempts(10).map_err(err)?;
            let format = clipboard_win::formats::Html::new().ok_or("无法注册图文剪贴板格式")?;
            clipboard_win::raw::empty().map_err(err)?;
            clipboard_win::raw::set_string_with(&text, clipboard_win::options::NoClear)
                .map_err(err)?;
            clipboard_win::raw::set_html(format.code(), &rich).map_err(err)?;
            let paths: Vec<_> = exported.iter().map(|f| &f.source).collect();
            if !paths.is_empty() {
                clipboard_win::raw::set_file_list_with(&paths, clipboard_win::options::NoClear)
                    .map_err(err)?;
            }
        }
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
        )
        .unwrap();
        assert!(!body.contains("<script>"));
        assert!(body.contains("&lt;script&gt;"));
        assert!(body.contains("file:///"));
        assert!(body.contains("&quot;&lt;&amp;.png"));
        std::fs::remove_dir_all(s.root).unwrap();
    }
}
