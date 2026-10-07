use crate::{err, Result, Store};
use rusqlite::{params, Connection, TransactionBehavior};
use serde_json::{json, Value};
use tauri::{Emitter, Manager};

pub fn schema(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS agent_tasks(id TEXT PRIMARY KEY,payload TEXT NOT NULL,state TEXT NOT NULL,owner TEXT,token TEXT,expires INTEGER,revision INTEGER NOT NULL DEFAULT 1); CREATE TABLE IF NOT EXISTS task_events(id INTEGER PRIMARY KEY,task_id TEXT NOT NULL,event TEXT NOT NULL,created_at TEXT NOT NULL);").map_err(err)
}
fn event(db: &Connection, id: &str, value: Value) -> Result<()> {
    db.execute(
        "INSERT INTO task_events(task_id,event,created_at) VALUES(?1,?2,?3)",
        params![id, value.to_string(), chrono::Utc::now().to_rfc3339()],
    )
    .map_err(err)?;
    Ok(())
}
pub fn publish(s: &Store, ids: &[String], instructions: &str) -> Result<String> {
    if ids.is_empty() || ids.len() > 200 {
        return Err("请选择 1–200 条笔记".into());
    }
    if instructions.len() > 100_000 {
        return Err("任务说明过长".into());
    }
    let mut db = s.db.lock().map_err(err)?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    let mut records = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for id in ids {
        if !seen.insert(id) {
            continue;
        }
        let raw: String = tx
            .query_row("SELECT payload FROM entries WHERE id=?1", [id], |r| {
                r.get(0)
            })
            .map_err(|_| "笔记已删除，请刷新后重试".to_string())?;
        records.push(serde_json::from_str::<Value>(&raw).map_err(err)?);
    }
    let id = uuid::Uuid::new_v4().to_string();
    let payload = json!({"id":id,"createdAt":chrono::Utc::now().to_rfc3339(),"instructions":instructions,"records":records,"result":null});
    tx.execute(
        "INSERT INTO agent_tasks(id,payload,state) VALUES(?1,?2,'available')",
        params![id, payload.to_string()],
    )
    .map_err(err)?;
    event(&tx, &id, json!({"action":"published"}))?;
    tx.commit().map_err(err)?;
    Ok(id)
}
pub fn list(s: &Store, state: Option<&str>) -> Result<Vec<Value>> {
    let db = s.db.lock().map_err(err)?;
    let mut q=db.prepare("SELECT payload,state,owner,expires,revision FROM agent_tasks WHERE ?1 IS NULL OR (CASE WHEN state='claimed' AND expires<=?2 THEN 'available' ELSE state END)=?1 ORDER BY rowid DESC LIMIT 200").map_err(err)?;
    let rows = q
        .query_map(params![state, chrono::Utc::now().timestamp()], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<i64>>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })
        .map_err(err)?;
    let mut out = Vec::new();
    for row in rows {
        let (raw, status, owner, expires, revision) = row.map_err(err)?;
        let expired = status == "claimed" && expires.unwrap_or(0) <= chrono::Utc::now().timestamp();
        let actual = if expired { "available" } else { &status };
        if state.is_some_and(|v| v != actual) {
            continue;
        }
        let mut value: Value = serde_json::from_str(&raw).map_err(err)?;
        value["state"] = json!(actual);
        value["owner"] = if expired { Value::Null } else { json!(owner) };
        value["expires"] = json!(expires);
        value["revision"] = json!(revision);
        out.push(value);
    }
    Ok(out)
}
pub fn get(s: &Store, id: &str) -> Result<Value> {
    let db = s.db.lock().map_err(err)?;
    let (raw, state, owner, expires, revision): (String, String, Option<String>, Option<i64>, i64) =
        db.query_row(
            "SELECT payload,state,owner,expires,revision FROM agent_tasks WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )
        .map_err(|_| "Task not found".to_string())?;
    let expired = state == "claimed" && expires.unwrap_or(0) <= chrono::Utc::now().timestamp();
    let mut value: Value = serde_json::from_str(&raw).map_err(err)?;
    value["state"] = json!(if expired { "available" } else { &state });
    value["owner"] = if expired { Value::Null } else { json!(owner) };
    value["expires"] = json!(expires);
    value["revision"] = json!(revision);
    Ok(value)
}
pub fn claim(s: &Store, id: &str, owner: &str, seconds: i64) -> Result<Value> {
    if owner.trim().is_empty() || owner.len() > 200 || !(60..=3600).contains(&seconds) {
        return Err("agent 名称必填，租期应为 60–3600 秒".into());
    }
    let mut db = s.db.lock().map_err(err)?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    let now = chrono::Utc::now().timestamp();
    let token = uuid::Uuid::new_v4().to_string();
    let expires = now + seconds;
    let changed=tx.execute("UPDATE agent_tasks SET state='claimed',owner=?1,token=?2,expires=?3,revision=revision+1 WHERE id=?4 AND (state='available' OR (state='claimed' AND expires<=?5))",params![owner,token,expires,id,now]).map_err(err)?;
    if changed != 1 {
        return Err("任务不存在、已完成或已被其他 agent 领取".into());
    }
    let raw: String = tx
        .query_row("SELECT payload FROM agent_tasks WHERE id=?1", [id], |r| {
            r.get(0)
        })
        .map_err(err)?;
    event(
        &tx,
        id,
        json!({"action":"claimed","owner":owner,"expires":expires}),
    )?;
    tx.commit().map_err(err)?;
    Ok(
        json!({"task":serde_json::from_str::<Value>(&raw).map_err(err)?,"claimToken":token,"expires":expires}),
    )
}
pub fn finish(
    s: &Store,
    id: &str,
    token: &str,
    result: Option<&str>,
    seconds: Option<i64>,
) -> Result<()> {
    if token.is_empty() {
        return Err("缺少领取凭证".into());
    }
    if result.is_some_and(|r| r.trim().is_empty() || r.len() > 1_000_000) {
        return Err("请提供非空完成说明，最多 1 MB".into());
    }
    if seconds.is_some_and(|v| !(60..=3600).contains(&v)) {
        return Err("租期应为 60–3600 秒".into());
    }
    let mut db = s.db.lock().map_err(err)?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    let now = chrono::Utc::now().timestamp();
    let raw:String=tx.query_row("SELECT payload FROM agent_tasks WHERE id=?1 AND state='claimed' AND token=?2 AND expires>?3",params![id,token,now],|r|r.get(0)).map_err(|_|"领取凭证失效，请重新领取；旧 agent 无法覆盖新结果".to_string())?;
    let mut value: Value = serde_json::from_str(&raw).map_err(err)?;
    let action = if let Some(result) = result {
        value["result"] = json!({"text":result,"completedAt":chrono::Utc::now().to_rfc3339()});
        tx.execute("UPDATE agent_tasks SET state='completed',payload=?1,token=NULL,expires=NULL,revision=revision+1 WHERE id=?2",params![value.to_string(),id]).map_err(err)?;
        "completed"
    } else if let Some(seconds) = seconds {
        tx.execute(
            "UPDATE agent_tasks SET expires=?1,revision=revision+1 WHERE id=?2",
            params![now + seconds, id],
        )
        .map_err(err)?;
        "renewed"
    } else {
        tx.execute("UPDATE agent_tasks SET state='available',owner=NULL,token=NULL,expires=NULL,revision=revision+1 WHERE id=?1",[id]).map_err(err)?;
        "released"
    };
    event(&tx, id, json!({"action":action}))?;
    tx.commit().map_err(err)
}
#[tauri::command]
pub fn publish_task(
    app: tauri::AppHandle,
    ids: Vec<String>,
    instructions: String,
) -> Result<String> {
    let id = publish(&app.state::<Store>(), &ids, &instructions)?;
    app.emit("db-changed", ()).map_err(err)?;
    Ok(id)
}
#[tauri::command]
pub fn list_tasks(s: tauri::State<Store>) -> Result<Vec<Value>> {
    list(&s, None)
}
#[tauri::command]
pub fn cancel_task(app: tauri::AppHandle, id: String) -> Result<()> {
    let s = app.state::<Store>();
    let mut db = s.db.lock().map_err(err)?;
    let tx = db.transaction().map_err(err)?;
    if tx.execute("UPDATE agent_tasks SET state='cancelled',token=NULL,expires=NULL,revision=revision+1 WHERE id=?1 AND state IN ('available','claimed')",[&id]).map_err(err)?!=1{return Err("任务已结束".into());}
    event(&tx, &id, json!({"action":"cancelled"}))?;
    tx.commit().map_err(err)?;
    app.emit("db-changed", ()).map_err(err)
}
#[tauri::command]
pub fn mcp_config() -> Result<Value> {
    let command = std::env::current_exe().map_err(err)?;
    #[cfg(target_os = "linux")]
    let command = match (
        std::env::var_os("APPIMAGE").map(std::path::PathBuf::from),
        std::env::var_os("APPDIR").map(std::path::PathBuf::from),
    ) {
        (Some(image), Some(dir)) if image.is_absolute() && command.starts_with(&dir) => image,
        _ => command,
    };
    let mut server = json!({"command":command,"args":["--mcp"]});
    if let Some(root) = std::env::var_os("DEVPAD_DATA_DIR") {
        server["env"] = json!({"DEVPAD_DATA_DIR":std::path::PathBuf::from(root)});
    }
    Ok(json!({"mcpServers":{"devpad":server}}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn leases_reject_stale_and_foreign_agents() {
        let s = crate::tests::store();
        crate::tests::schema(&s.db.lock().unwrap());
        schema(&s.db.lock().unwrap()).unwrap();
        crate::save_record(&s,json!({"id":"n","projectId":"a","type":"Note","status":"Open","attachments":[],"text":"原文"})).unwrap();
        let id = publish(&s, &["n".into()], "").unwrap();
        let first = claim(&s, &id, "A", 60).unwrap();
        assert!(claim(&s, &id, "B", 60).is_err());
        assert!(finish(&s, &id, "wrong", Some("伪造"), None).is_err());
        s.db.lock()
            .unwrap()
            .execute("UPDATE agent_tasks SET expires=0", [])
            .unwrap();
        let second = claim(&s, &id, "B", 60).unwrap();
        assert!(finish(
            &s,
            &id,
            first["claimToken"].as_str().unwrap(),
            Some("过期"),
            None
        )
        .is_err());
        finish(
            &s,
            &id,
            second["claimToken"].as_str().unwrap(),
            Some("完成及验证结果"),
            None,
        )
        .unwrap();
        assert!(claim(&s, &id, "C", 60).is_err());
        assert_eq!(
            list(&s, Some("completed")).unwrap()[0]["result"]["text"],
            "完成及验证结果"
        );
        std::fs::remove_dir_all(s.root).unwrap();
    }
}
