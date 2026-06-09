use app_server_protocol::LogArtifactEntry;
use app_server_protocol::LogEntry;
use app_server_protocol::LogStorageDiagnosticsResponse;
use app_server_protocol::SupportBundleExportResponse;
use app_server_protocol::WindowsStartupCheck;
use app_server_protocol::WindowsStartupDiagnosticsResponse;
use chrono::DateTime;
use chrono::NaiveDateTime;
use chrono::Utc;
use flate2::read::GzDecoder;
use lime_core::app_paths;
use lime_core::database;
use serde::Serialize;
use std::fs;
use std::io;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use zip::write::FileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

fn current_log_path() -> Result<PathBuf, String> {
    Ok(app_paths::resolve_logs_dir()?.join("lime.log"))
}

fn parse_persisted_log_line(line: &str) -> Option<LogEntry> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some((timestamp, rest)) = trimmed.split_once(" [") {
        if let Some((level, message)) = rest.split_once("] ") {
            return Some(LogEntry {
                timestamp: timestamp.trim().to_string(),
                level: level.trim().to_lowercase(),
                message: message.trim().to_string(),
            });
        }
    }

    Some(LogEntry {
        timestamp: Utc::now().to_rfc3339(),
        level: "info".to_string(),
        message: trimmed.to_string(),
    })
}

fn to_rfc3339(system_time: std::time::SystemTime) -> String {
    DateTime::<Utc>::from(system_time).to_rfc3339()
}

fn parse_rotated_log_timestamp(current_log_path: &Path, candidate: &Path) -> Option<i64> {
    let current_name = current_log_path.file_name()?.to_str()?;
    let candidate_name = candidate.file_name()?.to_str()?;

    if candidate_name == current_name {
        return Some(i64::MAX);
    }

    let prefix = format!("{current_name}.");
    let suffix = candidate_name.strip_prefix(&prefix)?;
    let suffix = suffix.strip_suffix(".gz").unwrap_or(suffix);
    let parsed = NaiveDateTime::parse_from_str(suffix, "%Y%m%d-%H%M%S").ok()?;
    parsed.and_utc().timestamp_nanos_opt()
}

fn path_sort_key(current_log_path: &Path, path: &Path) -> (i64, String) {
    let logical_ts = parse_rotated_log_timestamp(current_log_path, path).unwrap_or_else(|| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| DateTime::<Utc>::from(modified).timestamp_nanos_opt())
            .unwrap_or_else(|| {
                DateTime::<Utc>::from(UNIX_EPOCH)
                    .timestamp_nanos_opt()
                    .unwrap_or(0)
            })
    });

    (logical_ts, path.to_string_lossy().to_string())
}

fn collect_related_log_paths(current_log_path: &Path) -> Vec<PathBuf> {
    let Some(log_dir) = current_log_path.parent() else {
        return Vec::new();
    };
    let Some(file_name) = current_log_path.file_name().and_then(|name| name.to_str()) else {
        return Vec::new();
    };
    let prefix = format!("{file_name}.");
    let mut candidates = Vec::new();

    if current_log_path.exists() {
        candidates.push(current_log_path.to_path_buf());
    }

    let Ok(entries) = fs::read_dir(log_dir) else {
        return candidates;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if (name == file_name || name.starts_with(&prefix))
            && !candidates.iter().any(|candidate| candidate == &path)
        {
            candidates.push(path);
        }
    }

    candidates.sort_by_key(|path| path_sort_key(current_log_path, path));
    candidates
}

fn collect_raw_response_paths(current_log_path: &Path) -> Vec<PathBuf> {
    let Some(log_dir) = current_log_path.parent() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(log_dir) else {
        return Vec::new();
    };

    let mut candidates: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.starts_with("raw_response_") && name.ends_with(".txt"))
        })
        .collect();
    candidates.sort_by_key(|path| path_sort_key(current_log_path, path));
    candidates.reverse();
    candidates
}

fn read_log_file_content(path: &Path) -> Option<String> {
    if path.extension().and_then(|ext| ext.to_str()) == Some("gz") {
        let file = fs::File::open(path).ok()?;
        let mut decoder = GzDecoder::new(file);
        let mut content = String::new();
        decoder.read_to_string(&mut content).ok()?;
        return Some(content);
    }

    fs::read_to_string(path).ok()
}

fn read_persisted_logs_tail_from_path(current_log_path: &Path, lines: usize) -> Vec<LogEntry> {
    let safe_limit = lines.clamp(1, 1_000);
    let related_paths = collect_related_log_paths(current_log_path);
    if related_paths.is_empty() {
        return Vec::new();
    }

    let mut parsed = Vec::new();
    for log_path in related_paths.into_iter().rev() {
        let remaining = safe_limit.saturating_sub(parsed.len());
        if remaining == 0 {
            break;
        }

        let Some(content) = read_log_file_content(&log_path) else {
            continue;
        };

        parsed.extend(
            content
                .lines()
                .rev()
                .take(remaining)
                .filter_map(parse_persisted_log_line),
        );
    }

    parsed.reverse();
    parsed
}

pub(crate) fn read_persisted_logs_tail(lines: usize) -> Result<Vec<LogEntry>, String> {
    let current_path = current_log_path()?;
    Ok(read_persisted_logs_tail_from_path(&current_path, lines))
}

fn build_log_artifact_entry(path: &Path) -> Option<LogArtifactEntry> {
    let metadata = fs::metadata(path).ok()?;
    let modified_at = metadata.modified().ok().map(to_rfc3339);
    let file_name = path.file_name()?.to_string_lossy().to_string();

    Some(LogArtifactEntry {
        file_name,
        path: path.to_string_lossy().to_string(),
        size_bytes: metadata.len(),
        modified_at,
        compressed: path.extension().and_then(|ext| ext.to_str()) == Some("gz"),
    })
}

fn read_log_storage_diagnostics_from_path(
    current_log_path: &Path,
    in_memory_log_count: usize,
) -> LogStorageDiagnosticsResponse {
    let current_log_exists = current_log_path.exists();
    let current_log_size_bytes = fs::metadata(current_log_path)
        .ok()
        .map(|metadata| metadata.len());
    let log_directory = current_log_path
        .parent()
        .map(|path| path.to_string_lossy().to_string());
    let related_log_files = collect_related_log_paths(current_log_path)
        .into_iter()
        .rev()
        .take(12)
        .filter_map(|path| build_log_artifact_entry(&path))
        .collect();
    let raw_response_files = collect_raw_response_paths(current_log_path)
        .into_iter()
        .take(12)
        .filter_map(|path| build_log_artifact_entry(&path))
        .collect();

    LogStorageDiagnosticsResponse {
        log_directory,
        current_log_path: Some(current_log_path.to_string_lossy().to_string()),
        current_log_exists,
        current_log_size_bytes,
        in_memory_log_count,
        related_log_files,
        raw_response_files,
    }
}

pub(crate) fn read_log_storage_diagnostics() -> Result<LogStorageDiagnosticsResponse, String> {
    let current_path = current_log_path()?;
    Ok(read_log_storage_diagnostics_from_path(&current_path, 0))
}

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

fn legacy_data_dir_guess() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".lime"))
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

fn path_to_string(path: Option<PathBuf>) -> Option<String> {
    path.map(|path| path.to_string_lossy().to_string())
}

fn env_value(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|value| !value.is_empty())
}

fn ok_startup_check(key: &str, message: String) -> WindowsStartupCheck {
    WindowsStartupCheck {
        key: key.to_string(),
        status: "ok".to_string(),
        message,
        detail: None,
    }
}

fn warn_startup_check(key: &str, message: String, detail: Option<String>) -> WindowsStartupCheck {
    WindowsStartupCheck {
        key: key.to_string(),
        status: "warning".to_string(),
        message,
        detail,
    }
}

fn error_startup_check(key: &str, message: String, detail: Option<String>) -> WindowsStartupCheck {
    WindowsStartupCheck {
        key: key.to_string(),
        status: "error".to_string(),
        message,
        detail,
    }
}

fn ensure_dir_writable(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("创建目录失败 {}: {error}", path.display()))?;
    let probe_path = path.join(".app-server-startup-write-test");
    fs::write(&probe_path, b"ok")
        .map_err(|error| format!("写入探测文件失败 {}: {error}", probe_path.display()))?;
    fs::remove_file(&probe_path)
        .map_err(|error| format!("删除探测文件失败 {}: {error}", probe_path.display()))
}

pub(crate) fn read_windows_startup_diagnostics() -> Result<WindowsStartupDiagnosticsResponse, String>
{
    let app_data_dir = app_paths::preferred_data_dir().ok();
    let legacy_data_dir = legacy_data_dir_guess();
    let db_path = database::get_db_path().ok();
    let current_exe = std::env::current_exe().ok();
    let current_dir = std::env::current_dir().ok();
    let home_dir = dirs::home_dir();
    let shell_env = env_value("SHELL");
    let comspec_env = env_value("COMSPEC");
    let resolved_terminal_shell = shell_env.clone().or_else(|| comspec_env.clone());
    let mut checks = Vec::new();

    match app_data_dir.as_deref() {
        Some(path) => match ensure_dir_writable(path) {
            Ok(()) => checks.push(ok_startup_check(
                "app_data_dir",
                format!("应用数据目录可写: {}", path.display()),
            )),
            Err(error) => checks.push(warn_startup_check(
                "app_data_dir",
                format!("应用数据目录不可写: {}", path.display()),
                Some(error),
            )),
        },
        None => checks.push(warn_startup_check(
            "app_data_dir",
            "无法解析应用数据目录".to_string(),
            None,
        )),
    }

    match current_dir.as_deref() {
        Some(path) if path.exists() => checks.push(ok_startup_check(
            "current_dir",
            format!("当前工作目录存在: {}", path.display()),
        )),
        Some(path) => checks.push(warn_startup_check(
            "current_dir",
            format!("当前工作目录不存在: {}", path.display()),
            None,
        )),
        None => checks.push(warn_startup_check(
            "current_dir",
            "无法解析当前工作目录".to_string(),
            None,
        )),
    }

    if db_path.as_ref().is_some_and(|path| path.exists()) {
        checks.push(ok_startup_check("db_path", "数据库路径已存在".to_string()));
    } else if db_path.is_some() {
        checks.push(warn_startup_check(
            "db_path",
            "数据库路径尚未创建".to_string(),
            None,
        ));
    } else {
        checks.push(error_startup_check(
            "db_path",
            "无法解析数据库路径".to_string(),
            None,
        ));
    }

    let has_blocking_issues = checks.iter().any(|check| check.status == "error");
    let has_warnings = checks.iter().any(|check| check.status == "warning");
    let summary_message = if has_blocking_issues {
        Some("App Server 启动环境存在阻塞问题。".to_string())
    } else if has_warnings {
        Some("App Server 启动环境存在需要关注的警告。".to_string())
    } else {
        Some("App Server 启动环境自检通过。".to_string())
    };

    Ok(WindowsStartupDiagnosticsResponse {
        platform: std::env::consts::OS.to_string(),
        app_data_dir: path_to_string(app_data_dir),
        legacy_lime_dir: path_to_string(legacy_data_dir),
        db_path: path_to_string(db_path),
        webview2_version: None,
        current_exe: path_to_string(current_exe),
        current_dir: path_to_string(current_dir),
        resource_dir: None,
        home_dir: path_to_string(home_dir),
        shell_env,
        comspec_env,
        resolved_terminal_shell,
        installation_kind_guess: Some("app-server".to_string()),
        checks,
        has_blocking_issues,
        has_warnings,
        summary_message,
    })
}

fn truncate_current_log_file(current_log_path: &Path) -> Result<(), String> {
    if let Some(parent) = current_log_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "创建日志目录失败（{}）: {}",
                parent.to_string_lossy(),
                error
            )
        })?;
    }

    fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(current_log_path)
        .and_then(|mut file| file.write_all(b""))
        .map_err(|error| {
            format!(
                "清空当前日志文件失败（{}）: {}",
                current_log_path.to_string_lossy(),
                error
            )
        })
}

fn clear_diagnostic_log_artifacts_from_path(current_log_path: &Path) -> Result<(), String> {
    for path in collect_related_log_paths(current_log_path) {
        if path == current_log_path || !path.exists() {
            continue;
        }
        fs::remove_file(&path).map_err(|error| {
            format!(
                "删除历史日志文件失败（{}）: {}",
                path.to_string_lossy(),
                error
            )
        })?;
    }

    for path in collect_raw_response_paths(current_log_path) {
        if !path.exists() {
            continue;
        }
        fs::remove_file(&path).map_err(|error| {
            format!(
                "删除原始响应文件失败（{}）: {}",
                path.to_string_lossy(),
                error
            )
        })?;
    }

    Ok(())
}

pub(crate) fn clear_diagnostic_log_artifacts() -> Result<(), String> {
    let current_path = current_log_path()?;
    clear_diagnostic_log_artifacts_from_path(&current_path)
}

fn clear_persisted_log_artifacts_from_path(current_log_path: &Path) -> Result<(), String> {
    truncate_current_log_file(current_log_path)?;
    clear_diagnostic_log_artifacts_from_path(current_log_path)
}

pub(crate) fn clear_persisted_log_artifacts() -> Result<(), String> {
    let current_path = current_log_path()?;
    clear_persisted_log_artifacts_from_path(&current_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn log_helpers_read_tail_and_clear_persisted_artifacts() {
        let temp = TempDir::new().expect("temp dir");
        let log_path = temp.path().join("lime.log");
        let rotated_path = temp.path().join("lime.log.20260313-010000");
        let raw_response_path = temp.path().join("raw_response_request-1.txt");
        fs::write(
            &rotated_path,
            "2026-03-13 01:00:00.000 [INFO] rotated one\nfallback line\n",
        )
        .expect("write rotated log");
        fs::write(&log_path, "2026-03-13 01:01:00.000 [WARN] current two\n")
            .expect("write current log");
        fs::write(&raw_response_path, "raw").expect("write raw response");

        let entries = read_persisted_logs_tail_from_path(&log_path, 3);
        assert_eq!(
            entries
                .iter()
                .map(|entry| (entry.level.as_str(), entry.message.as_str()))
                .collect::<Vec<_>>(),
            vec![
                ("info", "rotated one"),
                ("info", "fallback line"),
                ("warn", "current two"),
            ]
        );

        clear_persisted_log_artifacts_from_path(&log_path).expect("clear persisted logs");

        assert_eq!(fs::read_to_string(&log_path).expect("read current log"), "");
        assert!(!rotated_path.exists());
        assert!(!raw_response_path.exists());
    }
}
