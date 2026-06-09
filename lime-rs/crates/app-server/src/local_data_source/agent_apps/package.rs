use app_server_protocol::AgentAppCloudReleaseDescriptor;
use app_server_protocol::AgentAppFetchCloudPackageParams;
use app_server_protocol::AgentAppLocalPackageInspectParams;
use app_server_protocol::AgentAppLocalPackageInspectResponse;
use app_server_protocol::AgentAppPackageCacheEntry;
use app_server_protocol::AgentAppPackageIdentity;
use serde_json::Map;
use serde_json::Value;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::io;
use std::io::Cursor;
use std::path::Path;
use std::path::PathBuf;
use url::Url;
use zip::ZipArchive;

use super::agent_app_data_dir;
use super::now_iso;
use super::read_json_string;
use super::safe_hash_path_segment;
use super::validate_agent_app_id_for_storage;

const AGENT_APP_ARRAY_LAYER_FILES: &[(&str, &str)] = &[
    ("app.entries.yaml", "entries"),
    ("app.permissions.yaml", "permissions"),
];
const AGENT_APP_VALUE_LAYER_FILES: &[(&str, &str, &str)] = &[
    ("app.capabilities.yaml", "capabilities", "capabilityConfig"),
    ("app.errors.yaml", "errors", "errors"),
    ("app.i18n.yaml", "i18n", "i18n"),
    ("app.signature.yaml", "signature", "signature"),
    ("app.runtime.yaml", "agentRuntime", "agentRuntime"),
    ("app.install.yaml", "install", "install"),
    ("evals/readiness.yaml", "readiness", "readiness"),
    ("evals/health.yaml", "health", "health"),
];

pub(crate) fn inspect_agent_app_local_package(
    params: AgentAppLocalPackageInspectParams,
) -> Result<AgentAppLocalPackageInspectResponse, String> {
    let app_dir_path = canonicalize_existing_agent_app_dir_path(&params.app_dir)?;
    let app_markdown_path = app_dir_path.join("APP.md");
    let app_markdown = fs::read_to_string(&app_markdown_path)
        .map_err(|error| format!("读取 Agent App APP.md 失败: {error}"))?;
    let manifest = resolve_agent_app_manifest(&app_dir_path, &app_markdown)?;
    let inspected_at = now_iso();
    let manifest_hash = sha256_json_value(&manifest)?;
    let package_hash = sha256_package(&app_dir_path, &manifest)?;

    Ok(AgentAppLocalPackageInspectResponse {
        source_kind: "local_folder".to_string(),
        source_uri: app_dir_path.to_string_lossy().to_string(),
        app_dir: app_dir_path.to_string_lossy().to_string(),
        app_markdown,
        manifest,
        manifest_hash,
        package_hash,
        inspected_at,
    })
}

pub(crate) async fn fetch_agent_app_cloud_package(
    params: AgentAppFetchCloudPackageParams,
) -> Result<AgentAppPackageCacheEntry, String> {
    let descriptor = params.descriptor;
    validate_cloud_release_descriptor(&descriptor)?;
    let bytes = download_agent_app_package(&descriptor.package_url).await?;
    let actual_package_hash = sha256_prefixed(&bytes);
    if actual_package_hash != descriptor.package_hash {
        return Err(format!(
            "Agent App package hash mismatch for {}@{}: expected {}, got {}",
            descriptor.app_id, descriptor.version, descriptor.package_hash, actual_package_hash
        ));
    }

    let data_root = agent_app_data_dir()?;
    let cache_dir = agent_app_package_cache_dir(&descriptor.package_hash)?;
    let staging_dir = data_root.join("staging").join(format!(
        "{}-{}",
        descriptor.app_id,
        safe_hash_path_segment(&descriptor.package_hash)
    ));
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|error| {
            format!(
                "清理 Agent App package staging 目录失败 {}: {error}",
                staging_dir.display()
            )
        })?;
    }
    fs::create_dir_all(&staging_dir)
        .map_err(|error| format!("创建 Agent App package staging 目录失败: {error}"))?;
    let staging_cleanup_dir = staging_dir.clone();
    scopeguard::defer! {
        if staging_cleanup_dir.exists() {
            let _ = fs::remove_dir_all(&staging_cleanup_dir);
        }
    }

    extract_agent_app_package_archive(&bytes, &staging_dir)?;
    let extracted_root = find_agent_app_package_root(&staging_dir)?;
    let app_markdown_path = extracted_root.join("APP.md");
    let app_markdown_bytes = fs::read(&app_markdown_path).map_err(|error| {
        format!(
            "读取 Agent App package APP.md 失败 {}: {error}",
            app_markdown_path.display()
        )
    })?;
    let actual_manifest_hash = sha256_prefixed(&app_markdown_bytes);
    if actual_manifest_hash != descriptor.manifest_hash {
        return Err(format!(
            "Agent App manifest hash mismatch for {}@{}: expected {}, got {}",
            descriptor.app_id, descriptor.version, descriptor.manifest_hash, actual_manifest_hash
        ));
    }
    let app_markdown = String::from_utf8(app_markdown_bytes)
        .map_err(|error| format!("Agent App APP.md 必须是 UTF-8: {error}"))?;
    let manifest = resolve_agent_app_manifest(&extracted_root, &app_markdown)?;
    ensure_manifest_matches_cloud_release(&manifest, &descriptor)?;

    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|error| {
            format!(
                "清理旧 Agent App package cache 目录失败 {}: {error}",
                cache_dir.display()
            )
        })?;
    }
    if let Some(parent) = cache_dir.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "创建 Agent App package cache 目录失败 {}: {error}",
                parent.display()
            )
        })?;
    }
    fs::rename(&extracted_root, &cache_dir).map_err(|error| {
        format!(
            "写入 Agent App package cache 失败 {} -> {}: {error}",
            extracted_root.display(),
            cache_dir.display()
        )
    })?;

    let cached_at = now_iso();
    Ok(AgentAppPackageCacheEntry {
        app_id: descriptor.app_id.clone(),
        identity: AgentAppPackageIdentity {
            source_kind: "cloud_release".to_string(),
            source_uri: descriptor.source_uri.clone(),
            app_id: descriptor.app_id.clone(),
            app_version: descriptor.version.clone(),
            package_hash: descriptor.package_hash.clone(),
            manifest_hash: descriptor.manifest_hash.clone(),
            loaded_at: descriptor.loaded_at.clone(),
            release_id: descriptor.release_id.clone(),
            tenant_id: descriptor.tenant_id.clone(),
            tenant_enablement_ref: descriptor.tenant_enablement_ref.clone(),
            channel: descriptor.channel.clone(),
            signature_ref: descriptor.signature_ref.clone(),
        },
        manifest_snapshot: manifest,
        package_hash: descriptor.package_hash,
        manifest_hash: descriptor.manifest_hash,
        cache_path: cache_dir.to_string_lossy().to_string(),
        cached_at,
    })
}

fn canonicalize_existing_agent_app_dir_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("无法解析 Agent App 目录 {}: {error}", path.display()))?;
    if !canonical.is_dir() {
        return Err(format!("Agent App 路径不是目录: {}", canonical.display()));
    }
    Ok(canonical)
}

fn parse_app_markdown_frontmatter(markdown: &str) -> Result<Value, String> {
    let normalized = markdown.strip_prefix('\u{feff}').unwrap_or(markdown);
    let Some(rest) = normalized.strip_prefix("---") else {
        return Err("Agent App APP.md 缺少 YAML frontmatter。".to_string());
    };
    let rest = rest
        .strip_prefix('\n')
        .or_else(|| rest.strip_prefix("\r\n"))
        .unwrap_or(rest);
    let Some(end_index) = rest.find("\n---") else {
        return Err("Agent App APP.md frontmatter 未正确结束。".to_string());
    };
    let frontmatter = &rest[..end_index];
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(frontmatter)
        .map_err(|error| format!("解析 Agent App frontmatter 失败: {error}"))?;
    serde_json::to_value(yaml_value)
        .map_err(|error| format!("转换 Agent App manifest 失败: {error}"))
}

fn resolve_agent_app_manifest(app_dir: &Path, markdown: &str) -> Result<Value, String> {
    let mut manifest = parse_app_markdown_frontmatter(markdown)?;
    apply_layered_manifest_files(app_dir, &mut manifest)?;
    Ok(manifest)
}

fn apply_layered_manifest_files(app_dir: &Path, manifest: &mut Value) -> Result<(), String> {
    for (relative_path, field) in AGENT_APP_ARRAY_LAYER_FILES {
        apply_named_array_layer(app_dir, manifest, relative_path, field)?;
    }
    for (relative_path, source_field, target_field) in AGENT_APP_VALUE_LAYER_FILES {
        apply_value_layer(app_dir, manifest, relative_path, source_field, target_field)?;
    }
    Ok(())
}

fn read_layered_yaml(app_dir: &Path, relative_path: &str) -> Result<Option<Value>, String> {
    let path = app_dir.join(relative_path);
    if !path.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|error| {
        format!(
            "读取 Agent App 分层 manifest 文件失败 {}: {error}",
            path.display()
        )
    })?;
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|error| {
        format!(
            "解析 Agent App 分层 manifest 文件失败 {}: {error}",
            path.display()
        )
    })?;
    serde_json::to_value(yaml_value)
        .map(Some)
        .map_err(|error| format!("转换 Agent App 分层 manifest 文件失败: {error}"))
}

fn apply_value_layer(
    app_dir: &Path,
    manifest: &mut Value,
    relative_path: &str,
    source_field: &str,
    target_field: &str,
) -> Result<(), String> {
    let Some(layer) = read_layered_yaml(app_dir, relative_path)? else {
        return Ok(());
    };
    let Some(value) = layer.get(source_field).cloned() else {
        return Ok(());
    };
    manifest_object_mut(manifest)?.insert(target_field.to_string(), value);
    Ok(())
}

fn apply_named_array_layer(
    app_dir: &Path,
    manifest: &mut Value,
    relative_path: &str,
    field: &str,
) -> Result<(), String> {
    let Some(layer) = read_layered_yaml(app_dir, relative_path)? else {
        return Ok(());
    };
    let Some(layer_items) = layer.get(field).and_then(Value::as_array) else {
        return Ok(());
    };
    let mut merged = manifest
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for layer_item in layer_items {
        let Some(layer_key) = layered_item_key(layer_item) else {
            merged.push(layer_item.clone());
            continue;
        };
        if let Some(existing) = merged
            .iter_mut()
            .find(|item| layered_item_key(item).as_deref() == Some(layer_key.as_str()))
        {
            merge_json_object(existing, layer_item.clone())?;
        } else {
            merged.push(layer_item.clone());
        }
    }

    manifest_object_mut(manifest)?.insert(field.to_string(), Value::Array(merged));
    Ok(())
}

fn layered_item_key(value: &Value) -> Option<String> {
    value
        .get("key")
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn merge_json_object(target: &mut Value, overlay: Value) -> Result<(), String> {
    match (target.as_object_mut(), overlay) {
        (Some(target_object), Value::Object(overlay_object)) => {
            for (key, value) in overlay_object {
                target_object.insert(key, value);
            }
        }
        (_, value) => {
            *target = value;
        }
    }
    Ok(())
}

fn manifest_object_mut(manifest: &mut Value) -> Result<&mut Map<String, Value>, String> {
    manifest
        .as_object_mut()
        .ok_or_else(|| "Agent App manifest 必须是对象。".to_string())
}

fn validate_cloud_release_descriptor(
    descriptor: &AgentAppCloudReleaseDescriptor,
) -> Result<(), String> {
    validate_agent_app_id_for_storage(&descriptor.app_id)?;
    let url = Url::parse(&descriptor.package_url)
        .map_err(|error| format!("Agent App packageUrl 非法: {error}"))?;
    if url.scheme() != "https" {
        return Err("Agent App packageUrl 必须使用 https。".to_string());
    }
    if descriptor.source_uri != descriptor.package_url {
        return Err("Agent App release descriptor sourceUri 必须等于 packageUrl。".to_string());
    }
    validate_sha256_hash("packageHash", &descriptor.package_hash)?;
    validate_sha256_hash("manifestHash", &descriptor.manifest_hash)?;
    Ok(())
}

fn validate_sha256_hash(field: &str, value: &str) -> Result<(), String> {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return Err(format!("Agent App {field} 必须使用 sha256:<64 hex> 格式。"));
    };
    if hex.len() == 64 && hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Ok(());
    }
    Err(format!("Agent App {field} 必须使用 sha256:<64 hex> 格式。"))
}

async fn download_agent_app_package(package_url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::get(package_url)
        .await
        .map_err(|error| format!("下载 Agent App package 失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 Agent App package 失败，HTTP 状态: {}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取 Agent App package 响应失败: {error}"))?;
    Ok(bytes.to_vec())
}

fn extract_agent_app_package_archive(bytes: &[u8], staging_dir: &Path) -> Result<(), String> {
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|error| format!("Agent App package 必须是 zip/lapp 格式: {error}"))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let enclosed = file
            .enclosed_name()
            .map(PathBuf::from)
            .ok_or_else(|| format!("Agent App package 包含不安全路径: {}", file.name()))?;
        let out_path = staging_dir.join(enclosed);
        if file.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|error| {
                format!(
                    "创建 Agent App package 目录失败 {}: {error}",
                    out_path.display()
                )
            })?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "创建 Agent App package 父目录失败 {}: {error}",
                    out_path.display()
                )
            })?;
        }
        let mut output = fs::File::create(&out_path).map_err(|error| {
            format!(
                "写入 Agent App package 文件失败 {}: {error}",
                out_path.display()
            )
        })?;
        io::copy(&mut file, &mut output).map_err(|error| {
            format!(
                "解压 Agent App package 文件失败 {}: {error}",
                out_path.display()
            )
        })?;
    }
    Ok(())
}

fn find_agent_app_package_root(staging_dir: &Path) -> Result<PathBuf, String> {
    if staging_dir.join("APP.md").is_file() {
        return Ok(staging_dir.to_path_buf());
    }
    let mut matches = Vec::new();
    collect_agent_app_roots(staging_dir, &mut matches)?;
    matches.sort();
    matches.dedup();
    match matches.len() {
        0 => Err("Agent App package 缺少 APP.md。".to_string()),
        1 => Ok(matches.remove(0)),
        _ => Err("Agent App package 包含多个 APP.md，无法确定 package root。".to_string()),
    }
}

fn collect_agent_app_roots(dir: &Path, matches: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(dir)
        .map_err(|error| format!("读取 Agent App package 目录失败 {}: {error}", dir.display()))?
    {
        let entry = entry.map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            if path.join("APP.md").is_file() {
                matches.push(path.clone());
            }
            collect_agent_app_roots(&path, matches)?;
        }
    }
    Ok(())
}

fn ensure_manifest_matches_cloud_release(
    manifest: &Value,
    descriptor: &AgentAppCloudReleaseDescriptor,
) -> Result<(), String> {
    let manifest_app_id =
        read_json_string(manifest, &["name"]).or_else(|| read_json_string(manifest, &["appId"]));
    if manifest_app_id.as_deref() != Some(descriptor.app_id.as_str()) {
        return Err(format!(
            "Agent App package manifest appId 与 release descriptor 不一致: expected {}",
            descriptor.app_id
        ));
    }
    let manifest_version = read_json_string(manifest, &["version"]);
    if manifest_version.as_deref() != Some(descriptor.version.as_str()) {
        return Err(format!(
            "Agent App package manifest version 与 release descriptor 不一致: expected {}",
            descriptor.version
        ));
    }
    Ok(())
}

fn sha256_json_value(value: &Value) -> Result<String, String> {
    let bytes =
        serde_json::to_vec(value).map_err(|error| format!("序列化 manifest 失败: {error}"))?;
    Ok(format!("sha256:{}", sha256_hex(&bytes)))
}

fn sha256_package(app_dir: &Path, manifest: &Value) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(
        serde_json::to_vec(manifest).map_err(|error| format!("序列化 manifest 失败: {error}"))?,
    );
    for file in list_agent_app_package_files(app_dir)? {
        let relative = file.strip_prefix(app_dir).map_err(|error| {
            format!(
                "计算 Agent App package hash 时无法生成相对路径 {}: {error}",
                file.display()
            )
        })?;
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update([0]);
        hasher.update(fs::read(&file).map_err(|error| {
            format!(
                "读取 Agent App package 文件失败 {}: {error}",
                file.display()
            )
        })?);
        hasher.update([0]);
    }
    Ok(format!("sha256:{}", hex::encode(hasher.finalize())))
}

fn list_agent_app_package_files(app_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new();
    collect_agent_app_package_files(app_dir, &mut result)?;
    result.sort();
    Ok(result)
}

fn collect_agent_app_package_files(path: &Path, result: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries =
        fs::read_dir(path).map_err(|error| format!("读取 Agent App package 目录失败: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if matches!(
            file_name.as_ref(),
            ".git" | "node_modules" | ".local" | ".lime"
        ) {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|error| format!("读取 Agent App package 元数据失败: {error}"))?;
        if metadata.is_dir() {
            collect_agent_app_package_files(&entry_path, result)?;
        } else if metadata.is_file() {
            result.push(entry_path);
        }
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn sha256_prefixed(bytes: &[u8]) -> String {
    format!("sha256:{}", sha256_hex(bytes))
}

fn agent_app_package_cache_dir(package_hash: &str) -> Result<PathBuf, String> {
    validate_sha256_hash("packageHash", package_hash)?;
    Ok(agent_app_data_dir()?
        .join("packages")
        .join(safe_hash_path_segment(package_hash)))
}
