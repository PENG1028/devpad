fn main() {
    println!("cargo:rerun-if-env-changed=DEVPAD_RELEASE_CHANNEL");
    println!("cargo:rerun-if-env-changed=DEVPAD_RELEASE_REPOSITORY");
    let channel = std::env::var("DEVPAD_RELEASE_CHANNEL").unwrap_or_else(|_| "develop".into());
    let repository = std::env::var("DEVPAD_RELEASE_REPOSITORY").unwrap_or_else(|_| "PENG1028/devpad".into());
    println!("cargo:rustc-env=DEVPAD_RELEASE_CHANNEL={channel}");
    println!("cargo:rustc-env=DEVPAD_RELEASE_REPOSITORY={repository}");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    tauri_build::build()
}
