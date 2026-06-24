use super::json_string;
use app_server_protocol::AgentAppTaskRuntimeContract;
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

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
}
