use super::current_log_path;
use super::legacy_data_dir_guess;
use super::read_log_storage_diagnostics_from_path;
use super::read_persisted_logs_tail_from_path;
use super::to_rfc3339;
use app_server_protocol::LogStorageDiagnosticsResponse;
use app_server_protocol::SupportBundleExportResponse;
use chrono::Utc;
use lime_core::app_paths;
use lime_core::database;
use serde::Serialize;
use std::fs;
use std::io;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use zip::write::FileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

#[derive(Debug, Clone, Serialize)]
struct SupportBundlePathMetadata {
    path: String,
    exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_write_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
struct SupportBundleTreeEntry {
    relative_path: String,
    is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct SupportBundleManifest {
    generated_at: String,
    app_version: String,
    platform: String,
    arch: String,
    username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    app_data_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    config_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    legacy_data_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    database_path: Option<String>,
    path_checks: Vec<SupportBundlePathMetadata>,
    log_storage_diagnostics: LogStorageDiagnosticsResponse,
    persisted_log_tail_lines: usize,
    included_sections: Vec<String>,
    omitted_sections: Vec<String>,
}

fn default_support_bundle_output_dir() -> PathBuf {
    dirs::download_dir()
        .or_else(dirs::desktop_dir)
        .unwrap_or_else(std::env::temp_dir)
}

fn support_bundle_username() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown".to_string())
}

fn config_path_guess() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("lime").join("config.yaml"))
}

fn collect_support_path_metadata(path: Option<&Path>) -> SupportBundlePathMetadata {
    let Some(path) = path else {
        return SupportBundlePathMetadata {
            path: String::new(),
            exists: false,
            kind: None,
            last_write_time: None,
            size_bytes: None,
        };
    };

    let path_string = path.to_string_lossy().to_string();
    let Ok(metadata) = fs::metadata(path) else {
        return SupportBundlePathMetadata {
            path: path_string,
            exists: false,
            kind: None,
            last_write_time: None,
            size_bytes: None,
        };
    };

    let kind = if metadata.is_dir() {
        Some("directory".to_string())
    } else if metadata.is_file() {
        Some("file".to_string())
    } else {
        Some("other".to_string())
    };

    SupportBundlePathMetadata {
        path: path_string,
        exists: true,
        kind,
        last_write_time: metadata.modified().ok().map(to_rfc3339),
        size_bytes: if metadata.is_dir() {
            None
        } else {
            Some(metadata.len())
        },
    }
}

fn should_exclude_support_listing(relative_path: &Path) -> bool {
    relative_path
        .components()
        .next()
        .and_then(|component| component.as_os_str().to_str())
        .is_some_and(|name| matches!(name, "credentials" | "auth"))
}

fn collect_directory_tree_entries(root: &Path) -> Vec<SupportBundleTreeEntry> {
    fn walk(base: &Path, current: &Path, entries: &mut Vec<SupportBundleTreeEntry>) {
        let Ok(children) = fs::read_dir(current) else {
            return;
        };

        for child in children.flatten() {
            let path = child.path();
            let Ok(relative_path) = path.strip_prefix(base) else {
                continue;
            };
            if should_exclude_support_listing(relative_path) {
                continue;
            }
            let Ok(metadata) = child.metadata() else {
                continue;
            };
            let is_directory = metadata.is_dir();
            entries.push(SupportBundleTreeEntry {
                relative_path: relative_path.to_string_lossy().to_string(),
                is_directory,
                size_bytes: if is_directory {
                    None
                } else {
                    Some(metadata.len())
                },
                modified_at: metadata.modified().ok().map(to_rfc3339),
            });

            if is_directory {
                walk(base, &path, entries);
            }
        }
    }

    if !root.exists() {
        return Vec::new();
    }

    let mut entries = Vec::new();
    walk(root, root, &mut entries);
    entries
}

fn write_support_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let content = serde_json::to_vec_pretty(value)
        .map_err(|error| format!("序列化支持包 JSON 失败 {}: {error}", path.display()))?;
    fs::write(path, content)
        .map_err(|error| format!("写入支持包 JSON 失败 {}: {error}", path.display()))
}

fn normalize_archive_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn add_directory_to_zip<W: Write + io::Seek>(
    writer: &mut ZipWriter<W>,
    root: &Path,
    current: &Path,
) -> Result<(), String> {
    let file_options = FileOptions::default().compression_method(CompressionMethod::Deflated);
    let dir_options = FileOptions::default().compression_method(CompressionMethod::Stored);

    for entry in fs::read_dir(current)
        .map_err(|error| format!("读取支持包目录失败 {}: {error}", current.display()))?
    {
        let entry = entry
            .map_err(|error| format!("读取支持包目录项失败 {}: {error}", current.display()))?;
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|error| format!("计算支持包相对路径失败 {}: {error}", path.display()))?;
        let archive_path = normalize_archive_path(relative);

        if entry
            .file_type()
            .map_err(|error| format!("读取支持包文件类型失败 {}: {error}", path.display()))?
            .is_dir()
        {
            writer
                .add_directory(format!("{archive_path}/"), dir_options)
                .map_err(|error| format!("写入 zip 目录失败 {archive_path}: {error}"))?;
            add_directory_to_zip(writer, root, &path)?;
            continue;
        }

        writer
            .start_file(archive_path.clone(), file_options)
            .map_err(|error| format!("写入 zip 文件失败 {archive_path}: {error}"))?;
        let mut file = fs::File::open(&path)
            .map_err(|error| format!("打开支持包文件失败 {}: {error}", path.display()))?;
        io::copy(&mut file, writer)
            .map_err(|error| format!("压缩支持包文件失败 {}: {error}", path.display()))?;
    }

    Ok(())
}

fn create_zip_from_directory(source_dir: &Path, zip_path: &Path) -> Result<(), String> {
    let file = fs::File::create(zip_path)
        .map_err(|error| format!("创建支持包 zip 失败 {}: {error}", zip_path.display()))?;
    let mut writer = ZipWriter::new(file);
    add_directory_to_zip(&mut writer, source_dir, source_dir)?;
    writer
        .finish()
        .map_err(|error| format!("完成支持包压缩失败 {}: {error}", zip_path.display()))?;
    Ok(())
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    fs::create_dir_all(destination)
        .map_err(|error| format!("创建支持包目录失败 {}: {error}", destination.display()))?;

    for entry in fs::read_dir(source)
        .map_err(|error| format!("读取目录失败 {}: {error}", source.display()))?
    {
        let entry =
            entry.map_err(|error| format!("读取目录项失败 {}: {error}", source.display()))?;
        let path = entry.path();
        let target = destination.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| format!("读取文件类型失败 {}: {error}", path.display()))?
            .is_dir()
        {
            copy_directory_recursive(&path, &target)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("创建支持包父目录失败 {}: {error}", parent.display()))?;
        }
        fs::copy(&path, &target).map_err(|error| {
            format!(
                "复制支持包文件失败 {} -> {}: {error}",
                path.display(),
                target.display()
            )
        })?;
    }

    Ok(())
}

fn write_support_bundle_readme(path: &Path, omitted_sections: &[String]) -> Result<(), String> {
    let omitted = omitted_sections
        .iter()
        .map(|section| format!("- {section}"))
        .collect::<Vec<_>>()
        .join("\n");
    let content = format!(
        "Lime 支持包\n\n已包含：\n- meta/manifest.json\n- meta/log-storage-diagnostics.json\n- meta/persisted-log-tail.json\n- meta/appdata-listing.json（如目录存在）\n- logs/（如目录存在）\n\n默认未包含：\n{omitted}\n"
    );

    fs::write(path, content)
        .map_err(|error| format!("写入支持包 README 失败 {}: {error}", path.display()))
}

fn export_support_bundle_to(
    output_directory: &Path,
) -> Result<SupportBundleExportResponse, String> {
    fs::create_dir_all(output_directory).map_err(|error| {
        format!(
            "创建支持包输出目录失败 {}: {error}",
            output_directory.display()
        )
    })?;

    let generated_at = Utc::now().to_rfc3339();
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let bundle_name = format!("Lime-Support-{timestamp}");
    let temp_dir = tempfile::tempdir().map_err(|error| format!("创建临时目录失败: {error}"))?;
    let bundle_dir = temp_dir.path().join(&bundle_name);
    let meta_dir = bundle_dir.join("meta");
    let logs_dir = bundle_dir.join("logs");
    fs::create_dir_all(&meta_dir)
        .map_err(|error| format!("创建支持包元数据目录失败 {}: {error}", meta_dir.display()))?;

    let current_log_path = current_log_path()?;
    let log_storage_diagnostics = read_log_storage_diagnostics_from_path(&current_log_path, 0);
    let persisted_log_tail = read_persisted_logs_tail_from_path(&current_log_path, 200);
    let app_data_dir = app_paths::preferred_data_dir().ok();
    let config_path = config_path_guess();
    let legacy_data_dir = legacy_data_dir_guess();
    let database_path = database::get_db_path()
        .ok()
        .or_else(|| legacy_data_dir.as_ref().map(|dir| dir.join("lime.db")));
    let effective_logs_dir = current_log_path.parent().map(Path::to_path_buf);

    if let Some(log_dir) = effective_logs_dir.as_deref() {
        copy_directory_recursive(log_dir, &logs_dir)?;
    }

    let included_sections = vec![
        "meta/manifest.json".to_string(),
        "meta/log-storage-diagnostics.json".to_string(),
        "meta/persisted-log-tail.json".to_string(),
        "logs/".to_string(),
    ];
    let omitted_sections = vec![
        "config 内容".to_string(),
        "数据库内容".to_string(),
        "credentials 目录正文".to_string(),
        "auth 目录正文".to_string(),
        "Windows 启动诊断（Desktop Host current 待迁移）".to_string(),
    ];

    let manifest = SupportBundleManifest {
        generated_at: generated_at.clone(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        username: support_bundle_username(),
        app_data_dir: app_data_dir
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        config_path: config_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        legacy_data_dir: legacy_data_dir
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        database_path: database_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        path_checks: vec![
            collect_support_path_metadata(app_data_dir.as_deref()),
            collect_support_path_metadata(config_path.as_deref()),
            collect_support_path_metadata(legacy_data_dir.as_deref()),
            collect_support_path_metadata(database_path.as_deref()),
            collect_support_path_metadata(effective_logs_dir.as_deref()),
        ],
        log_storage_diagnostics: log_storage_diagnostics.clone(),
        persisted_log_tail_lines: persisted_log_tail.len(),
        included_sections: included_sections.clone(),
        omitted_sections: omitted_sections.clone(),
    };

    write_support_json(&meta_dir.join("manifest.json"), &manifest)?;
    write_support_json(
        &meta_dir.join("log-storage-diagnostics.json"),
        &log_storage_diagnostics,
    )?;
    write_support_json(
        &meta_dir.join("persisted-log-tail.json"),
        &persisted_log_tail,
    )?;
    if let Some(app_data_dir) = app_data_dir.as_deref() {
        write_support_json(
            &meta_dir.join("appdata-listing.json"),
            &collect_directory_tree_entries(app_data_dir),
        )?;
    }
    write_support_bundle_readme(&bundle_dir.join("README.txt"), &omitted_sections)?;

    let bundle_path = output_directory.join(format!("{bundle_name}.zip"));
    create_zip_from_directory(&bundle_dir, &bundle_path)?;

    Ok(SupportBundleExportResponse {
        bundle_path: bundle_path.to_string_lossy().to_string(),
        output_directory: output_directory.to_string_lossy().to_string(),
        generated_at,
        platform: std::env::consts::OS.to_string(),
        included_sections,
        omitted_sections,
    })
}

pub(crate) fn export_support_bundle() -> Result<SupportBundleExportResponse, String> {
    export_support_bundle_to(&default_support_bundle_output_dir())
}
