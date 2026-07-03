use super::json_string;
use super::plugin_task_runtime::build_plugin_task_runtime_contract;
use super::timestamp;
use super::RuntimeCore;
use super::RuntimeCoreError;
use app_server_protocol::PluginArticleWorkspaceContract;
use app_server_protocol::PluginArticleWorkspaceObject;
use app_server_protocol::PluginHistoryRestoreContract;
use app_server_protocol::PluginHostFunctionState;
use app_server_protocol::PluginHostLifecycleListResponse;
use app_server_protocol::PluginHostLifecycleSnapshot;
use app_server_protocol::PluginReadinessIssueCategorySummary;
use app_server_protocol::PluginRightSurfaceContract;
use serde_json::Value;
use std::collections::HashMap;
use std::collections::HashSet;

const RIGHT_SURFACE_TABS: &[&str] = &[
    "articleWorkspace",
    "file",
    "evidence",
    "terminal",
    "browser",
    "sideChat",
];

const ARTICLE_WORKSPACE_PANES: &[&str] = &[
    "artifact",
    "inspector",
    "runtime",
    "evidence",
    "expertInfo",
    "appSurface",
];

const ISSUE_CATEGORY_PRIORITY: &[&str] = &[
    "legacy",
    "package",
    "cloud",
    "runtime",
    "capability",
    "permission",
    "resource",
    "taskRuntime",
    "host",
    "unknown",
];

impl RuntimeCore {
    pub async fn list_plugin_host_lifecycle(
        &self,
    ) -> Result<PluginHostLifecycleListResponse, RuntimeCoreError> {
        let installed = self.list_plugin_installed().await?;
        let snapshots = installed
            .states
            .iter()
            .map(build_plugin_host_lifecycle_snapshot)
            .collect::<Vec<_>>();

        Ok(PluginHostLifecycleListResponse {
            snapshots,
            issues: installed.issues,
        })
    }
}

fn build_plugin_host_lifecycle_snapshot(state: &Value) -> PluginHostLifecycleSnapshot {
    let manifest = state.get("manifest").unwrap_or(&Value::Null);
    let readiness = state.get("readiness").unwrap_or(&Value::Null);
    let app_id = json_string(state, &["appId"])
        .or_else(|| json_string(manifest, &["appId"]))
        .unwrap_or_else(|| "unknown-plugin".to_string());
    let display_name = json_string(manifest, &["displayName"]).unwrap_or_else(|| app_id.clone());
    let profiles = resolve_profiles(manifest);
    let app_center_status = build_app_center_status(manifest, readiness);
    let readiness_status =
        json_string(readiness, &["status"]).unwrap_or_else(|| "needs-setup".to_string());
    let right_surface = build_right_surface_contract(manifest, &profiles);
    let task_runtime = build_plugin_task_runtime_contract(state, None);
    let functions = build_function_states(
        &app_center_status,
        &readiness_status,
        readiness,
        &right_surface,
        &task_runtime,
    );
    let blockers = unique_strings(
        functions
            .iter()
            .flat_map(|function| function.blockers.iter().cloned()),
    );
    let follow_ups = unique_strings(
        functions
            .iter()
            .flat_map(|function| function.follow_ups.iter().cloned()),
    );
    let issue_categories = summarize_readiness_issue_categories(&blockers);
    let primary_issue_category = issue_categories
        .first()
        .map(|summary| summary.category.clone());
    let publish_blocked = matches!(app_center_status.as_str(), "blocked" | "delisted");

    PluginHostLifecycleSnapshot {
        app_id,
        display_name,
        profiles,
        app_center_status,
        readiness_status,
        right_surface,
        task_runtime,
        functions,
        blockers,
        follow_ups,
        publish_blocked,
        primary_issue_category,
        issue_categories,
        generated_at: json_string(state, &["updatedAt"]).unwrap_or_else(timestamp),
    }
}

fn resolve_profiles(manifest: &Value) -> Vec<String> {
    let mut profiles = json_string_array(manifest.get("profiles")).unwrap_or_default();
    if manifest.get("workbench").is_some_and(Value::is_object)
        && !profiles.iter().any(|profile| profile == "workbench")
    {
        profiles.push("workbench".to_string());
    }
    profiles.retain(|profile| profile == "classic" || profile == "workbench");
    if profiles.is_empty() {
        profiles.push("classic".to_string());
    }
    unique_strings(profiles)
}

fn build_app_center_status(manifest: &Value, readiness: &Value) -> String {
    if matches!(
        json_string(manifest, &["status"]).as_deref(),
        Some("archived" | "deprecated")
    ) || detects_legacy_primary_path(manifest)
    {
        return "delisted".to_string();
    }
    status_from_readiness(readiness)
}

fn status_from_readiness(readiness: &Value) -> String {
    match json_string(readiness, &["status"]).as_deref() {
        Some("blocked") => "blocked".to_string(),
        Some("needs-setup" | "degraded") => "needs-setup".to_string(),
        Some("ready") => "ready".to_string(),
        _ => "needs-setup".to_string(),
    }
}

fn detects_legacy_primary_path(manifest: &Value) -> bool {
    let haystack = [
        manifest.get("runtimePackage"),
        manifest.get("requirements"),
        manifest.get("boundary"),
        manifest.get("integrations"),
        manifest.get("operations"),
    ]
    .into_iter()
    .flatten()
    .map(Value::to_string)
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();

    [
        concat!("src-", "ta", "uri"),
        concat!("ta", "uri command"),
        concat!("ta", "uri_command"),
        "iframe-only",
        "browserview",
        "<webview",
    ]
    .iter()
    .any(|needle| haystack.contains(needle))
}

fn build_right_surface_contract(
    manifest: &Value,
    profiles: &[String],
) -> PluginRightSurfaceContract {
    let workbench = manifest.get("workbench").unwrap_or(&Value::Null);
    let enabled = profiles.iter().any(|profile| profile == "workbench") || workbench.is_object();
    let objects = list_product_objects(workbench);
    let mut panes = list_object_surfaces(workbench)
        .into_iter()
        .filter_map(|surface| json_string(surface, &["surfaceKind"]))
        .collect::<Vec<_>>();
    panes.extend(objects.iter().map(|object| object.default_pane.clone()));
    panes.extend(
        ARTICLE_WORKSPACE_PANES
            .iter()
            .map(|pane| (*pane).to_string()),
    );
    let panes = unique_strings(panes);
    let renderer_kinds = unique_strings(
        list_object_surfaces(workbench)
            .into_iter()
            .filter_map(|surface| json_string(surface, &["renderer"])),
    );
    let history_restore = build_history_restore_contract(workbench, enabled, &objects);

    PluginRightSurfaceContract {
        dock: "right".to_string(),
        physical_dock_count: 1,
        default_active_tab: enabled.then(|| "articleWorkspace".to_string()),
        supported_tabs: RIGHT_SURFACE_TABS
            .iter()
            .map(|tab| (*tab).to_string())
            .collect(),
        article_workspace: PluginArticleWorkspaceContract {
            enabled,
            objects,
            panes,
            renderer_kinds,
        },
        history_restore,
    }
}

fn build_history_restore_contract(
    workbench: &Value,
    workbench_enabled: bool,
    objects: &[PluginArticleWorkspaceObject],
) -> PluginHistoryRestoreContract {
    let restore = workbench.get("historyRestore").unwrap_or(&Value::Null);
    let enabled = workbench_enabled && restore.is_object();
    let restore_default_surface = json_string(restore, &["defaultSurface"]);
    let default_pane = resolve_history_default_pane(restore_default_surface.as_deref(), objects);

    PluginHistoryRestoreContract {
        enabled,
        default_tab: workbench_enabled.then(|| "articleWorkspace".to_string()),
        default_pane: Some(default_pane),
        restore_selection: json_bool(restore, &["restoreSelection"]).unwrap_or(true),
        restore_layout: json_bool(restore, &["restoreLayout"]).unwrap_or(true),
        fallback: json_string(restore, &["fallback"]).unwrap_or_else(|| "artifactPreview".into()),
    }
}

fn resolve_history_default_pane(
    default_surface: Option<&str>,
    objects: &[PluginArticleWorkspaceObject],
) -> String {
    match default_surface {
        None | Some("selectedObject" | "primaryObject") => objects
            .iter()
            .find(|object| object.primary)
            .or_else(|| objects.first())
            .map(|object| object.default_pane.clone())
            .unwrap_or_else(|| "artifact".to_string()),
        Some(value) if !value.trim().is_empty() => value.trim().to_string(),
        _ => "artifact".to_string(),
    }
}

fn list_product_objects(workbench: &Value) -> Vec<PluginArticleWorkspaceObject> {
    workbench
        .get("productionObjects")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|object| {
            let kind = json_string(object, &["kind"])?;
            if kind.trim().is_empty() {
                return None;
            }
            Some(PluginArticleWorkspaceObject {
                title: json_string(object, &["title"]).unwrap_or_else(|| kind.clone()),
                default_pane: json_string(object, &["defaultSurface"])
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| "artifact".to_string()),
                artifact_kind: json_string(object, &["artifactKind"]),
                primary: json_bool(object, &["primary"]).unwrap_or(false),
                kind,
            })
        })
        .collect()
}

fn list_object_surfaces(workbench: &Value) -> Vec<&Value> {
    workbench
        .get("objectSurfaces")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .collect()
}

fn build_function_states(
    app_center_status: &str,
    readiness_status: &str,
    readiness: &Value,
    right_surface: &PluginRightSurfaceContract,
    task_runtime: &app_server_protocol::PluginTaskRuntimeContract,
) -> Vec<PluginHostFunctionState> {
    let readiness_blockers = readiness_issue_codes(readiness.get("blockers"));
    let missing_capabilities = readiness_missing_capabilities(readiness);
    let workbench_enabled = right_surface.article_workspace.enabled;
    let product_objects_missing =
        workbench_enabled && right_surface.article_workspace.objects.is_empty();
    let history_restore_missing = !right_surface.history_restore.enabled;

    vec![
        function_state(
            "appCenterPublishing",
            app_center_status,
            "plugin-host",
            if app_center_status == "delisted" {
                vec!["LEGACY_OR_DEPRECATED_APP".to_string()]
            } else {
                Vec::new()
            },
            vec!["接入真实 App Center card 上架 / 下架状态。".to_string()],
        ),
        function_state(
            "packageInspection",
            "ready",
            "app-server",
            Vec::new(),
            vec!["补 archive package 和签名校验的 GUI 证据。".to_string()],
        ),
        function_state(
            "installReview",
            "ready",
            "app-server",
            Vec::new(),
            vec!["把 review 结果接入安装确认弹窗。".to_string()],
        ),
        function_state(
            "readinessGate",
            readiness_status,
            "app-server",
            readiness_blockers.clone(),
            Vec::new(),
        ),
        function_state(
            "capabilitySdk",
            if missing_capabilities.is_empty() {
                "ready"
            } else {
                "blocked"
            },
            "plugin-host",
            missing_capabilities,
            Vec::new(),
        ),
        function_state(
            "appServerBridge",
            "ready",
            "app-server",
            Vec::new(),
            Vec::new(),
        ),
        function_state(
            "uiRuntime",
            if readiness_status == "blocked" {
                "blocked"
            } else {
                "ready"
            },
            "app-server",
            readiness_blockers.clone(),
            vec!["Desktop Host 补 Right Surface WebContentsView 嵌入接线。".to_string()],
        ),
        function_state(
            "agentRuntime",
            if !task_runtime.blockers.is_empty() {
                "blocked"
            } else if task_runtime.enabled {
                readiness_status
            } else {
                "needs-setup"
            },
            "app-server",
            unique_strings(
                readiness_blockers
                    .into_iter()
                    .chain(task_runtime.blockers.iter().cloned()),
            ),
            task_runtime.follow_ups.clone(),
        ),
        function_state(
            "rightSurfaceDock",
            if workbench_enabled {
                "ready"
            } else {
                "planned"
            },
            "claw",
            Vec::new(),
            vec!["接入 WorkspaceConversationScene 的右侧 tab strip。".to_string()],
        ),
        function_state(
            "articleWorkspace",
            if product_objects_missing {
                "needs-setup"
            } else if workbench_enabled {
                "ready"
            } else {
                "planned"
            },
            "claw",
            product_objects_missing
                .then(|| vec!["WORKBENCH_PRODUCTION_OBJECTS_MISSING".to_string()])
                .unwrap_or_default(),
            Vec::new(),
        ),
        function_state(
            "historyRestore",
            if history_restore_missing {
                "needs-setup"
            } else {
                "ready"
            },
            "app-server",
            history_restore_missing
                .then(|| vec!["WORKBENCH_HISTORY_RESTORE_MISSING".to_string()])
                .unwrap_or_default(),
            Vec::new(),
        ),
        function_state(
            "uninstall",
            "ready",
            "app-server",
            Vec::new(),
            vec![
                "真实 delete-data 仍需 evidence / residual audit / confirmation gate。".to_string(),
            ],
        ),
    ]
}

fn function_state(
    key: &str,
    status: &str,
    current_owner: &str,
    blockers: Vec<String>,
    follow_ups: Vec<String>,
) -> PluginHostFunctionState {
    PluginHostFunctionState {
        key: key.to_string(),
        status: status.to_string(),
        current_owner: current_owner.to_string(),
        blockers,
        follow_ups,
    }
}

fn readiness_issue_codes(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|issue| json_string(issue, &["code"]))
        .collect()
}

fn readiness_missing_capabilities(readiness: &Value) -> Vec<String> {
    readiness
        .get("missingCapabilities")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| json_string(item, &["capability"]))
        .collect()
}

fn classify_readiness_issue_code(code: &str) -> &'static str {
    match code {
        "LEGACY_OR_DEPRECATED_APP" => "legacy",
        "PACKAGE_HASH_MISSING"
        | "MANIFEST_HASH_MISSING"
        | "PACKAGE_HASH_MISMATCH"
        | "MANIFEST_HASH_MISMATCH"
        | "PACKAGE_VERIFICATION_FAILED"
        | "PACKAGE_HASH_UNVERIFIED"
        | "MANIFEST_HASH_UNVERIFIED" => "package",
        "CLOUD_APP_DISABLED"
        | "CLOUD_LICENSE_UNAVAILABLE"
        | "CLOUD_REGISTRATION_REQUIRED"
        | "CLOUD_TOOL_UNAVAILABLE"
        | "CLOUD_POLICY_UNSUPPORTED"
        | "CLOUD_ENTRY_NOT_ENABLED"
        | "CLOUD_SIGNATURE_MISSING"
        | "CLOUD_SIGNATURE_UNVERIFIED"
        | "CLOUD_SIGNATURE_VERIFICATION_FAILED" => "cloud",
        "MANIFEST_VERSION_UNSUPPORTED"
        | "RUNTIME_TARGET_UNSUPPORTED"
        | "INSTALL_MODE_UNSUPPORTED"
        | "RUNTIME_VERSION_UNSUPPORTED"
        | "RUNTIME_PROFILE_MISSING"
        | "UI_RUNTIME_DISABLED"
        | "WORKER_RUNTIME_DISABLED"
        | "WORKBENCH_PRODUCTION_OBJECTS_MISSING"
        | "WORKBENCH_HISTORY_RESTORE_MISSING" => "runtime",
        "CAPABILITY_MISSING" | "CAPABILITY_VERSION_UNSUPPORTED" => "capability",
        "PERMISSION_REQUIRED" | "SECRET_REQUIRED" => "permission",
        "STORAGE_DECLARED_BUT_DISABLED"
        | "KNOWLEDGE_BINDING_REQUIRED"
        | "SKILL_REQUIRED"
        | "TOOL_REQUIRED"
        | "ARTIFACT_TYPE_REQUIRED"
        | "EVAL_REQUIRED"
        | "OVERLAY_REQUIRED"
        | "SERVICE_REQUIRED"
        | "WORKFLOW_REQUIRED" => "resource",
        "TASK_RUNTIME_WORKER_ENTRYPOINT_MISSING"
        | "TASK_RUNTIME_TASKS_MISSING"
        | "TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED"
        | "TASK_RUNTIME_DIRECT_FILESYSTEM_ACCESS_UNSUPPORTED" => "taskRuntime",
        "SERVER_HOST_GATE_BLOCKED" => "host",
        _ => "unknown",
    }
}

fn summarize_readiness_issue_categories(
    codes: &[String],
) -> Vec<PluginReadinessIssueCategorySummary> {
    let mut buckets: HashMap<&'static str, (usize, HashSet<String>)> = HashMap::new();
    for code in codes {
        let normalized = code.trim();
        if normalized.is_empty() {
            continue;
        }
        let category = classify_readiness_issue_code(normalized);
        let bucket = buckets
            .entry(category)
            .or_insert_with(|| (0, HashSet::new()));
        bucket.0 += 1;
        bucket.1.insert(normalized.to_string());
    }

    ISSUE_CATEGORY_PRIORITY
        .iter()
        .filter_map(|category| {
            let (count, codes) = buckets.remove(category)?;
            let mut codes = codes.into_iter().collect::<Vec<_>>();
            codes.sort();
            Some(PluginReadinessIssueCategorySummary {
                category: (*category).to_string(),
                count,
                codes,
            })
        })
        .collect()
}

fn json_string_array(value: Option<&Value>) -> Option<Vec<String>> {
    value.map(|value| {
        value
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(ToString::to_string)
            .collect()
    })
}

fn json_bool(value: &Value, path: &[&str]) -> Option<bool> {
    let mut cursor = value;
    for segment in path {
        cursor = cursor.get(*segment)?;
    }
    cursor.as_bool()
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
    fn summarizes_readiness_issue_categories_by_priority() {
        let summaries = summarize_readiness_issue_categories(&[
            "CLOUD_SIGNATURE_UNVERIFIED".to_string(),
            "PACKAGE_HASH_MISMATCH".to_string(),
            "CAPABILITY_MISSING".to_string(),
            "CLOUD_SIGNATURE_UNVERIFIED".to_string(),
            "UNMAPPED_CODE".to_string(),
        ]);

        assert_eq!(summaries.len(), 4);
        assert_eq!(summaries[0].category, "package");
        assert_eq!(summaries[0].count, 1);
        assert_eq!(summaries[0].codes, vec!["PACKAGE_HASH_MISMATCH"]);
        assert_eq!(summaries[1].category, "cloud");
        assert_eq!(summaries[1].count, 2);
        assert_eq!(summaries[1].codes, vec!["CLOUD_SIGNATURE_UNVERIFIED"]);
        assert_eq!(summaries[2].category, "capability");
        assert_eq!(summaries[3].category, "unknown");
    }

    #[test]
    fn projects_server_readiness_categories_in_lifecycle_snapshot() {
        let state = json!({
            "appId": "content-factory-app",
            "updatedAt": "2026-06-24T00:00:00.000Z",
            "manifest": {
                "appId": "content-factory-app",
                "displayName": "内容工厂",
                "profiles": ["workbench"],
                "workbench": {
                    "historyRestore": {
                        "defaultSurface": "selectedObject"
                    },
                    "productionObjects": [
                        {
                            "kind": "articleDraft",
                            "title": "文章草稿",
                            "defaultSurface": "artifact",
                            "primary": true
                        }
                    ]
                },
                "runtimePackage": {
                    "worker": {
                        "entrypoint": "./src/runtime/content-factory-worker.mjs"
                    }
                },
                "agentRuntime": {
                    "tasks": [
                        { "kind": "content.factory.generate" }
                    ]
                }
            },
            "readiness": {
                "status": "blocked",
                "blockers": [
                    { "code": "CLOUD_SIGNATURE_UNVERIFIED" },
                    { "code": "PACKAGE_HASH_MISMATCH" },
                    { "code": "CAPABILITY_MISSING" }
                ]
            }
        });

        let snapshot = build_plugin_host_lifecycle_snapshot(&state);

        assert!(snapshot.publish_blocked);
        assert_eq!(snapshot.primary_issue_category.as_deref(), Some("package"));
        assert_eq!(
            snapshot
                .issue_categories
                .iter()
                .map(|summary| summary.category.as_str())
                .collect::<Vec<_>>(),
            vec!["package", "cloud", "capability"]
        );
        assert_eq!(
            snapshot
                .issue_categories
                .iter()
                .find(|summary| summary.category == "cloud")
                .map(|summary| summary.codes.clone()),
            Some(vec!["CLOUD_SIGNATURE_UNVERIFIED".to_string()])
        );
    }
}
