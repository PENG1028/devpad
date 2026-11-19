use std::{env, fmt::Write, fs, path::PathBuf};

fn embed_catalogs() {
    let root = PathBuf::from("../src/locales/messages");
    println!("cargo:rerun-if-changed={}", root.display());
    let mut paths: Vec<_> = fs::read_dir(root).expect("locale directory").map(|e| e.unwrap().path()).collect();
    paths.sort();
    let mut source = String::from("fn catalog(code: &str) -> Option<&'static Dictionary> { match code {\n");
    for path in paths {
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") { continue; }
        let code = path.file_stem().unwrap().to_str().unwrap();
        assert!(code.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'));
        writeln!(source, r#""{code}" => {{
            static MESSAGES: std::sync::OnceLock<Dictionary> = std::sync::OnceLock::new();
            Some(MESSAGES.get_or_init(|| serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../src/locales/messages/{code}.json"))).expect("locale catalog")))
        }},"#).unwrap();
    }
    source.push_str("_ => None } }");
    fs::write(PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("catalogs.rs"), source).unwrap();
}

fn main() {
    embed_catalogs();
    println!("cargo:rerun-if-env-changed=DEVPAD_RELEASE_CHANNEL");
    println!("cargo:rerun-if-env-changed=DEVPAD_RELEASE_REPOSITORY");
    let channel = std::env::var("DEVPAD_RELEASE_CHANNEL").unwrap_or_else(|_| "develop".into());
    let repository = std::env::var("DEVPAD_RELEASE_REPOSITORY").unwrap_or_else(|_| "PENG1028/devpad".into());
    println!("cargo:rustc-env=DEVPAD_RELEASE_CHANNEL={channel}");
    println!("cargo:rustc-env=DEVPAD_RELEASE_REPOSITORY={repository}");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
