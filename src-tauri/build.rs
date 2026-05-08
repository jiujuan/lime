const WINDOWS_STACK_SIZE_BYTES: usize = 10 * 1024 * 1024;

fn main() {
    configure_windows_stack_size();

    // tauri::generate_context! 在编译期会校验 `frontendDist` 路径是否存在。
    // 开发/CI 场景下可能只跑 `cargo check/test` 而未先构建前端，从而导致宏 panic。
    // 这里提前创建配置中的 `../dist` 目录，避免无关的编译阻塞。
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let manifest_path = std::path::PathBuf::from(&manifest_dir);
        let dist_dir = manifest_path.join("../dist");
        let _ = std::fs::create_dir_all(dist_dir);
    }
    tauri_build::build()
}

fn configure_windows_stack_size() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    match std::env::var("CARGO_CFG_TARGET_ENV").as_deref() {
        Ok("msvc") => println!("cargo:rustc-link-arg=/STACK:{WINDOWS_STACK_SIZE_BYTES}"),
        Ok("gnu") => println!("cargo:rustc-link-arg=-Wl,--stack,{WINDOWS_STACK_SIZE_BYTES}"),
        _ => {}
    }
}
