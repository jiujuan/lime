use app_server_protocol::AgentAppCloudReleaseDescriptor;
use app_server_protocol::AgentAppFetchCloudPackageParams;
use app_server_protocol::AgentAppLocalPackageInspectParams;
use app_server_protocol::AgentAppLocalPackageInspectResponse;
use app_server_protocol::AgentAppPackageCacheEntry;
use app_server_protocol::AgentAppPackageIdentity;
use chrono::Utc;
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

use super::plugin_manifest::resolve_plugin_package_manifest;
use crate::agent_app_packages::agent_app_data_dir;
use crate::agent_app_packages::read_json_string;
use crate::agent_app_packages::safe_hash_path_segment;
use crate::agent_app_packages::validate_agent_app_id_for_storage;

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub(crate) fn inspect_agent_app_local_package(
    params: AgentAppLocalPackageInspectParams,
) -> Result<AgentAppLocalPackageInspectResponse, String> {
    let app_dir_path = canonicalize_existing_agent_app_dir_path(&params.app_dir)?;
    let plugin_projection = resolve_plugin_package_manifest(&app_dir_path)?;
    let inspected_at = now_iso();
    let manifest_hash = sha256_json_value(&plugin_projection.agent_app_manifest)?;
    let package_hash = sha256_package(&app_dir_path, &plugin_projection.agent_app_manifest)?;

    Ok(AgentAppLocalPackageInspectResponse {
        source_kind: "local_folder".to_string(),
        source_uri: app_dir_path.to_string_lossy().to_string(),
        app_dir: app_dir_path.to_string_lossy().to_string(),
        manifest_source: "plugin_json".to_string(),
        plugin_manifest: plugin_projection.plugin_manifest,
        manifest: plugin_projection.agent_app_manifest,
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
    let plugin_projection = resolve_plugin_package_manifest(&extracted_root)?;
    let actual_manifest_hash = sha256_json_value(&plugin_projection.agent_app_manifest)?;
    if actual_manifest_hash != descriptor.manifest_hash {
        return Err(format!(
            "Agent App manifest hash mismatch for {}@{}: expected {}, got {}",
            descriptor.app_id, descriptor.version, descriptor.manifest_hash, actual_manifest_hash
        ));
    }
    let manifest = plugin_projection.agent_app_manifest;
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
    if staging_dir.join("plugin.json").is_file() {
        return Ok(staging_dir.to_path_buf());
    }
    let mut matches = Vec::new();
    collect_agent_app_roots(staging_dir, &mut matches)?;
    matches.sort();
    matches.dedup();
    match matches.len() {
        0 => Err("Agent App package 缺少 plugin.json。".to_string()),
        1 => Ok(matches.remove(0)),
        _ => Err("Agent App package 包含多个 plugin.json，无法确定 package root。".to_string()),
    }
}

fn collect_agent_app_roots(dir: &Path, matches: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(dir)
        .map_err(|error| format!("读取 Agent App package 目录失败 {}: {error}", dir.display()))?
    {
        let entry = entry.map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            if path.join("plugin.json").is_file() {
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

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentAppLocalPackageInspectParams;
    use std::fs;

    fn read_test_json_string(value: &Value, path: &[&str]) -> Option<String> {
        let mut current = value;
        for key in path {
            current = key
                .parse::<usize>()
                .ok()
                .and_then(|index| current.get(index))
                .or_else(|| current.get(*key))?;
        }
        current.as_str().map(str::to_string)
    }

    fn write_minimal_plugin_package(
        app_dir: &Path,
        contributions: &str,
    ) -> Result<(), std::io::Error> {
        fs::write(
            app_dir.join("plugin.json"),
            format!(
                r#"{{
  "schemaVersion": "lime.plugin.package.v1",
  "id": "content-factory-app",
  "version": "2.0.0",
  "displayName": "内容工厂",
  "contributions": {contributions}
}}"#
            ),
        )?;
        fs::write(
            app_dir.join("app.runtime.yaml"),
            r#"agentRuntime:
  worker:
    entrypoint: ./worker.mjs
    outputArtifactKind: content_factory.workspace_patch
  activationEntries:
    - key: content_article_generate
      title: 写文章
      aliases:
        - "@写文章"
      kind: plugin
      intent: at_command
      taskKind: content.article.generate
      workflow: content_article_workflow
      defaultObjectKind: articleDraft
      rightSurface: productProfile
  workflows:
    - key: content_article_workflow
      taskKind: content.article.generate
      triggerIntents:
        - content_article_generate
      outputArtifactKind: content_factory.workspace_patch
      steps:
        - id: draft
          subagent: article-writer
          skillRefs:
            - article-writing
          expectedOutput: articleDraft
  tasks:
    - kind: content.article.generate
"#,
        )?;
        fs::write(
            app_dir.join("worker.mjs"),
            "export default async function run() {}\n",
        )?;
        fs::write(
            app_dir.join("app.workbench.yaml"),
            r#"workbench:
  profile: production
  productWorkspace:
    scope: session
    primaryObjectKinds:
      - articleDraft
  productionObjects:
    - kind: articleDraft
      title: 文章草稿
      artifactKind: markdown_document
      primary: true
  objectSurfaces:
    - objectKind: articleDraft
      surfaceKind: documentCanvas
      renderer: host_builtin
  historyRestore:
    defaultSurface: selectedObject
    restoreSelection: true
    restoreLayout: true
    fallback: artifactPreview
"#,
        )?;
        Ok(())
    }

    #[test]
    fn inspect_local_package_accepts_plugin_json() {
        let temp = tempfile::tempdir().expect("tempdir");
        write_minimal_plugin_package(temp.path(), r#"{ "runtime": "./app.runtime.yaml" }"#)
            .expect("write plugin package");

        let inspected = inspect_agent_app_local_package(AgentAppLocalPackageInspectParams {
            app_dir: temp.path().to_string_lossy().to_string(),
        })
        .expect("inspect plugin package");

        assert_eq!(inspected.manifest_source, "plugin_json");
        assert_eq!(
            inspected
                .plugin_manifest
                .get("schemaVersion")
                .and_then(Value::as_str),
            Some("lime.plugin.package.v1")
        );
        assert_eq!(
            read_json_string(&inspected.manifest, &["name"]).as_deref(),
            Some("content-factory-app")
        );
        assert_eq!(
            read_json_string(
                &inspected.manifest,
                &["runtimePackage", "worker", "entrypoint"]
            )
            .as_deref(),
            Some("./worker.mjs")
        );
    }

    #[test]
    fn inspect_local_package_projects_runtime_and_workbench_contracts() {
        let temp = tempfile::tempdir().expect("tempdir");
        write_minimal_plugin_package(
            temp.path(),
            r#"{ "runtime": "./app.runtime.yaml", "workbench": "./app.workbench.yaml" }"#,
        )
        .expect("write plugin package");

        let inspected = inspect_agent_app_local_package(AgentAppLocalPackageInspectParams {
            app_dir: temp.path().to_string_lossy().to_string(),
        })
        .expect("inspect plugin package");

        assert_eq!(
            read_test_json_string(
                &inspected.manifest,
                &["agentRuntime", "activationEntries", "0", "key"]
            )
            .as_deref(),
            Some("content_article_generate")
        );
        assert_eq!(
            read_test_json_string(
                &inspected.manifest,
                &["agentRuntime", "activationEntries", "0", "aliases", "0"]
            )
            .as_deref(),
            Some("@写文章")
        );
        assert_eq!(
            read_test_json_string(&inspected.manifest, &["entries", "0", "workflow"]).as_deref(),
            Some("content_article_workflow")
        );
        assert_eq!(
            read_test_json_string(
                &inspected.manifest,
                &["workbench", "productWorkspace", "primaryObjectKinds", "0"]
            )
            .as_deref(),
            Some("articleDraft")
        );
        assert_eq!(
            read_json_string(
                &inspected.manifest,
                &["workbench", "historyRestore", "defaultSurface"]
            )
            .as_deref(),
            Some("selectedObject")
        );
    }

    #[test]
    fn inspect_local_package_rejects_app_markdown_only_package() {
        let temp = tempfile::tempdir().expect("tempdir");
        fs::write(
            temp.path().join("APP.md"),
            "---\nname: legacy-app\nversion: 1.0.0\n---\n",
        )
        .expect("write legacy manifest");

        let error = inspect_agent_app_local_package(AgentAppLocalPackageInspectParams {
            app_dir: temp.path().to_string_lossy().to_string(),
        })
        .expect_err("APP.md must not be accepted");

        assert!(error.contains("缺少 plugin.json"), "{error}");
    }

    #[test]
    fn inspect_local_package_rejects_contribution_path_escape() {
        let temp = tempfile::tempdir().expect("tempdir");
        write_minimal_plugin_package(temp.path(), r#"{ "runtime": "../app.runtime.yaml" }"#)
            .expect("write plugin package");

        let error = inspect_agent_app_local_package(AgentAppLocalPackageInspectParams {
            app_dir: temp.path().to_string_lossy().to_string(),
        })
        .expect_err("escaped contribution path must be rejected");

        assert!(error.contains("不能越过包根目录"), "{error}");
    }
}
