use crate::{err, locale::Language, Result, Store};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

#[derive(Deserialize)]
pub struct Builtin {
    pub id: &'static str,
    pub label: &'static str,
}
pub static BUILTINS: LazyLock<Vec<Builtin>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/note-types.json")).expect("built-in note types")
});

#[derive(Serialize, Debug)]
pub struct NoteType {
    pub id: String,
    pub name: String,
}

pub fn schema(db: &Connection) -> Result<()> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS note_types (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE
    )").map_err(err)
}

pub fn custom(db: &Connection) -> Result<Vec<NoteType>> {
    let mut query = db.prepare("SELECT id,name FROM note_types ORDER BY name_key").map_err(err)?;
    let items = query.query_map([], |row| Ok(NoteType {id: row.get(0)?, name: row.get(1)?})).map_err(err)?;
    items.collect::<rusqlite::Result<_>>().map_err(err)
}

pub fn known(db: &Connection, id: &str) -> Result<bool> {
    if BUILTINS.iter().any(|kind| kind.id == id) { return Ok(true); }
    db.query_row("SELECT EXISTS(SELECT 1 FROM note_types WHERE id=?1)", [id], |row| row.get(0)).map_err(err)
}

fn create(db: &Connection, name: &str, language: Language) -> Result<NoteType> {
    let name = name.trim();
    if !(1..=40).contains(&name.chars().count()) || name.chars().any(char::is_control) {
        return Err(language.text("类型名称需为 1–40 个字符").into());
    }
    let key = name.to_lowercase();
    if let Some(kind) = BUILTINS.iter().find(|kind| kind.id.eq_ignore_ascii_case(name)
        || crate::locale::matches_label(kind.label, &key)) {
        return Ok(NoteType {id:kind.id.into(), name:language.text(kind.label).into()});
    }
    // The unique normalized name also handles simultaneous submissions from two editors.
    db.execute("INSERT INTO note_types(id,name,name_key) VALUES(?1,?2,?3) ON CONFLICT(name_key) DO NOTHING",
        params![uuid::Uuid::new_v4().to_string(),name,key]).map_err(err)?;
    db.query_row("SELECT id,name FROM note_types WHERE name_key=?1", [&key],
        |row| Ok(NoteType {id:row.get(0)?,name:row.get(1)?})).map_err(err)
}

#[tauri::command]
pub fn create_note_type(s: tauri::State<Store>, name: String) -> Result<NoteType> {
    let db = s.db.lock().map_err(err)?;
    create(&db, &name, s.language())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_types_and_translations_resolve_without_rewriting_notes() {
        let db=Connection::open_in_memory().unwrap();
        schema(&db).unwrap();
        for kind in BUILTINS.iter() {
            assert!(known(&db, kind.id).unwrap());
            assert_eq!(create(&db, kind.label, Language::ENGLISH).unwrap().id, kind.id);
        }
        assert_eq!(create(&db," reference ",Language::CHINESE).unwrap().id,"Reference");
        let record=create(&db,"  EXPO  ",Language::ENGLISH).unwrap();
        assert_eq!(create(&db,"Expo",Language::CHINESE).unwrap().id,record.id);
        assert!(known(&db,&record.id).unwrap());
        assert_eq!(custom(&db).unwrap().len(),1);
        assert!(create(&db,&"字".repeat(41),Language::CHINESE).is_err());
        assert!(!known(&db,"obsolete").unwrap());
    }
}
