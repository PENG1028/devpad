use crate::{attachment_path, err, Result, Store, Windows};
use rusqlite::params;
use serde_json::Value;
use tauri::{Emitter, Manager};

pub fn schema(db: &rusqlite::Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY,payload TEXT NOT NULL,fingerprint TEXT NOT NULL,updated_at TEXT NOT NULL);").map_err(err)
}

#[tauri::command]
pub fn save_draft(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    payload: Value,
    fingerprint: String,
    previous_id: Option<String>,
) -> Result<()> {
    if !window.label().starts_with("editor-") {
        return Err("只有编辑窗口可以保存草稿".into());
    }
    let s = app.state::<Store>();
    for a in payload["attachments"]
        .as_array()
        .ok_or("草稿附件格式错误")?
    {
        attachment_path(&s, a["path"].as_str().ok_or("草稿附件路径错误")?)?;
    }
    let empty = payload["text"].as_str().unwrap_or("").is_empty()
        && payload["attachments"]
            .as_array()
            .is_none_or(|v| v.is_empty())
        && payload["references"]
            .as_array()
            .is_none_or(|v| v.is_empty())
        && payload["tagInput"].as_str().unwrap_or("").trim().is_empty();
    let mut db = s.db.lock().map_err(err)?;
    let tx = db.transaction().map_err(err)?;
    if empty {
        tx.execute("DELETE FROM drafts WHERE id=?1", [window.label()])
            .map_err(err)?;
    } else {
        tx.execute("INSERT INTO drafts(id,payload,fingerprint,updated_at) VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,fingerprint=excluded.fingerprint,updated_at=excluded.updated_at",params![window.label(),payload.to_string(),fingerprint,chrono::Utc::now().to_rfc3339()]).map_err(err)?;
    }
    if let Some(old) = previous_id {
        if old != window.label() {
            tx.execute("DELETE FROM drafts WHERE id=?1", [old])
                .map_err(err)?;
        }
    }
    tx.commit().map_err(err)?;
    drop(db);
    app.emit("drafts-changed", ()).map_err(err)
}

#[tauri::command]
pub fn list_drafts(app: tauri::AppHandle) -> Result<Vec<Value>> {
    let active: Vec<String> = app
        .state::<Windows>()
        .editors
        .lock()
        .map_err(err)?
        .keys()
        .cloned()
        .collect();
    let s = app.state::<Store>();
    let db = s.db.lock().map_err(err)?;
    let mut q = db
        .prepare("SELECT id,payload,updated_at FROM drafts ORDER BY updated_at DESC")
        .map_err(err)?;
    let rows = q
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(err)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(err)?;
    rows.into_iter().filter(|(id,_,_)|!active.contains(id)).map(|(id,payload,at)|Ok(serde_json::json!({"id":id,"payload":serde_json::from_str::<Value>(&payload).map_err(err)?,"updatedAt":at}))).collect()
}

#[tauri::command]
pub fn discard_draft(app: tauri::AppHandle, id: String) -> Result<()> {
    app.state::<Store>()
        .db
        .lock()
        .map_err(err)?
        .execute("DELETE FROM drafts WHERE id=?1", [id])
        .map_err(err)?;
    app.emit("drafts-changed", ()).map_err(err)
}

pub fn ready_for_update(app: &tauri::AppHandle) -> Result<()> {
    let state = app.state::<Windows>();
    let editors = state.editors.lock().map_err(err)?;
    let store = app.state::<Store>();
    let db = store.db.lock().map_err(err)?;
    for editor in editors.values() {
        if editor.busy {
            return Err("正在处理图片或保存，请稍后再更新".into());
        }
        if editor.dirty {
            let saved = db
                .query_row(
                    "SELECT fingerprint FROM drafts WHERE id=?1",
                    [&editor.label],
                    |r| r.get::<_, String>(0),
                )
                .ok();
            if saved.as_deref() != Some(&editor.fingerprint) {
                return Err("正在保存草稿，请稍后再更新".into());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn drafts_are_durable_and_replace_atomically() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        super::schema(&db).unwrap();
        db.execute(
            "INSERT INTO drafts VALUES('editor-a','{\"text\":\"原文\"}','v1','now')",
            [],
        )
        .unwrap();
        assert_eq!(
            db.query_row(
                "SELECT fingerprint FROM drafts WHERE id='editor-a'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "v1"
        );
    }
}
