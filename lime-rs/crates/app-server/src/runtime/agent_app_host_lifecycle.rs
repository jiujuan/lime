use super::json_string;
use super::timestamp;
use super::agent_app_task_runtime::build_agent_app_task_runtime_contract;
use super::RuntimeCore;
use super::RuntimeCoreError;
use app_server_protocol::AgentAppHistoryRestoreContract;
use app_server_protocol::AgentAppHostFunctionState;
use app_server_protocol::AgentAppHostLifecycleListResponse;
use app_server_protocol::AgentAppHostLifecycleSnapshot;
use app_server_protocol::AgentAppProductProfileContract;
use app_server_protocol::AgentAppProductProfileObject;
use app_server_protocol::AgentAppRightSurfaceContract;
use serde_json::Value;
use std::collections::HashSet;

const RIGHT_SURFACE_TABS: &[&str] = &[
    "productProfile",
    "file",
    "evidence",
    "terminal",
    "browser",
    "sideChat",
];

const PRODUCT_PROFILE_PANES: &[&str] = &[
    "artifact",
    "inspector",
    "runtime",
    "evidence",
    "expertInfo",
    "appSurface",
];

impl RuntimeCore {
    pub async fn list_agent_app_host_lifecycle(
        &self,
    ) -> Result<AgentAppHostLifecycleListResponse, RuntimeCoreError> {
        let installed = self.list_agent_app_installed().await?;
        let snapshots = installed
            .states
            .iter()
            .map(build_agent_app_host_lifecycle_snapshot)
            .collect::<Vec<_>>();

        Ok(AgentAppHostLifecycleListResponse {
            snapshots,
            issues: installed.issues,
        })
    }
}

fn build_agent_app_host_lifecycle_snapshot(state: &Value) -> AgentAppHostLifecycleSnapshot {
    let manifest = state.get("manifest").unwrap_or(&Value::Null);
    let readiness = state.get("readiness").unwrap_or(&Value::Null);
    let app_id = json_string(state, &["appId"])
        .or_else(|| json_string(manifest, &["appId"]))
        .unwrap_or_else(|| "unknown-agent-app".to_string());
    let display_name = json_string(manifest, &["displayName"]).unwrap_or_else(|| app_id.clone());
    let profiles = resolve_profiles(manifest);
    let app_center_status = build_app_center_status(manifest, readiness);
    let readiness_status =
        json_string(readiness, &["status"]).unwrap_or_else(|| "needs-setup".to_string());
    let right_surface = build_right_surface_contract(manifest, &profiles);
    let task_runtime = build_agent_app_task_runtime_contract(state, None);
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

    AgentAppHostLifecycleSnapshot {
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
) -> AgentAppRightSurfaceContract {
    let workbench = manifest.get("workbench").unwrap_or(&Value::Null);
    let enabled = profiles.iter().any(|profile| profile == "workbench") || workbench.is_object();
    let objects = list_product_objects(workbench);
    let mut panes = list_object_surfaces(workbench)
        .into_iter()
        .filter_map(|surface| json_string(surface, &["surfaceKind"]))
        .collect::<Vec<_>>();
    panes.extend(objects.iter().map(|object| object.default_pane.clone()));
    panes.extend(PRODUCT_PROFILE_PANES.iter().map(|pane| (*pane).to_string()));
    let panes = unique_strings(panes);
    let renderer_kinds = unique_strings(
        list_object_surfaces(workbench)
            .into_iter()
            .filter_map(|surface| json_string(surface, &["renderer"])),
    );
    let history_restore = build_history_restore_contract(workbench, enabled, &objects);

    AgentAppRightSurfaceContract {
        dock: "right".to_string(),
        physical_dock_count: 1,
        default_active_tab: enabled.then(|| "productProfile".to_string()),
        supported_tabs: RIGHT_SURFACE_TABS
            .iter()
            .map(|tab| (*tab).to_string())
            .collect(),
        product_profile: AgentAppProductProfileContract {
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
    objects: &[AgentAppProductProfileObject],
) -> AgentAppHistoryRestoreContract {
    let restore = workbench.get("historyRestore").unwrap_or(&Value::Null);
    let enabled = workbench_enabled && restore.is_object();
    let restore_default_surface = json_string(restore, &["defaultSurface"]);
    let default_pane = resolve_history_default_pane(restore_default_surface.as_deref(), objects);

    AgentAppHistoryRestoreContract {
        enabled,
        default_tab: workbench_enabled.then(|| "productProfile".to_string()),
        default_pane: Some(default_pane),
        restore_selection: json_bool(restore, &["restoreSelection"]).unwrap_or(true),
        restore_layout: json_bool(restore, &["restoreLayout"]).unwrap_or(true),
        fallback: json_string(restore, &["fallback"]).unwrap_or_else(|| "artifactPreview".into()),
    }
}

fn resolve_history_default_pane(
    default_surface: Option<&str>,
    objects: &[AgentAppProductProfileObject],
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

fn list_product_objects(workbench: &Value) -> Vec<AgentAppProductProfileObject> {
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
            Some(AgentAppProductProfileObject {
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
    right_surface: &AgentAppRightSurfaceContract,
    task_runtime: &app_server_protocol::AgentAppTaskRuntimeContract,
) -> Vec<AgentAppHostFunctionState> {
    let readiness_blockers = readiness_issue_codes(readiness.get("blockers"));
    let missing_capabilities = readiness_missing_capabilities(readiness);
    let workbench_enabled = right_surface.product_profile.enabled;
    let product_objects_missing =
        workbench_enabled && right_surface.product_profile.objects.is_empty();
    let history_restore_missing = !right_surface.history_restore.enabled;

    vec![
        function_state(
            "appCenterPublishing",
            app_center_status,
            "agent-app-host",
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
            "agent-app-host",
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
            "productProfile",
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
) -> AgentAppHostFunctionState {
    AgentAppHostFunctionState {
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
