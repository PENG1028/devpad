use crate::{err, resident, windows, Result, Store};
use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
use std::{collections::HashMap, sync::LazyLock};
use tauri::{Emitter, Manager};

type Dictionary = HashMap<String, String>;
include!(concat!(env!("OUT_DIR"), "/catalogs.rs"));

#[derive(Deserialize)]
struct LocaleSpec {
    code: String,
    #[serde(default)]
    aliases: Vec<String>,
}

static REGISTRY: LazyLock<Vec<LocaleSpec>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/locales/registry.json")).expect("language registry")
});

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Language(&'static str);

impl Language {
    pub const CHINESE: Self = Self("zh-CN");
    pub const ENGLISH: Self = Self("en");

    fn requested(tag: &str) -> Option<Self> {
        let normalized = tag.to_lowercase().replace('_', "-");
        let mut candidate = normalized.as_str();
        loop {
            if let Some(item) = REGISTRY.iter().find(|item| item.code.eq_ignore_ascii_case(candidate)
                || item.aliases.iter().any(|alias| alias.eq_ignore_ascii_case(candidate))) {
                return Some(Self(&item.code));
            }
            candidate = candidate.rsplit_once('-')?.0;
        }
    }

    pub fn text(self, key: &'static str) -> &'static str {
        if self == Self::CHINESE { return key; }
        catalog(self.0).and_then(|dict| dict.get(key)).map(String::as_str)
            .or_else(|| catalog("en").and_then(|dict| dict.get(key)).map(String::as_str))
            .unwrap_or(key)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Preference {
    #[default]
    System,
    Selected(Language),
}

impl Preference {
    fn parse(code: &str) -> Option<Self> {
        if code == "system" { return Some(Self::System); }
        REGISTRY.iter().find(|item| item.code == code)
            .map(|item| Self::Selected(Language(&item.code)))
    }

    fn code(self) -> &'static str {
        match self { Self::System => "system", Self::Selected(language) => language.0 }
    }

    pub fn resolve(self) -> Language {
        match self {
            Self::System => sys_locale::get_locales()
                .find_map(|tag| Language::requested(&tag)).unwrap_or(Language::ENGLISH),
            Self::Selected(language) => language,
        }
    }
}

pub fn load(db: &Connection) -> rusqlite::Result<Preference> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS app_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);")?;
    let value: Option<String> = db.query_row(
        "SELECT value FROM app_settings WHERE name='locale'", [], |row| row.get(0),
    ).optional()?;
    Ok(value.as_deref().and_then(Preference::parse).unwrap_or_default())
}

fn persist(db: &Connection, preference: Preference) -> rusqlite::Result<()> {
    db.execute(
        "INSERT INTO app_settings (name, value) VALUES ('locale', ?1) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
        [preference.code()],
    )?;
    Ok(())
}

#[tauri::command]
pub fn get_locale(store: tauri::State<Store>) -> Result<&'static str> {
    Ok(store.locale.read().map_err(err)?.code())
}

#[tauri::command]
pub fn set_locale(app: tauri::AppHandle, store: tauri::State<Store>, locale: String) -> Result<()> {
    let preference = Preference::parse(&locale).ok_or_else(|| format!("Invalid locale: {locale}"))?;
    {
        let db = store.db.lock().map_err(err)?;
        let mut current = store.locale.write().map_err(err)?;
        if *current != preference {
            persist(&db, preference).map_err(err)?;
            *current = preference;
        }
    }
    let language = preference.resolve();
    let tray = resident::localize(&app, language);
    for window in app.webview_windows().into_values() {
        let _ = windows::localize_title(&window, language);
    }
    app.emit("locale-changed", preference.code()).map_err(err)?;
    tray.map_err(err)
}

pub fn matches_label(label: &'static str, lowercase: &str) -> bool {
    label.to_lowercase() == lowercase || REGISTRY.iter().any(|spec| Language(&spec.code).text(label).to_lowercase() == lowercase)
}

pub fn language(app: &tauri::AppHandle) -> Language { app.state::<Store>().language() }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_registered_language_persists_and_translates_the_tray() {
        let db = Connection::open_in_memory().unwrap();
        assert_eq!(load(&db).unwrap(), Preference::System);
        for item in REGISTRY.iter() {
            let preference = Preference::parse(&item.code).unwrap();
            persist(&db, preference).unwrap();
            assert_eq!(load(&db).unwrap(), preference);
            if item.code != "zh-CN" {
                let values = catalog(&item.code).expect("registered catalog");
                assert_eq!(preference.resolve().text("打开 DevPad"), values["打开 DevPad"]);
                assert!(!values["打开 DevPad"].is_empty());
            }
        }
        persist(&db, Preference::System).unwrap();
        assert_eq!(load(&db).unwrap(), Preference::System);
        assert!(Preference::parse("xyz-test").is_none());
    }

    #[test]
    fn resolves_regions_and_scripts_using_the_shared_registry() {
        for (tag, expected) in [("zh-Hant-HK","zh-TW"),("zh_SG","zh-CN"),("pt-PT","pt-BR"),
            ("ar-EG","ar"),("ja-JP","ja"),("en-GB","en")] {
            assert_eq!(Language::requested(tag).unwrap().0, expected);
        }
        assert_eq!(Language::requested("x-unknown"), None);
    }
}
