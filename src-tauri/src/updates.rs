use crate::{drafts, err, Result, Store};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Updates {
    pending: Mutex<Option<Update>>,
    working: AtomicBool,
}

pub fn channel(app: &tauri::AppHandle) -> String {
    let s = app.state::<Store>();
    std::fs::read_to_string(s.root.join("update-channel.json"))
        .ok()
        .and_then(|raw| serde_json::from_str::<String>(&raw).ok())
        .filter(|c| ["develop", "stable"].contains(&c.as_str()))
        .unwrap_or_else(|| env!("DEVPAD_RELEASE_CHANNEL").into())
}
pub fn endpoint(repository: &str, channel: &str) -> Result<String> {
    let parts: Vec<_> = repository.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|p| {
            p.is_empty()
                || !p
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        })
    {
        return Err("更新仓库配置无效".into());
    }
    match channel {
        "develop" => Ok(format!(
            "https://github.com/{repository}/releases/download/dev-latest/latest.json"
        )),
        "stable" => Ok(format!(
            "https://github.com/{repository}/releases/latest/download/latest.json"
        )),
        _ => Err("未知更新通道".into()),
    }
}
#[tauri::command]
pub fn update_info(app: tauri::AppHandle) -> Value {
    json!({"version":app.package_info().version.to_string(),"channel":channel(&app),"platform":std::env::consts::OS,"repository":env!("DEVPAD_RELEASE_REPOSITORY")})
}
#[tauri::command]
pub fn set_update_channel(app: tauri::AppHandle, channel: String) -> Result<()> {
    endpoint(env!("DEVPAD_RELEASE_REPOSITORY"), &channel)?;
    if app.state::<Updates>().working.load(Ordering::SeqCst) {
        return Err("更新正在进行，请稍后切换通道".into());
    }
    let s = app.state::<Store>();
    std::fs::write(
        s.root.join("update-channel.json"),
        serde_json::to_vec(&channel).map_err(err)?,
    )
    .map_err(err)?;
    *app.state::<Updates>().pending.lock().map_err(err)? = None;
    Ok(())
}
#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<Option<Value>> {
    let state = app.state::<Updates>();
    if state.working.swap(true, Ordering::SeqCst) {
        return Err("正在检查或安装更新".into());
    }
    let result = async {
        *state.pending.lock().map_err(err)? = None;
        let url = endpoint(env!("DEVPAD_RELEASE_REPOSITORY"), &channel(&app))?;
        let update = app
            .updater_builder()
            .endpoints(vec![url.parse().map_err(err)?])
            .map_err(err)?
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(err)?
            .check()
            .await
            .map_err(|e| format!("检查更新失败：{e}"))?;
        let info = update.as_ref().map(
            |u| json!({"version":u.version,"notes":u.body,"date":u.date.map(|d|d.to_string())}),
        );
        *state.pending.lock().map_err(err)? = update;
        Ok(info)
    }
    .await;
    state.working.store(false, Ordering::SeqCst);
    result
}
fn backup(app: &tauri::AppHandle) -> Result<()> {
    let s = app.state::<Store>();
    let dir = s.root.join("backups");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let destination = dir.join(format!(
        "before-update-{}-{}-{}.sqlite",
        app.package_info().version,
        chrono::Utc::now().format("%Y%m%dT%H%M%SZ"),
        uuid::Uuid::new_v4()
    ));
    s.db.lock()
        .map_err(err)?
        .execute("VACUUM INTO ?1", [destination.to_string_lossy().as_ref()])
        .map_err(err)?;
    Ok(())
}
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<()> {
    let state = app.state::<Updates>();
    if state.working.swap(true, Ordering::SeqCst) {
        return Err("更新正在进行".into());
    }
    let result = async {
        let update = state
            .pending
            .lock()
            .map_err(err)?
            .clone()
            .ok_or("请先检查更新")?;
        let _mcp_guard = crate::mcp::update_lock(&app.state::<Store>().root)?;
        app.emit("prepare-update", ()).map_err(err)?;
        // Give editors a chance to flush; check fingerprints again after the download.
        tauri::async_runtime::spawn_blocking(|| {
            std::thread::sleep(std::time::Duration::from_millis(600))
        })
        .await
        .map_err(err)?;
        drafts::ready_for_update(&app)?;
        let progress_app = app.clone();
        let mut downloaded = 0_u64;
        let bytes = update
            .download(
                move |length, total| {
                    downloaded += length as u64;
                    let _ = progress_app.emit(
                        "update-progress",
                        json!({"downloaded":downloaded,"total":total,"phase":"downloading"}),
                    );
                },
                || {},
            )
            .await
            .map_err(|e| format!("下载或验证更新失败：{e}"))?;
        drafts::ready_for_update(&app)?;
        // Persisted drafts are recoverable after restart. Freeze editors for the final backup/install.
        app.emit("update-installing", ()).map_err(err)?;
        backup(&app)?;
        update
            .install(bytes)
            .map_err(|e| format!("安装更新失败：{e}"))?;
        #[cfg(not(windows))]
        app.restart();
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = app.emit("update-install-failed", ());
    }
    state.working.store(false, Ordering::SeqCst);
    result
}

#[cfg(test)]
mod tests {
    #[test]
    fn channels_are_distinct_and_reject_arbitrary_endpoints() {
        assert!(super::endpoint("PENG1028/devpad", "develop")
            .unwrap()
            .contains("dev-latest"));
        assert!(super::endpoint("PENG1028/devpad", "stable")
            .unwrap()
            .contains("releases/latest/"));
        assert!(super::endpoint("evil/../repo", "stable").is_err());
        assert!(super::endpoint("PENG1028/devpad", "unknown").is_err());
    }
}
