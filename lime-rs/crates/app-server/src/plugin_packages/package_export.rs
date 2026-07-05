// input: 本地 Plugin 目录
// output: 可上传到 LimeCore 的受控 zip package bytes 与 hash 证据
// pos: lime-rs/crates/app-server/src/plugin_packages/package_export.rs

use app_server_protocol::{PluginLocalPackageExportParams, PluginLocalPackageExportResponse};
use base64::Engine;
use chrono::Utc;
use serde_json::Value;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::io::Cursor;
use std::io::Write;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;
use zip::write::FileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

use super::plugin_manifest::resolve_plugin_package_manifest;

const PLUGIN_LOCAL_PACKAGE_EXPORT_MAX_BYTES: u64 = 64 * 1024 * 1024;
const PLUGIN_LOCAL_PACKAGE_EXPORT_MAX_FILES: usize = 512;

pub(crate) fn export_plugin_local_package(
    params: PluginLocalPackageExportParams,
) -> Result<PluginLocalPackageExportResponse, String> {
    let app_dir = canonicalize_existing_plugin_dir_path(&params.app_dir)?;
    let plugin_projection = resolve_plugin_package_manifest(&app_dir)?;
    let manifest_bytes = canonical_manifest_bytes(&plugin_projection.plugin_manifest)?;
    let manifest_hash = sha256_prefixed(&manifest_bytes);
    let files = list_plugin_package_export_files(&app_dir)?;
    let package_bytes = build_plugin_package_zip(&app_dir, &files, &manifest_bytes)?;
    let size_bytes = package_bytes.len() as u64;
    if size_bytes > PLUGIN_LOCAL_PACKAGE_EXPORT_MAX_BYTES {
        return Err(format!(
            "Plugin package 超出上传上限: {} > {}",
            size_bytes, PLUGIN_LOCAL_PACKAGE_EXPORT_MAX_BYTES
        ));
    }
    let package_hash = sha256_prefixed(&package_bytes);
    let exported_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    Ok(PluginLocalPackageExportResponse {
        source_kind: "local_folder".to_string(),
        source_uri: app_dir.to_string_lossy().to_string(),
        app_dir: app_dir.to_string_lossy().to_string(),
        manifest_source: "plugin_json".to_string(),
        plugin_manifest: plugin_projection.plugin_manifest.clone(),
        manifest: plugin_projection.plugin_manifest,
        manifest_hash,
        package_hash,
        size_bytes,
        file_count: files.len() + 1,
        content_type: "application/zip".to_string(),
        package_base64: base64::engine::general_purpose::STANDARD.encode(&package_bytes),
        exported_at,
    })
}

fn canonicalize_existing_plugin_dir_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("无法解析 Plugin 目录 {}: {error}", path.display()))?;
    if !canonical.is_dir() {
        return Err(format!("Plugin 路径不是目录: {}", canonical.display()));
    }
    Ok(canonical)
}

fn canonical_manifest_bytes(value: &Value) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|error| format!("序列化 manifest 失败: {error}"))
}

fn list_plugin_package_export_files(app_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new();
    collect_plugin_package_export_files(app_dir, &mut result)?;
    result.sort();
    if result.len() + 1 > PLUGIN_LOCAL_PACKAGE_EXPORT_MAX_FILES {
        return Err(format!(
            "Plugin package 文件数量超出上限: {} > {}",
            result.len() + 1,
            PLUGIN_LOCAL_PACKAGE_EXPORT_MAX_FILES
        ));
    }
    Ok(result)
}

fn collect_plugin_package_export_files(
    path: &Path,
    result: &mut Vec<PathBuf>,
) -> Result<(), String> {
    let entries =
        fs::read_dir(path).map_err(|error| format!("读取 Plugin package 目录失败: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取 Plugin package 条目失败: {error}"))?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if matches!(
            file_name.as_ref(),
            ".git" | "node_modules" | ".local" | ".lime"
        ) {
            continue;
        }
        let file_type = entry
            .file_type()
            .map_err(|error| format!("读取 Plugin package 文件类型失败: {error}"))?;
        if file_type.is_symlink() {
            return Err(format!(
                "Plugin package 不允许包含 symlink: {}",
                entry_path.display()
            ));
        }
        if file_type.is_dir() {
            collect_plugin_package_export_files(&entry_path, result)?;
        } else if file_type.is_file() && file_name.as_ref() != "plugin.json" {
            result.push(entry_path);
        }
    }
    Ok(())
}

fn build_plugin_package_zip(
    app_dir: &Path,
    files: &[PathBuf],
    manifest_bytes: &[u8],
) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(Vec::new());
    let mut writer = ZipWriter::new(cursor);
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    writer
        .start_file("plugin.json", options)
        .map_err(|error| format!("写入 Plugin package manifest 失败: {error}"))?;
    writer
        .write_all(manifest_bytes)
        .map_err(|error| format!("写入 Plugin package manifest 失败: {error}"))?;

    for file in files {
        let relative = file.strip_prefix(app_dir).map_err(|error| {
            format!(
                "生成 Plugin package 相对路径失败 {}: {error}",
                file.display()
            )
        })?;
        let entry_name = plugin_zip_entry_name(relative)?;
        writer
            .start_file(entry_name.as_str(), options)
            .map_err(|error| format!("写入 Plugin package 文件 {entry_name} 失败: {error}"))?;
        let data = fs::read(file)
            .map_err(|error| format!("读取 Plugin package 文件失败 {}: {error}", file.display()))?;
        writer
            .write_all(&data)
            .map_err(|error| format!("写入 Plugin package 文件 {entry_name} 失败: {error}"))?;
    }

    let cursor = writer
        .finish()
        .map_err(|error| format!("完成 Plugin package zip 失败: {error}"))?;
    Ok(cursor.into_inner())
}

fn plugin_zip_entry_name(relative: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(value) => {
                let Some(text) = value.to_str() else {
                    return Err("Plugin package 文件路径必须是 UTF-8。".to_string());
                };
                if text.trim().is_empty() || text == "." || text == ".." {
                    return Err("Plugin package 文件路径不合法。".to_string());
                }
                parts.push(text.to_string());
            }
            _ => return Err("Plugin package 文件路径不能越界。".to_string()),
        }
    }
    if parts.is_empty() {
        return Err("Plugin package 文件路径不能为空。".to_string());
    }
    Ok(parts.join("/"))
}

fn sha256_prefixed(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use std::io::Read;
    use zip::ZipArchive;

    fn write_minimal_export_plugin(app_dir: &Path) {
        fs::write(
            app_dir.join("plugin.json"),
            r#"{
  "schemaVersion": "lime.plugin.package.v1",
  "id": "export-demo",
  "version": "1.0.0",
  "displayName": "Export Demo",
  "contributions": {}
}"#,
        )
        .expect("write plugin manifest");
        fs::write(app_dir.join("README.md"), "# Export Demo\n").expect("write readme");
        fs::create_dir_all(app_dir.join("node_modules/pkg")).expect("write ignored dir");
        fs::write(app_dir.join("node_modules/pkg/secret.txt"), "ignored")
            .expect("write ignored file");
    }

    #[test]
    fn export_local_plugin_package_writes_uploadable_zip() {
        let temp = tempfile::tempdir().expect("tempdir");
        write_minimal_export_plugin(temp.path());

        let exported = export_plugin_local_package(PluginLocalPackageExportParams {
            app_dir: temp.path().to_string_lossy().to_string(),
        })
        .expect("export plugin package");

        let bytes = base64::engine::general_purpose::STANDARD
            .decode(exported.package_base64.as_bytes())
            .expect("decode package");
        assert_eq!(exported.content_type, "application/zip");
        assert_eq!(exported.size_bytes, bytes.len() as u64);
        assert_eq!(exported.package_hash, sha256_prefixed(&bytes));

        let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("read zip");
        let mut manifest = String::new();
        archive
            .by_name("plugin.json")
            .expect("plugin manifest entry")
            .read_to_string(&mut manifest)
            .expect("read manifest");
        assert_eq!(exported.manifest_hash, sha256_prefixed(manifest.as_bytes()));
        assert!(archive.by_name("README.md").is_ok());
        assert!(archive.by_name("node_modules/pkg/secret.txt").is_err());
    }
}
