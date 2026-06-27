use super::json_string;
use super::RuntimeCoreError;
use app_server_protocol::AgentAppTaskRuntimeContract;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

const AGENT_APP_DATA_DIR: &str = "agent-apps";
const CONTENT_FACTORY_APP_ID: &str = "content-factory-app";
const CONTENT_FACTORY_APP_DIR_ENV: &str = "CONTENT_FACTORY_APP_DIR";
const RETIRED_AGENT_APP_RUNTIME_FIXTURE_DIR: &str = "agent-apps-runtime-fixtures";

pub(super) fn build_agent_app_task_runtime_contract(
    state: &Value,
    app_dir: Option<&Path>,
) -> AgentAppTaskRuntimeContract {
    let manifest = state.get("manifest").unwrap_or(&Value::Null);
    let runtime_package_worker = manifest
        .pointer("/runtimePackage/worker")
        .unwrap_or(&Value::Null);
    let agent_runtime = manifest.get("agentRuntime").unwrap_or(&Value::Null);
    let agent_runtime_worker = agent_runtime.get("worker").unwrap_or(&Value::Null);
    let worker_entrypoint = json_string(runtime_package_worker, &["entrypoint"])
        .or_else(|| json_string(runtime_package_worker, &["path"]))
        .or_else(|| json_string(agent_runtime_worker, &["entrypoint"]));
    let contract_path = json_string(runtime_package_worker, &["contract"])
        .or_else(|| json_string(agent_runtime_worker, &["contract"]));
    let sample_request_path = json_string(runtime_package_worker, &["sampleRequest"])
        .or_else(|| json_string(agent_runtime_worker, &["sampleRequest"]));
    let output_artifact_kind = json_string(runtime_package_worker, &["outputArtifactKind"])
        .or_else(|| json_string(agent_runtime_worker, &["outputArtifactKind"]));
    let task_kinds = task_kinds(agent_runtime);
    let enabled = runtime_package_worker.is_object()
        || agent_runtime_worker.is_object()
        || !task_kinds.is_empty();
    let direct_provider_access =
        json_bool(agent_runtime_worker, &["directProviderAccess"]).unwrap_or(false);
    let direct_filesystem_access =
        json_bool(agent_runtime_worker, &["directFilesystemAccess"]).unwrap_or(false);
    let mut blockers = Vec::new();
    if enabled && worker_entrypoint.is_none() {
        blockers.push("TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING".to_string());
    }
    if enabled && task_kinds.is_empty() {
        blockers.push("TASK_RUNTIME_TASKS_MISSING".to_string());
    }
    if direct_provider_access {
        blockers.push("TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED".to_string());
    }
    if direct_filesystem_access {
        blockers.push("TASK_RUNTIME_DIRECT_FILESYSTEM_ACCESS_UNSUPPORTED".to_string());
    }
    if let (Some(app_dir), Some(entrypoint)) = (app_dir, worker_entrypoint.as_deref()) {
        if resolve_relative_path(app_dir, entrypoint)
            .map(|path| !path.is_file())
            .unwrap_or(true)
        {
            blockers.push("TASK_RUNTIME_WORKER_ENTRYPOINT_NOT_FOUND".to_string());
        }
    }

    AgentAppTaskRuntimeContract {
        enabled,
        package_root_path: if enabled {
            app_dir.map(|path| path.to_string_lossy().to_string())
        } else {
            None
        },
        worker_entrypoint,
        contract_path,
        sample_request_path,
        output_artifact_kind,
        task_kinds,
        direct_provider_access,
        direct_filesystem_access,
        blockers: unique_strings(blockers),
        follow_ups: if enabled {
            vec![
                "补 worker 输出到 ArtifactDocument / Product Workspace 版本链。".to_string(),
                "补 worker 执行 evidence、超时 / 失败分类和发布签名门禁。".to_string(),
            ]
        } else {
            vec![
                "需要声明 runtimePackage.worker 或 agentRuntime.worker 后才能运行后台任务。"
                    .to_string(),
            ]
        },
    }
}

pub(super) fn build_agent_app_task_runtime_contract_with_runtime_dir(
    state: &Value,
) -> AgentAppTaskRuntimeContract {
    let app_dir = resolve_agent_app_runtime_dir(state).ok();
    let mut contract = build_agent_app_task_runtime_contract(state, app_dir.as_deref());
    if contract.enabled && contract.package_root_path.is_none() {
        contract
            .blockers
            .push("TASK_RUNTIME_PACKAGE_ROOT_UNAVAILABLE".to_string());
    }
    contract
}

pub(super) fn resolve_agent_app_runtime_dir(
    state: &serde_json::Value,
) -> Result<PathBuf, RuntimeCoreError> {
    let app_id = json_string(state, &["appId"])
        .or_else(|| json_string(state, &["identity", "appId"]))
        .or_else(|| json_string(state, &["manifest", "name"]))
        .or_else(|| json_string(state, &["manifest", "appId"]));
    let source_kind = json_string(state, &["identity", "sourceKind"]).unwrap_or_default();
    let source_uri = json_string(state, &["identity", "sourceUri"]).unwrap_or_default();
    if source_kind == "local_folder" {
        return resolve_local_agent_app_runtime_dir(&source_uri, app_id.as_deref());
    }

    let package_hash = json_string(state, &["identity", "packageHash"]).ok_or_else(|| {
        RuntimeCoreError::Backend("Agent App installed state 缺少 packageHash。".to_string())
    })?;
    let package_dir_name = package_hash.replace(':', "_");
    let app_dir = lime_core::app_paths::preferred_data_dir()
        .map_err(RuntimeCoreError::Backend)?
        .join(AGENT_APP_DATA_DIR)
        .join("packages")
        .join(package_dir_name);
    canonicalize_existing_agent_app_dir(&app_dir.to_string_lossy())
}

pub(super) fn canonicalize_existing_agent_app_dir(
    value: &str,
) -> Result<PathBuf, RuntimeCoreError> {
    let path = PathBuf::from(value);
    let canonical = fs::canonicalize(&path).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "无法解析 Agent App runtime 目录 {}: {error}",
            path.display()
        ))
    })?;
    if !canonical.is_dir() {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App runtime 路径不是目录: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

pub(super) fn ensure_agent_app_runtime_folder(app_dir: &Path) -> Result<(), RuntimeCoreError> {
    if !app_dir.join("package.json").is_file() {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App runtime 目录缺少 package.json: {}",
            app_dir.display()
        )));
    }
    Ok(())
}

fn resolve_local_agent_app_runtime_dir(
    source_uri: &str,
    app_id: Option<&str>,
) -> Result<PathBuf, RuntimeCoreError> {
    match canonicalize_existing_agent_app_dir(source_uri) {
        Ok(app_dir) => Ok(app_dir),
        Err(error) => {
            if is_retired_content_factory_fixture_path(app_id, source_uri) {
                if let Some(app_dir) = resolve_content_factory_development_app_dir(source_uri) {
                    return Ok(app_dir);
                }
            }
            Err(error)
        }
    }
}

fn is_retired_content_factory_fixture_path(app_id: Option<&str>, source_uri: &str) -> bool {
    if app_id != Some(CONTENT_FACTORY_APP_ID) {
        return false;
    }
    let normalized = source_uri.replace('\\', "/");
    let retired_suffix =
        format!("/{RETIRED_AGENT_APP_RUNTIME_FIXTURE_DIR}/{CONTENT_FACTORY_APP_ID}");
    normalized.ends_with(&retired_suffix) || normalized.contains(&format!("{retired_suffix}/"))
}

fn resolve_content_factory_development_app_dir(source_uri: &str) -> Option<PathBuf> {
    canonicalize_first_content_factory_app_dir(content_factory_development_app_dir_candidates(
        source_uri,
    ))
}

fn canonicalize_first_content_factory_app_dir(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find_map(|candidate| {
        if !candidate.join("package.json").is_file() {
            return None;
        }
        fs::canonicalize(candidate)
            .ok()
            .filter(|canonical| canonical.is_dir())
    })
}

fn content_factory_development_app_dir_candidates(source_uri: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(value) = std::env::var(CONTENT_FACTORY_APP_DIR_ENV) {
        push_unique_path(&mut candidates, PathBuf::from(value));
    }

    if let Ok(cwd) = std::env::current_dir() {
        push_content_factory_repo_candidates_from_anchor(&mut candidates, &cwd);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            push_content_factory_repo_candidates_from_anchor(&mut candidates, parent);
        }
    }

    push_content_factory_repo_candidates_from_anchor(&mut candidates, Path::new(source_uri));
    candidates
}

fn push_content_factory_repo_candidates_from_anchor(candidates: &mut Vec<PathBuf>, anchor: &Path) {
    for ancestor in anchor.ancestors() {
        if ancestor
            .file_name()
            .is_some_and(|name| name == CONTENT_FACTORY_APP_ID)
        {
            push_unique_path(candidates, ancestor.to_path_buf());
        }
        push_unique_path(
            candidates,
            ancestor.join("limecloud").join(CONTENT_FACTORY_APP_ID),
        );
    }
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    if path.as_os_str().is_empty() {
        return;
    }
    if !paths.iter().any(|current| current == &path) {
        paths.push(path);
    }
}

fn task_kinds(agent_runtime: &Value) -> Vec<String> {
    unique_strings(
        agent_runtime
            .get("tasks")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|task| json_string(task, &["kind"])),
    )
}

fn json_bool(value: &Value, path: &[&str]) -> Option<bool> {
    let mut cursor = value;
    for segment in path {
        cursor = cursor.get(*segment)?;
    }
    cursor.as_bool()
}

fn resolve_relative_path(root: &Path, relative_path: &str) -> Option<std::path::PathBuf> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.contains("..")
    {
        return None;
    }
    Some(root.join(trimmed.trim_start_matches("./")))
}

fn unique_strings(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for value in values {
        let normalized = value.trim();
        if normalized.is_empty() || !seen.insert(normalized.to_string()) {
            continue;
        }
        result.push(normalized.to_string());
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn projects_v3_worker_contract_from_installed_state() {
        let state = json!({
            "manifest": {
                "runtimePackage": {
                    "worker": {
                        "entrypoint": "./src/runtime/content-factory-worker.mjs",
                        "contract": "./app.runtime.yaml",
                        "sampleRequest": "./examples/runtime-request.sample.json",
                        "outputArtifactKind": "content_factory.workspace_patch"
                    }
                },
                "agentRuntime": {
                    "worker": {
                        "directProviderAccess": false,
                        "directFilesystemAccess": false
                    },
                    "tasks": [
                        { "kind": "content.factory.generate" },
                        { "kind": "content.article.generate" },
                        { "kind": "content.factory.generate" }
                    ]
                }
            }
        });

        let contract = build_agent_app_task_runtime_contract(&state, None);

        assert!(contract.enabled);
        assert_eq!(
            contract.worker_entrypoint.as_deref(),
            Some("./src/runtime/content-factory-worker.mjs")
        );
        assert_eq!(
            contract.contract_path.as_deref(),
            Some("./app.runtime.yaml")
        );
        assert_eq!(
            contract.sample_request_path.as_deref(),
            Some("./examples/runtime-request.sample.json")
        );
        assert_eq!(
            contract.output_artifact_kind.as_deref(),
            Some("content_factory.workspace_patch")
        );
        assert_eq!(
            contract.task_kinds,
            vec!["content.factory.generate", "content.article.generate"]
        );
        assert!(contract.blockers.is_empty());
    }

    #[test]
    fn blocks_declared_worker_without_entrypoint() {
        let state = json!({
            "manifest": {
                "runtimePackage": {
                    "worker": {
                        "contract": "./app.runtime.yaml"
                    }
                },
                "agentRuntime": {
                    "tasks": [
                        { "kind": "content.factory.generate" }
                    ]
                }
            }
        });

        let contract = build_agent_app_task_runtime_contract(&state, None);

        assert!(contract.enabled);
        assert_eq!(
            contract.blockers,
            vec!["TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING"]
        );
    }

    #[test]
    fn blocks_declared_worker_when_entrypoint_file_is_missing() {
        let temp = tempfile::tempdir().expect("temp dir");
        let state = json!({
            "manifest": {
                "runtimePackage": {
                    "worker": {
                        "entrypoint": "./src/runtime/content-factory-worker.mjs",
                        "contract": "./app.runtime.yaml",
                        "sampleRequest": "./examples/runtime-request.sample.json",
                        "outputArtifactKind": "content_factory.workspace_patch"
                    }
                },
                "agentRuntime": {
                    "worker": {
                        "directProviderAccess": false,
                        "directFilesystemAccess": false
                    },
                    "tasks": [
                        { "kind": "content.image.generate" }
                    ]
                }
            }
        });

        let contract = build_agent_app_task_runtime_contract(&state, Some(temp.path()));

        assert!(contract.enabled);
        assert_eq!(
            contract.blockers,
            vec!["TASK_RUNTIME_WORKER_ENTRYPOINT_NOT_FOUND"]
        );
    }

    #[test]
    fn accepts_declared_worker_when_entrypoint_file_exists() {
        let temp = tempfile::tempdir().expect("temp dir");
        let worker_path = temp
            .path()
            .join("src")
            .join("runtime")
            .join("content-factory-worker.mjs");
        fs::create_dir_all(worker_path.parent().expect("worker parent")).expect("worker dir");
        fs::write(&worker_path, "export {};\n").expect("worker file");
        let state = json!({
            "manifest": {
                "runtimePackage": {
                    "worker": {
                        "entrypoint": "./src/runtime/content-factory-worker.mjs",
                        "contract": "./app.runtime.yaml",
                        "sampleRequest": "./examples/runtime-request.sample.json",
                        "outputArtifactKind": "content_factory.workspace_patch"
                    }
                },
                "agentRuntime": {
                    "worker": {
                        "directProviderAccess": false,
                        "directFilesystemAccess": false
                    },
                    "tasks": [
                        { "kind": "content.image.generate" }
                    ]
                }
            }
        });

        let contract = build_agent_app_task_runtime_contract(&state, Some(temp.path()));

        assert!(contract.enabled);
        assert_eq!(
            contract.package_root_path.as_deref(),
            Some(temp.path().to_string_lossy().as_ref())
        );
        assert!(contract.blockers.is_empty());
    }

    #[test]
    fn detects_retired_content_factory_fixture_path() {
        assert!(is_retired_content_factory_fixture_path(
            Some(CONTENT_FACTORY_APP_ID),
            "/workspace/aiclientproxy/lime/.lime/qc/agent-apps-runtime-fixtures/content-factory-app"
        ));
        assert!(is_retired_content_factory_fixture_path(
            Some(CONTENT_FACTORY_APP_ID),
            "C:\\workspace\\lime\\.lime\\qc\\agent-apps-runtime-fixtures\\content-factory-app"
        ));
        assert!(!is_retired_content_factory_fixture_path(
            Some("other-app"),
            "/workspace/aiclientproxy/lime/.lime/qc/agent-apps-runtime-fixtures/content-factory-app"
        ));
        assert!(!is_retired_content_factory_fixture_path(
            Some(CONTENT_FACTORY_APP_ID),
            "/workspace/limecloud/content-factory-app"
        ));
    }

    #[test]
    fn builds_content_factory_development_candidates_from_old_fixture_path() {
        let candidates = content_factory_development_app_dir_candidates(
            "/workspace/aiclientproxy/lime/.lime/qc/agent-apps-runtime-fixtures/content-factory-app",
        );

        assert!(candidates.iter().any(|candidate| {
            candidate
                .to_string_lossy()
                .ends_with("/workspace/limecloud/content-factory-app")
        }));
    }

    #[test]
    fn canonicalizes_first_content_factory_candidate_with_package_json() {
        let temp = tempfile::tempdir().expect("temp dir");
        let missing_package_json = temp.path().join("missing-package-json");
        let app_dir = temp.path().join(CONTENT_FACTORY_APP_ID);
        fs::create_dir_all(&missing_package_json).expect("missing candidate dir");
        fs::create_dir_all(&app_dir).expect("app dir");
        fs::write(app_dir.join("package.json"), "{}").expect("package json");

        let resolved =
            canonicalize_first_content_factory_app_dir(vec![missing_package_json, app_dir.clone()])
                .expect("resolved app dir");

        assert_eq!(
            resolved,
            fs::canonicalize(app_dir).expect("canonical app dir")
        );
    }
}
