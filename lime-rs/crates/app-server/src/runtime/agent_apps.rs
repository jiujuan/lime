use super::RuntimeCore;
use super::RuntimeCoreError;
use super::agent_app_task_runtime::{
    build_agent_app_task_runtime_contract, build_agent_app_task_runtime_contract_with_runtime_dir,
    ensure_agent_app_runtime_folder, resolve_agent_app_runtime_dir,
};
use super::json_string;
use super::timestamp;
use app_server_protocol::AgentAppFetchCloudPackageParams;
use app_server_protocol::AgentAppInstalledDisabledSetParams;
use app_server_protocol::AgentAppInstalledListResponse;
use app_server_protocol::AgentAppInstalledSaveParams;
use app_server_protocol::AgentAppLocalPackageInspectParams;
use app_server_protocol::AgentAppLocalPackageInspectResponse;
use app_server_protocol::AgentAppPackageCacheEntry;
use app_server_protocol::AgentAppShellPackageMount;
use app_server_protocol::AgentAppShellPrepareParams;
use app_server_protocol::AgentAppShellPrepareResponse;
use app_server_protocol::AgentAppTaskRuntimeContract;
use app_server_protocol::AgentAppUiRuntimeStartParams;
use app_server_protocol::AgentAppUiRuntimeStatusParams;
use app_server_protocol::AgentAppUiRuntimeStatusResponse;
use app_server_protocol::AgentAppUiRuntimeStopParams;
use app_server_protocol::AgentAppUninstallParams;
use app_server_protocol::AgentAppUninstallRehearsalParams;
use app_server_protocol::AgentAppUninstallRehearsalResponse;
use app_server_protocol::AgentAppUninstallResponse;
use std::net::TcpListener;
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use std::time::Instant;
use tokio::process::Child;
use tokio::process::Command;
use tokio::time::sleep;

const AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS: u64 = 45;

#[derive(Debug)]
pub(super) struct AgentAppUiRuntimeProcess {
    child: Child,
    app_dir: PathBuf,
    port: u16,
    base_url: String,
    entry_key: String,
    route: String,
    started_at: String,
    task_runtime: AgentAppTaskRuntimeContract,
}

#[derive(Debug, Clone)]
struct AgentAppUiRuntimeEntry {
    entry_key: String,
    route: String,
}

#[derive(Debug, Clone)]
struct AgentAppShellDescriptorFields {
    descriptor_version: u64,
    app_id: String,
    install_mode: String,
    shell_kind: String,
    package_hash: String,
    manifest_hash: String,
    entry_key: String,
    window_title: String,
}

impl RuntimeCore {
    pub async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        self.app_data_source.list_agent_app_installed().await
    }

    pub async fn inspect_agent_app_local_package(
        &self,
        params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        self.app_data_source
            .inspect_agent_app_local_package(params)
            .await
    }

    pub async fn fetch_agent_app_cloud_package(
        &self,
        params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        self.app_data_source
            .fetch_agent_app_cloud_package(params)
            .await
    }

    pub async fn save_agent_app_installed(
        &self,
        params: AgentAppInstalledSaveParams,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        self.app_data_source.save_agent_app_installed(params).await
    }

    pub async fn set_agent_app_installed_disabled(
        &self,
        params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        self.app_data_source
            .set_agent_app_installed_disabled(params)
            .await
    }

    pub async fn preview_agent_app_uninstall(
        &self,
        params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        self.app_data_source
            .preview_agent_app_uninstall(params)
            .await
    }

    pub async fn uninstall_agent_app(
        &self,
        params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        self.app_data_source.uninstall_agent_app(params).await
    }

    pub async fn prepare_agent_app_shell(
        &self,
        params: AgentAppShellPrepareParams,
    ) -> Result<AgentAppShellPrepareResponse, RuntimeCoreError> {
        let prepared_at = timestamp();
        let fields = match parse_agent_app_shell_descriptor(&params.descriptor) {
            Ok(fields) => fields,
            Err(blocker_codes) => {
                return Ok(build_agent_app_shell_prepare_response(
                    None,
                    "blocked",
                    blocker_codes,
                    Some("Agent App shell descriptor 未通过启动前校验。".to_string()),
                    None,
                    prepared_at,
                ));
            }
        };

        let installed_state = match self.find_agent_app_installed_state(&fields.app_id).await {
            Ok(state) => state,
            Err(error) => {
                return Ok(build_agent_app_shell_prepare_response(
                    Some(&fields),
                    "blocked",
                    vec!["INSTALLED_STATE_MISSING".to_string()],
                    Some(error.to_string()),
                    None,
                    prepared_at,
                ));
            }
        };

        let state_blockers =
            validate_agent_app_shell_against_installed_state(&fields, &installed_state);
        if !state_blockers.is_empty() {
            return Ok(build_agent_app_shell_prepare_response(
                Some(&fields),
                "blocked",
                state_blockers,
                Some("Agent App shell descriptor 与 installed state 不一致。".to_string()),
                None,
                prepared_at,
            ));
        }

        let app_dir = match resolve_agent_app_runtime_dir(&installed_state) {
            Ok(app_dir) => app_dir,
            Err(error) => {
                return Ok(build_agent_app_shell_prepare_response(
                    Some(&fields),
                    "blocked",
                    vec!["PACKAGE_MOUNT_UNAVAILABLE".to_string()],
                    Some(error.to_string()),
                    None,
                    prepared_at,
                ));
            }
        };

        let package_mount = AgentAppShellPackageMount {
            kind: "local_dir".to_string(),
            path: app_dir.to_string_lossy().to_string(),
            read_only: true,
            package_hash: fields.package_hash.clone(),
            manifest_hash: fields.manifest_hash.clone(),
        };

        Ok(build_agent_app_shell_prepare_response(
            Some(&fields),
            "ready",
            Vec::new(),
            Some("Agent App shell 已通过 App Server current 启动前校验。".to_string()),
            Some(package_mount),
            prepared_at,
        ))
    }

    pub async fn start_agent_app_ui_runtime(
        &self,
        params: AgentAppUiRuntimeStartParams,
    ) -> Result<AgentAppUiRuntimeStatusResponse, RuntimeCoreError> {
        validate_agent_app_id(&params.app_id)?;
        let state = self.find_agent_app_installed_state(&params.app_id).await?;
        let entry = resolve_agent_app_ui_entry(&state, params.entry_key.as_deref())?;
        if let Some(status) = self
            .running_agent_app_ui_runtime(&params.app_id, Some(&entry))
            .await?
        {
            return Ok(status);
        }

        let app_dir = resolve_agent_app_runtime_dir(&state)?;
        ensure_agent_app_runtime_folder(&app_dir)?;
        let task_runtime = build_agent_app_task_runtime_contract(&state, Some(&app_dir));
        let port = reserve_local_port()?;
        let base_url = format!("http://127.0.0.1:{port}");
        let mut child = spawn_agent_app_ui_process(&app_dir, port)?;
        wait_for_agent_app_ui_runtime_ready(&mut child, &base_url).await?;
        let pid = child.id();
        let process = AgentAppUiRuntimeProcess {
            child,
            app_dir,
            port,
            base_url: base_url.clone(),
            entry_key: entry.entry_key.clone(),
            route: entry.route.clone(),
            started_at: timestamp(),
            task_runtime: task_runtime.clone(),
        };
        self.state
            .lock()
            .expect("runtime core state mutex poisoned")
            .agent_app_ui_runtimes
            .insert(params.app_id.clone(), process);

        Ok(AgentAppUiRuntimeStatusResponse {
            app_id: params.app_id,
            status: "running".to_string(),
            base_url: Some(base_url.clone()),
            entry_url: Some(join_agent_app_runtime_url(&base_url, &entry.route)),
            port: Some(port),
            pid,
            message: None,
            entry_key: Some(entry.entry_key),
            route: Some(entry.route),
            task_runtime: Some(task_runtime),
        })
    }

    pub async fn agent_app_ui_runtime_status(
        &self,
        params: AgentAppUiRuntimeStatusParams,
    ) -> Result<AgentAppUiRuntimeStatusResponse, RuntimeCoreError> {
        validate_agent_app_id(&params.app_id)?;
        if let Some(status) = self
            .running_agent_app_ui_runtime(&params.app_id, None)
            .await?
        {
            return Ok(status);
        }
        let task_runtime = self
            .find_agent_app_installed_state(&params.app_id)
            .await
            .ok()
            .map(|state| build_agent_app_task_runtime_contract_with_runtime_dir(&state));
        Ok(stopped_agent_app_ui_runtime_status(
            params.app_id,
            "Agent App UI runtime 未启动。",
            task_runtime,
        ))
    }

    pub async fn stop_agent_app_ui_runtime(
        &self,
        params: AgentAppUiRuntimeStopParams,
    ) -> Result<AgentAppUiRuntimeStatusResponse, RuntimeCoreError> {
        validate_agent_app_id(&params.app_id)?;
        let process = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned")
            .agent_app_ui_runtimes
            .remove(&params.app_id);
        let Some(mut process) = process else {
            return Ok(stopped_agent_app_ui_runtime_status(
                params.app_id,
                "Agent App UI runtime 未启动。",
                None,
            ));
        };
        let pid = process.child.id();
        terminate_agent_app_ui_process(&mut process.child).await;

        Ok(AgentAppUiRuntimeStatusResponse {
            app_id: params.app_id,
            status: "stopped".to_string(),
            base_url: Some(process.base_url),
            entry_url: None,
            port: Some(process.port),
            pid,
            message: Some("Agent App UI runtime 已停止。".to_string()),
            entry_key: Some(process.entry_key),
            route: Some(process.route),
            task_runtime: Some(process.task_runtime),
        })
    }
}

impl RuntimeCore {
    async fn find_agent_app_installed_state(
        &self,
        app_id: &str,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        let list = self.list_agent_app_installed().await?;
        list.states
            .into_iter()
            .find(|state| json_string(state, &["appId"]).as_deref() == Some(app_id))
            .ok_or_else(|| RuntimeCoreError::Backend(format!("Agent App 未安装: {app_id}")))
    }

    async fn running_agent_app_ui_runtime(
        &self,
        app_id: &str,
        entry: Option<&AgentAppUiRuntimeEntry>,
    ) -> Result<Option<AgentAppUiRuntimeStatusResponse>, RuntimeCoreError> {
        let status = self.agent_app_ui_runtime_status_by_process(app_id, entry)?;
        let Some(status) = status else {
            return Ok(None);
        };
        if status.status != "running" {
            return Ok(Some(status));
        }
        let Some(base_url) = status.base_url.as_deref() else {
            return Ok(Some(status));
        };
        if probe_agent_app_ui_runtime_ready(base_url).await {
            return Ok(Some(status));
        }
        self.remove_unready_agent_app_ui_runtime(app_id, status.pid)
            .await;
        Ok(None)
    }

    fn agent_app_ui_runtime_status_by_process(
        &self,
        app_id: &str,
        entry: Option<&AgentAppUiRuntimeEntry>,
    ) -> Result<Option<AgentAppUiRuntimeStatusResponse>, RuntimeCoreError> {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let Some(process) = state.agent_app_ui_runtimes.get_mut(app_id) else {
            return Ok(None);
        };
        let pid = process.child.id();
        let mut remove_runtime = false;
        let status = match process.child.try_wait() {
            Ok(None) => {
                if let Some(entry) = entry {
                    process.entry_key = entry.entry_key.clone();
                    process.route = entry.route.clone();
                }
                let route = process.route.clone();
                let base_url = process.base_url.clone();
                AgentAppUiRuntimeStatusResponse {
                    app_id: app_id.to_string(),
                    status: "running".to_string(),
                    base_url: Some(base_url.clone()),
                    entry_url: Some(join_agent_app_runtime_url(&base_url, &route)),
                    port: Some(process.port),
                    pid,
                    message: Some(format!(
                        "Agent App UI runtime 已运行，启动时间 {}，目录 {}。",
                        process.started_at,
                        process.app_dir.display()
                    )),
                    entry_key: Some(process.entry_key.clone()),
                    route: Some(route),
                    task_runtime: Some(process.task_runtime.clone()),
                }
            }
            Ok(Some(status)) => {
                remove_runtime = true;
                AgentAppUiRuntimeStatusResponse {
                    app_id: app_id.to_string(),
                    status: "failed".to_string(),
                    base_url: None,
                    entry_url: None,
                    port: None,
                    pid,
                    message: Some(format!("Agent App UI runtime 已退出: {status}")),
                    entry_key: None,
                    route: None,
                    task_runtime: Some(process.task_runtime.clone()),
                }
            }
            Err(error) => {
                remove_runtime = true;
                AgentAppUiRuntimeStatusResponse {
                    app_id: app_id.to_string(),
                    status: "failed".to_string(),
                    base_url: None,
                    entry_url: None,
                    port: None,
                    pid,
                    message: Some(format!("读取 Agent App UI runtime 状态失败: {error}")),
                    entry_key: None,
                    route: None,
                    task_runtime: Some(process.task_runtime.clone()),
                }
            }
        };
        if remove_runtime {
            state.agent_app_ui_runtimes.remove(app_id);
        }
        Ok(Some(status))
    }

    async fn remove_unready_agent_app_ui_runtime(&self, app_id: &str, expected_pid: Option<u32>) {
        let process = {
            let mut state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let Some(process) = state.agent_app_ui_runtimes.get(app_id) else {
                return;
            };
            if expected_pid.is_some_and(|pid| Some(pid) != process.child.id()) {
                return;
            }
            state.agent_app_ui_runtimes.remove(app_id)
        };
        if let Some(mut process) = process {
            terminate_agent_app_ui_process(&mut process.child).await;
        }
    }
}

fn validate_agent_app_id(app_id: &str) -> Result<(), RuntimeCoreError> {
    if app_id.is_empty()
        || app_id.len() > 96
        || !app_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App appId 不合法: {app_id}"
        )));
    }
    Ok(())
}

fn resolve_agent_app_ui_entry(
    state: &serde_json::Value,
    entry_key: Option<&str>,
) -> Result<AgentAppUiRuntimeEntry, RuntimeCoreError> {
    let entries = state
        .pointer("/projection/entries")
        .and_then(serde_json::Value::as_array)
        .or_else(|| {
            state
                .pointer("/manifest/entries")
                .and_then(serde_json::Value::as_array)
        })
        .ok_or_else(|| {
            RuntimeCoreError::Backend("Agent App installed state 缺少 entries。".to_string())
        })?;
    let entry = entry_key
        .and_then(|key| {
            entries
                .iter()
                .find(|entry| json_string(entry, &["key"]).as_deref() == Some(key))
        })
        .or_else(|| {
            entries.iter().find(|entry| {
                json_string(entry, &["key"]).as_deref() == Some("dashboard")
                    && is_agent_app_ui_entry(entry)
            })
        })
        .or_else(|| entries.iter().find(|entry| is_agent_app_ui_entry(entry)))
        .ok_or_else(|| {
            RuntimeCoreError::Backend("Agent App 未声明可打开的 UI entry。".to_string())
        })?;
    if !is_agent_app_ui_entry(entry) {
        return Err(RuntimeCoreError::Backend(format!(
            "Agent App entry {} 不是 UI entry。",
            json_string(entry, &["key"]).unwrap_or_else(|| "<unknown>".to_string())
        )));
    }
    let entry_key = json_string(entry, &["key"])
        .ok_or_else(|| RuntimeCoreError::Backend("Agent App UI entry 缺少 key。".to_string()))?;
    let route = normalize_agent_app_runtime_route(
        json_string(entry, &["route"]).as_deref().unwrap_or("/"),
    )?;
    Ok(AgentAppUiRuntimeEntry { entry_key, route })
}

fn is_agent_app_ui_entry(entry: &serde_json::Value) -> bool {
    matches!(
        json_string(entry, &["kind"]).as_deref(),
        Some("page" | "panel" | "settings")
    )
}

fn parse_agent_app_shell_descriptor(
    descriptor: &serde_json::Value,
) -> Result<AgentAppShellDescriptorFields, Vec<String>> {
    let mut blocker_codes = Vec::new();
    let descriptor_version = descriptor
        .get("descriptorVersion")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    if descriptor_version != 1 {
        blocker_codes.push("SHELL_DESCRIPTOR_VERSION_UNSUPPORTED".to_string());
    }

    let app_id = json_string(descriptor, &["appId"]).unwrap_or_default();
    if validate_agent_app_id(&app_id).is_err() {
        blocker_codes.push("APP_ID_INVALID".to_string());
    }

    let install_mode = json_string(descriptor, &["installMode"]).unwrap_or_default();
    if install_mode != "standalone" && install_mode != "runtime_backed" {
        blocker_codes.push("SHELL_INSTALL_MODE_UNSUPPORTED".to_string());
    }

    let shell_kind = json_string(descriptor, &["runtimeProfile", "shellKind"]).unwrap_or_default();
    if !agent_app_shell_kind_matches_install_mode(&shell_kind, &install_mode) {
        blocker_codes.push("SHELL_KIND_MISMATCH".to_string());
    }
    if json_string(descriptor, &["runtimeProfile", "installMode"]).as_deref()
        != Some(install_mode.as_str())
    {
        blocker_codes.push("RUNTIME_PROFILE_MISMATCH".to_string());
    }

    let package_hash = json_string(descriptor, &["packageHash"]).unwrap_or_default();
    let manifest_hash = json_string(descriptor, &["manifestHash"]).unwrap_or_default();
    if package_hash.is_empty() || manifest_hash.is_empty() {
        blocker_codes.push("PACKAGE_IDENTITY_MISSING".to_string());
    }

    if json_string(descriptor, &["isolation", "packageMount"]).as_deref() != Some("read-only")
        || json_string(descriptor, &["isolation", "secrets"]).as_deref() != Some("refs-only")
        || json_string(descriptor, &["isolation", "sideEffects"]).as_deref()
            != Some("runtime-broker")
        || json_string(descriptor, &["isolation", "evidence"]).as_deref()
            != Some("runtime-provenance")
    {
        blocker_codes.push("ISOLATION_POLICY_INVALID".to_string());
    }

    let entry_key = json_string(descriptor, &["entry", "entryKey"]).unwrap_or_default();
    if entry_key.is_empty() {
        blocker_codes.push("ENTRY_KEY_MISSING".to_string());
    }

    if !blocker_codes.is_empty() {
        blocker_codes.sort();
        blocker_codes.dedup();
        return Err(blocker_codes);
    }

    let window_title = json_string(descriptor, &["branding", "windowTitle"])
        .or_else(|| json_string(descriptor, &["branding", "name"]))
        .unwrap_or_else(|| app_id.clone());

    Ok(AgentAppShellDescriptorFields {
        descriptor_version,
        app_id,
        install_mode,
        shell_kind,
        package_hash,
        manifest_hash,
        entry_key,
        window_title,
    })
}

fn agent_app_shell_kind_matches_install_mode(shell_kind: &str, install_mode: &str) -> bool {
    (install_mode == "standalone" && shell_kind == "app_shell")
        || (install_mode == "runtime_backed" && shell_kind == "runtime_backed")
}

fn validate_agent_app_shell_against_installed_state(
    fields: &AgentAppShellDescriptorFields,
    state: &serde_json::Value,
) -> Vec<String> {
    let mut blockers = Vec::new();
    if json_string(state, &["installMode"]).as_deref() != Some(fields.install_mode.as_str()) {
        blockers.push("INSTALL_MODE_MISMATCH".to_string());
    }
    if json_string(state, &["runtimeProfileSummary", "shellKind"]).as_deref()
        != Some(fields.shell_kind.as_str())
    {
        blockers.push("RUNTIME_PROFILE_MISMATCH".to_string());
    }
    if json_string(state, &["identity", "packageHash"]).as_deref()
        != Some(fields.package_hash.as_str())
    {
        blockers.push("PACKAGE_HASH_MISMATCH".to_string());
    }
    if json_string(state, &["identity", "manifestHash"]).as_deref()
        != Some(fields.manifest_hash.as_str())
    {
        blockers.push("MANIFEST_HASH_MISMATCH".to_string());
    }
    if state
        .get("disabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        blockers.push("APP_DISABLED".to_string());
    }
    blockers
}

fn build_agent_app_shell_prepare_response(
    fields: Option<&AgentAppShellDescriptorFields>,
    status: &str,
    blocker_codes: Vec<String>,
    message: Option<String>,
    package_mount: Option<AgentAppShellPackageMount>,
    prepared_at: String,
) -> AgentAppShellPrepareResponse {
    AgentAppShellPrepareResponse {
        app_id: fields.map(|fields| fields.app_id.clone()),
        status: status.to_string(),
        install_mode: fields.map(|fields| fields.install_mode.clone()),
        shell_kind: fields.map(|fields| fields.shell_kind.clone()),
        descriptor_version: fields.map(|fields| fields.descriptor_version),
        dev_shell: true,
        blocker_codes,
        message,
        package_mount,
        entry_key: fields.map(|fields| fields.entry_key.clone()),
        window_title: fields.map(|fields| fields.window_title.clone()),
        prepared_at,
    }
}

fn reserve_local_port() -> Result<u16, RuntimeCoreError> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| {
        RuntimeCoreError::Backend(format!("分配 Agent App UI runtime 端口失败: {error}"))
    })?;
    listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|error| {
            RuntimeCoreError::Backend(format!("读取 Agent App UI runtime 端口失败: {error}"))
        })
}

fn spawn_agent_app_ui_process(app_dir: &Path, port: u16) -> Result<Child, RuntimeCoreError> {
    let mut last_error = None;
    for candidate in agent_app_npm_launch_candidates() {
        let mut command = Command::new(&candidate.binary);
        command
            .args(["run", "dev", "--silent"])
            .current_dir(app_dir)
            .env("PORT", port.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(path_env) = candidate.path_env.as_deref() {
            command.env("PATH", path_env);
        }
        for key in inherited_agent_app_secret_env_keys() {
            command.env_remove(key);
        }
        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(error) => last_error = Some(format!("{}: {error}", candidate.binary)),
        }
    }
    Err(RuntimeCoreError::Backend(format!(
        "启动 Agent App UI runtime 失败，请确认已安装 Node.js/npm: {}",
        last_error.unwrap_or_else(|| "npm 不可用".to_string())
    )))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AgentAppNpmLaunchCandidate {
    binary: String,
    path_env: Option<String>,
}

fn agent_app_npm_launch_candidates() -> Vec<AgentAppNpmLaunchCandidate> {
    let mut candidates = Vec::new();
    if let Some(path_env) = std::env::var("PATH").ok() {
        if !path_env.trim().is_empty() {
            #[cfg(windows)]
            {
                push_agent_app_npm_candidate(
                    &mut candidates,
                    AgentAppNpmLaunchCandidate {
                        binary: "npm.cmd".to_string(),
                        path_env: Some(path_env.clone()),
                    },
                );
            }
            push_agent_app_npm_candidate(
                &mut candidates,
                AgentAppNpmLaunchCandidate {
                    binary: "npm".to_string(),
                    path_env: Some(path_env),
                },
            );
        }
    }
    push_agent_app_npm_candidate(
        &mut candidates,
        AgentAppNpmLaunchCandidate {
            binary: "npm".to_string(),
            path_env: None,
        },
    );
    candidates
}

fn push_agent_app_npm_candidate(
    candidates: &mut Vec<AgentAppNpmLaunchCandidate>,
    candidate: AgentAppNpmLaunchCandidate,
) {
    if candidate.binary.trim().is_empty() {
        return;
    }
    if candidates
        .iter()
        .any(|current| current.binary == candidate.binary && current.path_env == candidate.path_env)
    {
        return;
    }
    candidates.push(candidate);
}

fn inherited_agent_app_secret_env_keys() -> &'static [&'static str] {
    &[
        "LIME_ACCESS_TOKEN",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "DEEPSEEK_API_KEY",
        "OPENROUTER_API_KEY",
        "MISTRAL_API_KEY",
        "XAI_API_KEY",
        "DASHSCOPE_API_KEY",
        "MOONSHOT_API_KEY",
        "ZHIPUAI_API_KEY",
        "GROQ_API_KEY",
        "FAL_KEY",
    ]
}

async fn wait_for_agent_app_ui_runtime_ready(
    child: &mut Child,
    base_url: &str,
) -> Result<(), RuntimeCoreError> {
    let deadline = Instant::now() + Duration::from_secs(AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "Agent App UI runtime 启动后退出: {status}"
                )));
            }
            Ok(None) => {}
            Err(error) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "检查 Agent App UI runtime 进程状态失败: {error}"
                )));
            }
        }

        if probe_agent_app_ui_runtime_ready(base_url).await {
            return Ok(());
        }

        if Instant::now() >= deadline {
            terminate_agent_app_ui_process(child).await;
            return Err(RuntimeCoreError::Backend(format!(
                "Agent App UI runtime 未在 {} 秒内就绪: {}",
                AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS,
                agent_app_ui_runtime_health_url(base_url)
            )));
        }
        sleep(Duration::from_millis(250)).await;
    }
}

async fn probe_agent_app_ui_runtime_ready(base_url: &str) -> bool {
    let client = match reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_millis(800))
        .build()
    {
        Ok(client) => client,
        Err(_) => reqwest::Client::new(),
    };
    match client
        .get(agent_app_ui_runtime_health_url(base_url))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

fn agent_app_ui_runtime_health_url(base_url: &str) -> String {
    format!("{base_url}/api/bootstrap")
}

async fn terminate_agent_app_ui_process(child: &mut Child) {
    let _ = child.start_kill();
    let _ = child.wait().await;
}

fn stopped_agent_app_ui_runtime_status(
    app_id: String,
    message: &str,
    task_runtime: Option<AgentAppTaskRuntimeContract>,
) -> AgentAppUiRuntimeStatusResponse {
    AgentAppUiRuntimeStatusResponse {
        app_id,
        status: "stopped".to_string(),
        base_url: None,
        entry_url: None,
        port: None,
        pid: None,
        message: Some(message.to_string()),
        entry_key: None,
        route: None,
        task_runtime,
    }
}

fn normalize_agent_app_runtime_route(route: &str) -> Result<String, RuntimeCoreError> {
    let trimmed = route.trim();
    if trimmed.is_empty() {
        return Ok("/".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Err(RuntimeCoreError::Backend(
            "Agent App UI entry route 必须是本地 runtime 相对路径。".to_string(),
        ));
    }
    if trimmed.starts_with('/') {
        return Ok(trimmed.to_string());
    }
    Ok(format!("/{trimmed}"))
}

fn join_agent_app_runtime_url(base_url: &str, route: &str) -> String {
    if route == "/" {
        return format!("{base_url}/");
    }
    format!("{base_url}{route}")
}
