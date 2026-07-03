use self::process::{
    invoke_node_json_process, invoke_worker_process, node_binary, resolve_package_entrypoint,
    resolve_worker_entrypoint,
};
use self::response::worker_response_to_runtime_events;
use super::{RuntimeCore, RuntimeCoreError, RuntimeEvent};
use app_server_protocol::PluginTaskRuntimeContract;
use serde_json::Value;
use std::path::PathBuf;

mod process;
mod response;

const DEFAULT_WORKER_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_HOOK_TIMEOUT_MS: u64 = 5_000;
const CONTENT_FACTORY_WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";

#[derive(Debug, Clone)]
pub(super) struct PluginWorkerRunRequest {
    pub package_root: PathBuf,
    pub task_runtime: PluginTaskRuntimeContract,
    pub request: Value,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone)]
pub(super) struct PluginHookRunRequest {
    pub package_root: PathBuf,
    pub hook_entrypoint: String,
    pub request: Value,
    pub timeout_ms: u64,
}

impl PluginHookRunRequest {
    pub(super) fn new(
        package_root: impl Into<PathBuf>,
        hook_entrypoint: impl Into<String>,
        request: Value,
    ) -> Self {
        Self {
            package_root: package_root.into(),
            hook_entrypoint: hook_entrypoint.into(),
            request,
            timeout_ms: DEFAULT_HOOK_TIMEOUT_MS,
        }
    }
}

impl PluginWorkerRunRequest {
    pub(super) fn new(
        package_root: impl Into<PathBuf>,
        task_runtime: PluginTaskRuntimeContract,
        request: Value,
    ) -> Self {
        Self {
            package_root: package_root.into(),
            task_runtime,
            request,
            timeout_ms: DEFAULT_WORKER_TIMEOUT_MS,
        }
    }

    #[cfg(test)]
    fn with_timeout_ms(mut self, timeout_ms: u64) -> Self {
        self.timeout_ms = timeout_ms;
        self
    }
}

impl RuntimeCore {
    #[cfg(test)]
    pub(in crate::runtime) fn run_plugin_worker(
        &self,
        request: PluginWorkerRunRequest,
    ) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
        let mut ignore_progress = |_event: RuntimeEvent| Ok(());
        self.run_plugin_worker_with_progress(request, &mut ignore_progress)
    }

    pub(in crate::runtime) fn run_plugin_worker_with_progress(
        &self,
        request: PluginWorkerRunRequest,
        on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
    ) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
        validate_task_runtime(&request.task_runtime)?;
        let entrypoint = resolve_worker_entrypoint(
            &request.package_root,
            request.task_runtime.worker_entrypoint.as_deref(),
        )?;
        let node = node_binary();
        let output = invoke_worker_process(
            &node,
            &request.package_root,
            &entrypoint,
            &request.request,
            request.timeout_ms,
            on_progress_event,
        )?;
        worker_response_to_runtime_events(
            output,
            &request.request,
            &request.task_runtime,
            self.sidecar_store.is_some(),
        )
    }

    pub(in crate::runtime) fn run_plugin_hook(
        &self,
        request: PluginHookRunRequest,
    ) -> Result<Value, RuntimeCoreError> {
        let entrypoint = resolve_package_entrypoint(
            &request.package_root,
            Some(request.hook_entrypoint.as_str()),
            "Plugin hook",
        )?;
        let node = node_binary();
        invoke_node_json_process(
            "Plugin hook",
            &node,
            &request.package_root,
            &entrypoint,
            &request.request,
            request.timeout_ms,
        )
    }
}

fn validate_task_runtime(contract: &PluginTaskRuntimeContract) -> Result<(), RuntimeCoreError> {
    if !contract.enabled {
        return Err(RuntimeCoreError::Backend(
            "Plugin worker runtime is not enabled.".to_string(),
        ));
    }
    if !contract.blockers.is_empty() {
        return Err(RuntimeCoreError::Backend(format!(
            "Plugin worker runtime has blockers: {}",
            contract.blockers.join(", ")
        )));
    }
    if contract.direct_provider_access {
        return Err(RuntimeCoreError::Backend(
            "Plugin worker direct provider access is unsupported.".to_string(),
        ));
    }
    if contract.direct_filesystem_access {
        return Err(RuntimeCoreError::Backend(
            "Plugin worker direct filesystem access is unsupported.".to_string(),
        ));
    }
    if contract.output_artifact_kind.as_deref() != Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND) {
        return Err(RuntimeCoreError::Backend(
            "Plugin worker output artifact kind is unsupported.".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
