use crate::agent_app_packages;
use crate::agent_app_packages::agent_app_data_dir;
use crate::agent_app_packages::read_json_string;
use crate::agent_app_packages::safe_hash_path_segment;
use crate::agent_app_packages::validate_agent_app_id_for_storage;
use app_server_protocol::AgentAppInstalledDisabledSetParams;
use app_server_protocol::AgentAppInstalledListResponse;
use app_server_protocol::AgentAppInstalledSaveParams;
use app_server_protocol::AgentAppUninstallParams;
use app_server_protocol::AgentAppUninstallRehearsalResponse;
use app_server_protocol::AgentAppUninstallRehearsalTarget;
use app_server_protocol::AgentAppUninstallResponse;

pub(crate) use agent_app_packages::fetch_agent_app_cloud_package;
pub(crate) use agent_app_packages::inspect_agent_app_local_package;
use chrono::Utc;
use serde_json::json;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

const INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION: u64 = 1;

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub(crate) fn list_agent_app_installed_state() -> Result<AgentAppInstalledListResponse, String> {
    let data_root = agent_app_data_dir()?;
    list_agent_app_installed_state_from_data_root(&data_root)
}

fn list_agent_app_installed_state_from_data_root(
    data_root: &Path,
) -> Result<AgentAppInstalledListResponse, String> {
    let installed_dir = installed_agent_app_dir_from_data_root(data_root);
    fs::create_dir_all(&installed_dir)
        .map_err(|error| format!("创建 Agent App installed 目录失败: {error}"))?;

    let mut states = Vec::new();
    let mut issues = Vec::new();
    let entries = fs::read_dir(&installed_dir)
        .map_err(|error| format!("读取 Agent App installed 目录失败: {error}"))?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                issues.push(agent_app_persistence_issue(
                    "READ_FAILED",
                    installed_dir.to_string_lossy(),
                    format!("读取 installed 条目失败: {error}"),
                    None,
                ));
                continue;
            }
        };
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        match read_agent_app_installed_state_path(&path) {
            Ok(Some(state)) => {
                states.push(agent_app_packages::migrate_seeded_agent_app_installed_state(state))
            }
            Ok(None) => {}
            Err(error) => issues.push(agent_app_persistence_issue(
                "PARSE_FAILED",
                path.to_string_lossy(),
                error,
                None,
            )),
        }
    }

    sort_agent_app_states_by_id(&mut states);

    Ok(AgentAppInstalledListResponse { states, issues })
}

fn sort_agent_app_states_by_id(states: &mut [Value]) {
    states.sort_by(|left, right| {
        read_json_string(left, &["appId"])
            .unwrap_or_default()
            .cmp(&read_json_string(right, &["appId"]).unwrap_or_default())
    });
}

fn read_agent_app_installed_state_path(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(path).map_err(|error| format!("读取 installed state 失败: {error}"))?;
    let envelope: Value = serde_json::from_str(&content)
        .map_err(|error| format!("解析 installed state 失败: {error}"))?;
    let schema_version = envelope
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Installed Agent App state 缺少 schemaVersion。".to_string())?;
    if schema_version != INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION {
        return Err(format!(
            "不支持的 Agent App installed state schemaVersion: {schema_version}",
        ));
    }
    Ok(envelope.get("state").cloned())
}

fn agent_app_persistence_issue(
    code: impl Into<String>,
    path: impl ToString,
    message: impl Into<String>,
    app_id: Option<String>,
) -> Value {
    json!({
        "code": code.into(),
        "path": path.to_string(),
        "message": message.into(),
        "appId": app_id,
    })
}

pub(crate) fn save_agent_app_installed_state(
    params: AgentAppInstalledSaveParams,
) -> Result<Value, String> {
    let state = agent_app_packages::migrate_seeded_agent_app_installed_state(params.state);
    let app_id = read_state_app_id(&state)?;
    validate_agent_app_id_for_storage(&app_id)?;
    agent_app_packages::materialize_seeded_agent_app_runtime_package(&state)?;
    let saved_at = now_iso();
    write_installed_agent_app_state(&app_id, &state, &saved_at)?;
    Ok(state)
}

pub(crate) fn set_agent_app_installed_disabled(
    params: AgentAppInstalledDisabledSetParams,
) -> Result<AgentAppInstalledListResponse, String> {
    validate_agent_app_id_for_storage(&params.app_id)?;
    let path = installed_agent_app_state_path(&params.app_id)?;
    let Some(mut state) = read_agent_app_installed_state_path(&path)? else {
        return Err(format!("Agent App 未安装: {}", params.app_id));
    };
    let updated_at = params.updated_at.unwrap_or_else(now_iso);
    set_object_field(&mut state, "disabled", Value::Bool(params.disabled))?;
    set_object_field(&mut state, "updatedAt", Value::String(updated_at.clone()))?;
    write_installed_agent_app_state(&params.app_id, &state, &updated_at)?;
    list_agent_app_installed_state()
}

pub(crate) fn uninstall_agent_app(
    params: AgentAppUninstallParams,
) -> Result<AgentAppUninstallResponse, String> {
    let data_root = agent_app_data_dir()?;
    uninstall_agent_app_from_data_root(params, &data_root)
}

fn uninstall_agent_app_from_data_root(
    params: AgentAppUninstallParams,
    data_root: &Path,
) -> Result<AgentAppUninstallResponse, String> {
    let rehearsal =
        build_agent_app_uninstall_rehearsal_from_data_root(params.app_id, params.mode, data_root)?;
    let mut blocker_codes = if rehearsal.mode == "delete-data" {
        let expected = build_agent_app_delete_data_confirmation_phrase(
            &rehearsal.app_id,
            rehearsal
                .package_hash
                .as_deref()
                .unwrap_or("unknown-package"),
        );
        if params.confirmation_phrase.as_deref() == Some(expected.as_str()) {
            vec!["DELETE_DATA_NOT_ENABLED_IN_CURRENT_PHASE".to_string()]
        } else {
            vec!["CONFIRMATION_MISMATCH".to_string()]
        }
    } else {
        Vec::new()
    };

    let (removed_target_count, missing_target_count) =
        if rehearsal.mode == "keep-data" && blocker_codes.is_empty() {
            remove_agent_app_install_references_from_data_root(&rehearsal.app_id, data_root)?
        } else {
            (0, 0)
        };

    let status = if !blocker_codes.is_empty() {
        "blocked"
    } else if rehearsal.mode == "keep-data" {
        if removed_target_count == 0 {
            blocker_codes.push("INSTALL_REFERENCE_NOT_FOUND".to_string());
            "blocked"
        } else {
            "uninstalled"
        }
    } else {
        "rehearsal_only"
    };

    Ok(AgentAppUninstallResponse {
        status: status.to_string(),
        rehearsal,
        list: list_agent_app_installed_state_from_data_root(data_root)?,
        removed_target_count,
        missing_target_count,
        blocker_codes,
        delete_evidence: None,
    })
}

pub(crate) fn build_agent_app_uninstall_rehearsal(
    app_id: String,
    mode: String,
) -> Result<AgentAppUninstallRehearsalResponse, String> {
    let data_root = agent_app_data_dir()?;
    build_agent_app_uninstall_rehearsal_from_data_root(app_id, mode, &data_root)
}

fn build_agent_app_uninstall_rehearsal_from_data_root(
    app_id: String,
    mode: String,
    data_root: &Path,
) -> Result<AgentAppUninstallRehearsalResponse, String> {
    validate_agent_app_id_for_storage(&app_id)?;
    let mode = match mode.as_str() {
        "keep-data" | "delete-data" => mode,
        other => return Err(format!("不支持的 Agent App 卸载演练模式: {other}")),
    };
    let path = installed_agent_app_state_path_from_data_root(data_root, &app_id)?;
    let Some(state) = read_agent_app_installed_state_path(&path)? else {
        return Err(format!("Agent App 未安装: {}", app_id));
    };

    let package_hash = read_json_string(&state, &["identity", "packageHash"])
        .unwrap_or_else(|| "unknown-package".to_string());
    let package_hash_path_segment = safe_hash_path_segment(&package_hash);
    let storage_namespace = read_json_string(&state, &["projection", "storage", "namespace"])
        .unwrap_or_else(|| app_id.clone());
    let base = data_root.to_string_lossy().to_string();

    let install_reference_action = "delete";
    let derived_runtime_action = if mode == "delete-data" {
        "delete"
    } else {
        "retain"
    };
    let mut targets = vec![
        agent_app_uninstall_target(
            "path",
            format!("{base}/installed/{app_id}.json"),
            true,
            install_reference_action,
            "Installed Agent App state snapshot.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/setup/{app_id}.json"),
            true,
            install_reference_action,
            "Installed setup binding state.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/packages/{package_hash_path_segment}"),
            true,
            derived_runtime_action,
            "Cached runtime package for this Agent App.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/package-index/{app_id}.json"),
            true,
            derived_runtime_action,
            "Package cache index.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/projections/{app_id}.json"),
            true,
            derived_runtime_action,
            "Generated projection snapshot.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/readiness/{app_id}.json"),
            true,
            derived_runtime_action,
            "Readiness snapshot.",
        ),
        agent_app_uninstall_target(
            "path",
            format!("{base}/logs/{app_id}"),
            true,
            derived_runtime_action,
            "Agent App host logs.",
        ),
    ];
    let data_action = if mode == "delete-data" {
        "delete"
    } else {
        "retain"
    };
    targets.push(agent_app_uninstall_target(
        "namespace",
        format!("{base}/storage/{storage_namespace}"),
        true,
        data_action,
        "App storage namespace declared by manifest.",
    ));
    targets.push(agent_app_uninstall_target(
        "path",
        format!("{base}/exports/{app_id}"),
        true,
        data_action,
        "Optional user exports for this Agent App.",
    ));

    let deleted_target_count = targets
        .iter()
        .filter(|target| target.action == "delete")
        .count();
    let retained_target_count = targets
        .iter()
        .filter(|target| target.action == "retain")
        .count();

    Ok(AgentAppUninstallRehearsalResponse {
        app_id,
        package_hash: Some(package_hash),
        mode,
        generated_at: now_iso(),
        deleted_target_count,
        retained_target_count,
        targets,
        warnings: vec!["DRY_RUN_ONLY".to_string()],
    })
}

fn build_agent_app_delete_data_confirmation_phrase(app_id: &str, package_hash: &str) -> String {
    format!("DELETE_AGENT_APP_DATA {app_id} {package_hash}")
}

fn remove_agent_app_install_references_from_data_root(
    app_id: &str,
    data_root: &Path,
) -> Result<(usize, usize), String> {
    let paths = [
        installed_agent_app_state_path_from_data_root(data_root, app_id)?,
        setup_agent_app_state_path_from_data_root(data_root, app_id)?,
    ];
    remove_agent_app_install_reference_paths(&paths)
}

fn remove_agent_app_install_reference_paths(paths: &[PathBuf]) -> Result<(usize, usize), String> {
    let mut removed = 0;
    let mut missing = 0;
    for path in paths {
        if !path.exists() {
            missing += 1;
            continue;
        }
        fs::remove_file(path).map_err(|error| {
            format!(
                "移除 Agent App 安装引用文件 {} 失败: {error}",
                path.display()
            )
        })?;
        removed += 1;
    }
    Ok((removed, missing))
}

fn agent_app_uninstall_target(
    kind: impl Into<String>,
    value: impl Into<String>,
    safe_to_delete: bool,
    action: impl Into<String>,
    reason: impl Into<String>,
) -> AgentAppUninstallRehearsalTarget {
    AgentAppUninstallRehearsalTarget {
        kind: kind.into(),
        value: value.into(),
        safe_to_delete,
        action: action.into(),
        reason: reason.into(),
    }
}

fn installed_agent_app_dir() -> Result<PathBuf, String> {
    Ok(installed_agent_app_dir_from_data_root(
        &agent_app_data_dir()?
    ))
}

fn setup_agent_app_dir() -> Result<PathBuf, String> {
    Ok(setup_agent_app_dir_from_data_root(&agent_app_data_dir()?))
}

fn installed_agent_app_dir_from_data_root(data_root: &Path) -> PathBuf {
    data_root.join("installed")
}

fn setup_agent_app_dir_from_data_root(data_root: &Path) -> PathBuf {
    data_root.join("setup")
}

fn installed_agent_app_state_path(app_id: &str) -> Result<PathBuf, String> {
    let data_root = agent_app_data_dir()?;
    installed_agent_app_state_path_from_data_root(&data_root, app_id)
}

fn setup_agent_app_state_path(app_id: &str) -> Result<PathBuf, String> {
    let data_root = agent_app_data_dir()?;
    setup_agent_app_state_path_from_data_root(&data_root, app_id)
}

fn installed_agent_app_state_path_from_data_root(
    data_root: &Path,
    app_id: &str,
) -> Result<PathBuf, String> {
    validate_agent_app_id_for_storage(app_id)?;
    Ok(installed_agent_app_dir_from_data_root(data_root).join(format!("{app_id}.json")))
}

fn setup_agent_app_state_path_from_data_root(
    data_root: &Path,
    app_id: &str,
) -> Result<PathBuf, String> {
    validate_agent_app_id_for_storage(app_id)?;
    Ok(setup_agent_app_dir_from_data_root(data_root).join(format!("{app_id}.json")))
}

fn read_state_app_id(state: &Value) -> Result<String, String> {
    read_json_string(state, &["appId"])
        .ok_or_else(|| "Installed Agent App state 缺少 appId。".to_string())
}

fn write_installed_agent_app_state(
    app_id: &str,
    state: &Value,
    saved_at: &str,
) -> Result<(), String> {
    fs::create_dir_all(installed_agent_app_dir()?)
        .map_err(|error| format!("创建 Agent App installed 目录失败: {error}"))?;
    fs::create_dir_all(setup_agent_app_dir()?)
        .map_err(|error| format!("创建 Agent App setup 目录失败: {error}"))?;

    let envelope = json!({
        "schemaVersion": INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION,
        "savedAt": saved_at,
        "state": state,
    });
    fs::write(
        installed_agent_app_state_path(app_id)?,
        serde_json::to_string_pretty(&envelope)
            .map_err(|error| format!("序列化 installed state 失败: {error}"))?,
    )
    .map_err(|error| format!("写入 installed state 失败: {error}"))?;

    let setup_content = json!({
        "schemaVersion": INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION,
        "appId": app_id,
        "savedAt": saved_at,
        "setup": state.get("setup").cloned().unwrap_or_else(|| json!({})),
    });
    fs::write(
        setup_agent_app_state_path(app_id)?,
        serde_json::to_string_pretty(&setup_content)
            .map_err(|error| format!("序列化 setup state 失败: {error}"))?,
    )
    .map_err(|error| format!("写入 setup state 失败: {error}"))?;
    Ok(())
}

fn set_object_field(value: &mut Value, key: &str, next: Value) -> Result<(), String> {
    let Some(object) = value.as_object_mut() else {
        return Err("Installed Agent App state 必须是对象。".to_string());
    };
    object.insert(key.to_string(), next);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    const SEEDED_CONTENT_FACTORY_VERSION: &str = "2.2.2";
    const SEEDED_CONTENT_FACTORY_SOURCE_URI: &str =
        "https://seeded.local/agent-apps/content-factory-app/2.2.2.lapp";
    const SEEDED_CONTENT_FACTORY_PACKAGE_HASH: &str =
        "sha256:2b842c1401459db69e399002eeb2b7ead451e1fe3b8bab192c6a1ca7aa20d354";
    const SEEDED_CONTENT_FACTORY_MANIFEST_HASH: &str =
        "sha256:6df5c193ac89ff4400006a45d8340029446529d9b5953c7c5d03d4349f9dbfc3";

    const NOW: &str = "2026-03-13T01:00:00Z";

    #[test]
    fn remove_agent_app_install_reference_paths_removes_only_reference_files() {
        let temp = TempDir::new().expect("temp dir");
        let installed = temp
            .path()
            .join("installed")
            .join("content-factory-app.json");
        let setup = temp.path().join("setup").join("content-factory-app.json");
        let storage = temp
            .path()
            .join("storage")
            .join("content-factory-app")
            .join("user-data.json");

        fs::create_dir_all(installed.parent().expect("installed parent")).expect("installed dir");
        fs::create_dir_all(setup.parent().expect("setup parent")).expect("setup dir");
        fs::create_dir_all(storage.parent().expect("storage parent")).expect("storage dir");
        fs::write(&installed, "{}").expect("installed state");
        fs::write(&setup, "{}").expect("setup state");
        fs::write(&storage, "{}").expect("storage data");

        let (removed, missing) =
            remove_agent_app_install_reference_paths(&[installed.clone(), setup.clone()])
                .expect("remove install refs");

        assert_eq!(removed, 2);
        assert_eq!(missing, 0);
        assert!(!installed.exists());
        assert!(!setup.exists());
        assert!(storage.exists());
    }

    #[test]
    fn remove_agent_app_install_reference_paths_counts_missing_reference_files() {
        let temp = TempDir::new().expect("temp dir");
        let installed = temp
            .path()
            .join("installed")
            .join("content-factory-app.json");
        let setup = temp.path().join("setup").join("content-factory-app.json");

        fs::create_dir_all(installed.parent().expect("installed parent")).expect("installed dir");
        fs::write(&installed, "{}").expect("installed state");

        let (removed, missing) =
            remove_agent_app_install_reference_paths(&[installed.clone(), setup.clone()])
                .expect("remove install refs");

        assert_eq!(removed, 1);
        assert_eq!(missing, 1);
        assert!(!installed.exists());
    }

    #[test]
    fn uninstall_agent_app_keep_data_removes_install_state_from_current_list() {
        let temp = TempDir::new().expect("temp dir");
        let data_root = temp.path();
        let app_id = "custom-agent-app";
        let installed = installed_agent_app_state_path_from_data_root(data_root, app_id)
            .expect("installed path");
        let setup =
            setup_agent_app_state_path_from_data_root(data_root, app_id).expect("setup path");
        let user_data = data_root
            .join("storage")
            .join(app_id)
            .join("user-data.json");

        fs::create_dir_all(installed.parent().expect("installed parent")).expect("installed dir");
        fs::create_dir_all(setup.parent().expect("setup parent")).expect("setup dir");
        fs::create_dir_all(user_data.parent().expect("user data parent")).expect("storage dir");
        fs::write(
            &installed,
            serde_json::to_string_pretty(&json!({
                "schemaVersion": INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION,
                "savedAt": NOW,
                "state": {
                    "appId": app_id,
                    "identity": {
                        "packageHash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
                    },
                    "projection": {
                        "storage": {
                            "namespace": app_id
                        }
                    },
                    "setup": {}
                }
            }))
            .expect("serialize installed state"),
        )
        .expect("write installed state");
        fs::write(&setup, "{}").expect("write setup state");
        fs::write(&user_data, "{}").expect("write user data");

        let before = list_agent_app_installed_state_from_data_root(data_root).expect("list before");
        assert_eq!(before.states.len(), 1);

        let response = uninstall_agent_app_from_data_root(
            AgentAppUninstallParams {
                app_id: app_id.to_string(),
                mode: "keep-data".to_string(),
                confirmation_phrase: None,
            },
            data_root,
        )
        .expect("uninstall");

        assert_eq!(response.status, "uninstalled");
        assert_eq!(response.removed_target_count, 2);
        assert_eq!(response.missing_target_count, 0);
        assert!(response.blocker_codes.is_empty());
        assert!(response
            .list
            .states
            .iter()
            .all(|state| read_json_string(state, &["appId"]).as_deref() != Some(app_id)));
        assert!(!installed.exists());
        assert!(!setup.exists());
        assert!(user_data.exists());
    }

    #[test]
    fn list_agent_app_installed_state_does_not_inject_content_factory() {
        let temp = TempDir::new().expect("temp dir");
        let data_root = temp.path();

        let response =
            list_agent_app_installed_state_from_data_root(data_root).expect("list installed");

        assert!(response.states.is_empty());
        assert!(response.issues.is_empty());
    }

    #[test]
    fn list_agent_app_installed_state_migrates_seeded_content_factory_release_evidence() {
        let temp = TempDir::new().expect("temp dir");
        let data_root = temp.path();
        let installed =
            installed_agent_app_state_path_from_data_root(data_root, "content-factory-app")
                .expect("installed path");
        fs::create_dir_all(installed.parent().expect("installed parent")).expect("installed dir");
        fs::write(
            &installed,
            serde_json::to_string_pretty(&json!({
                "schemaVersion": INSTALLED_AGENT_APP_STATE_SCHEMA_VERSION,
                "savedAt": NOW,
                "state": seeded_content_factory_state_without_release_evidence()
            }))
            .expect("serialize installed state"),
        )
        .expect("write installed state");

        let response =
            list_agent_app_installed_state_from_data_root(data_root).expect("list installed");

        assert_eq!(response.states.len(), 1);
        assert_eq!(
            read_json_string(
                &response.states[0],
                &["setup", "cloudReleaseEvidence", "signaturePolicy"]
            )
            .as_deref(),
            Some("optional")
        );
        assert_eq!(
            read_json_string(
                &response.states[0],
                &["setup", "cloudReleaseEvidence", "packageVerificationStatus"]
            )
            .as_deref(),
            Some("verified")
        );
    }

    #[test]
    fn save_agent_app_installed_state_migrates_seeded_content_factory_release_evidence() {
        let state = agent_app_packages::migrate_seeded_agent_app_installed_state(
            seeded_content_factory_state_without_release_evidence(),
        );

        assert_eq!(
            read_json_string(
                &state,
                &[
                    "setup",
                    "cloudReleaseEvidence",
                    "signatureVerificationStatus"
                ]
            )
            .as_deref(),
            Some("not_configured")
        );
        assert_eq!(
            read_json_string(&state, &["setup", "cloudReleaseEvidence", "status"]).as_deref(),
            Some("warning")
        );
        assert_eq!(
            state
                .get("setup")
                .and_then(|setup| setup.get("cloudReleaseEvidence"))
                .and_then(|evidence| evidence.get("packageHashMatched"))
                .and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn saving_seeded_content_factory_materializes_runtime_package_cache() {
        let temp = TempDir::new().expect("temp dir");
        let data_root = temp.path();
        let state = json!({
            "appId": "content-factory-app",
            "identity": {
                "sourceKind": "cloud_release",
                "sourceUri": SEEDED_CONTENT_FACTORY_SOURCE_URI,
                "appId": "content-factory-app",
                "appVersion": SEEDED_CONTENT_FACTORY_VERSION,
                "packageHash": SEEDED_CONTENT_FACTORY_PACKAGE_HASH,
                "manifestHash": SEEDED_CONTENT_FACTORY_MANIFEST_HASH
            },
            "manifest": {
                "runtimePackage": {
                    "worker": {
                        "entrypoint": "./src/runtime/content-factory-worker.mjs"
                    }
                }
            },
            "setup": {
                "cloudReleaseEvidence": {
                    "status": "warning",
                    "signaturePolicy": "optional",
                    "signatureVerificationStatus": "not_configured",
                    "packageHashMatched": true,
                    "manifestHashMatched": true,
                    "packageVerificationStatus": "verified"
                }
            }
        });

        agent_app_packages::materialize_seeded_agent_app_runtime_package_from_data_root(
            &state, data_root,
        )
        .expect("materialize seeded package");

        let cache_dir = data_root
            .join("packages")
            .join(agent_app_packages::safe_hash_path_segment(
                SEEDED_CONTENT_FACTORY_PACKAGE_HASH,
            ));
        assert!(cache_dir.join("package.json").is_file());
        assert!(cache_dir.join("plugin.json").is_file());
        assert!(cache_dir.join("app.workbench.yaml").is_file());
        assert!(cache_dir.join("skills/article-writing/SKILL.md").is_file());
        assert!(cache_dir
            .join("src/runtime/content-factory-worker.mjs")
            .is_file());
    }

    #[test]
    fn saving_non_seeded_cloud_release_does_not_materialize_runtime_package_cache() {
        let temp = TempDir::new().expect("temp dir");
        let data_root = temp.path();
        let state = json!({
            "appId": "content-factory-app",
            "identity": {
                "sourceKind": "cloud_release",
                "sourceUri": "https://packages.limecloud.example/content-factory-app.lapp",
                "packageHash": SEEDED_CONTENT_FACTORY_PACKAGE_HASH
            },
            "manifest": {
                "runtimePackage": {
                    "worker": {
                        "entrypoint": "./src/runtime/content-factory-worker.mjs"
                    }
                }
            },
            "setup": {}
        });

        agent_app_packages::materialize_seeded_agent_app_runtime_package_from_data_root(
            &state, data_root,
        )
        .expect("skip non-seeded package");

        assert!(!data_root.join("packages").exists());
    }

    #[test]
    fn seeded_local_app_not_registered_does_not_migrate_or_materialize() {
        let temp = TempDir::new().expect("temp dir");
        let data_root = temp.path();
        let state = json!({
            "appId": "unknown-seeded-app",
            "identity": {
                "sourceKind": "cloud_release",
                "sourceUri": "https://seeded.local/agent-apps/unknown-seeded-app/1.0.0.lapp",
                "appId": "unknown-seeded-app",
                "appVersion": "1.0.0",
                "packageHash": "package-fnv1a-unknown",
                "manifestHash": "manifest-fnv1a-unknown"
            },
            "manifest": {
                "version": "1.0.0",
                "runtimePackage": {
                    "worker": {
                        "entrypoint": "./src/runtime/unknown-worker.mjs"
                    }
                }
            },
            "setup": {}
        });

        let migrated = agent_app_packages::migrate_seeded_agent_app_installed_state(state.clone());
        agent_app_packages::materialize_seeded_agent_app_runtime_package_from_data_root(
            &state, data_root,
        )
        .expect("skip unregistered seeded package");

        assert!(migrated
            .get("setup")
            .and_then(|setup| setup.get("cloudReleaseEvidence"))
            .is_none());
        assert!(!data_root.join("packages").exists());
    }

    fn seeded_content_factory_state_without_release_evidence() -> Value {
        json!({
            "appId": "content-factory-app",
            "identity": {
                "sourceKind": "cloud_release",
                "sourceUri": SEEDED_CONTENT_FACTORY_SOURCE_URI,
                "appId": "content-factory-app",
                "appVersion": SEEDED_CONTENT_FACTORY_VERSION,
                "packageHash": SEEDED_CONTENT_FACTORY_PACKAGE_HASH,
                "manifestHash": SEEDED_CONTENT_FACTORY_MANIFEST_HASH
            },
            "manifest": {
                "version": SEEDED_CONTENT_FACTORY_VERSION,
                "runtimePackage": {
                    "worker": {
                        "entrypoint": "./src/runtime/content-factory-worker.mjs"
                    }
                }
            },
            "setup": {
                "skills": []
            }
        })
    }
}
