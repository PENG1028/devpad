use crate::{err, Result, Store};
use rusqlite::{params, Connection, TransactionBehavior};
use serde_json::{json, Value};
use tauri::Emitter;

#[tauri::command]
pub fn create_project(s: tauri::State<Store>, name: String) -> Result<Value> {
    let name = name.trim();
    if name.is_empty() || name.len() > 200 {
        return Err(s.language().text("请输入 1–200 字节的项目名称").into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    s.db.lock().map_err(err)?.execute("INSERT INTO projects(id,name) VALUES(?1,?2)", params![id, name]).map_err(err)?;
    Ok(json!({"id": id, "name": name}))
}

fn move_to_inbox_and_delete(db: &mut Connection, project: &str) -> rusqlite::Result<()> {
    if project == "inbox" || project.is_empty() { return Ok(()); }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute("INSERT OR IGNORE INTO projects(id,name) VALUES('inbox','收件箱')", [])?;
    // A draft based on the current note can follow this move. A stale draft must still conflict.
    tx.execute("UPDATE drafts SET payload=json_set(payload,'$.revision',COALESCE(json_extract(payload,'$.revision'),0)+1)
        WHERE json_extract(payload,'$.projectId')=?1 AND EXISTS (
            SELECT 1 FROM entries e WHERE e.id=json_extract(drafts.payload,'$.editing') AND e.project_id=?1
            AND COALESCE(json_extract(e.payload,'$.revision'),0)=COALESCE(json_extract(drafts.payload,'$.revision'),0))", [project])?;
    tx.execute("UPDATE drafts SET payload=json_set(payload,'$.projectId','inbox'),fingerprint=''
        WHERE json_extract(payload,'$.projectId')=?1", [project])?;
    tx.execute("UPDATE entries SET project_id='inbox',
        payload=json_set(payload,'$.projectId','inbox','$.updatedAt',?2,'$.revision',COALESCE(json_extract(payload,'$.revision'),0)+1)
        WHERE project_id=?1", params![project, chrono::Utc::now().to_rfc3339()])?;
    tx.execute("DELETE FROM projects WHERE id=?1 AND id<>'inbox'", [project])?;
    tx.commit()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deleting_a_project_keeps_notes_drafts_and_published_snapshots() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("PRAGMA foreign_keys=ON;
            CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT);
            CREATE TABLE entries(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),payload TEXT);
            INSERT INTO projects VALUES('a','Fabric');
            INSERT INTO entries VALUES('note','a','{\"projectId\":\"a\",\"revision\":2,\"attachments\":[{\"id\":\"photo\"}]}');").unwrap();
        crate::drafts::schema(&db).unwrap();
        crate::tasks::schema(&db).unwrap();
        for (id, revision) in [("active",2),("stale",1)] {
            let draft = json!({"projectId":"a","editing":"note","revision":revision,"text":"draft"});
            db.execute("INSERT INTO drafts VALUES(?1,?2,'old','when')", params![id,draft.to_string()]).unwrap();
        }
        db.execute("INSERT INTO agent_tasks(id,payload,state) VALUES('task','snapshot','available')", []).unwrap();
        move_to_inbox_and_delete(&mut db, "a").unwrap();
        move_to_inbox_and_delete(&mut db, "a").unwrap();
        move_to_inbox_and_delete(&mut db, "inbox").unwrap();
        let read = |sql| db.query_row(sql, [], |r| r.get::<_,String>(0)).unwrap();
        assert_eq!(read("SELECT id FROM projects"), "inbox");
        assert_eq!(read("SELECT project_id FROM entries"), "inbox");
        let record:Value=serde_json::from_str(&read("SELECT payload FROM entries")).unwrap();
        assert_eq!(record["projectId"], "inbox");assert_eq!(record["revision"], 3);
        assert_eq!(record["attachments"][0]["id"], "photo");
        for (id, revision) in [("active",3),("stale",1)] {
            let raw:String=db.query_row("SELECT payload FROM drafts WHERE id=?1",[id],|r|r.get(0)).unwrap();
            let draft:Value=serde_json::from_str(&raw).unwrap();
            assert_eq!(draft, json!({"projectId":"inbox","editing":"note","revision":revision,"text":"draft"}));
        }
        assert_eq!(read("SELECT payload FROM agent_tasks"), "snapshot");
    }
}

#[tauri::command]
pub fn delete_project(app: tauri::AppHandle, s: tauri::State<Store>, id: String) -> Result<()> {
    if id == "inbox" || id.is_empty() {
        return Err(s.language().text("收件箱不能删除。").into());
    }
    let mut db = s.db.lock().map_err(err)?;
    move_to_inbox_and_delete(&mut db, &id).map_err(err)?;
    drop(db);
    let _ = app.emit("db-changed", ());
    let _ = app.emit("drafts-changed", ());
    Ok(())
}
