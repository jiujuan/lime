use uuid::Uuid;

pub(super) const AGENT_APP_RUNTIME_EVENT_PREFIX: &str = "agent_app_runtime";
pub(super) const AGENT_APP_RUNTIME_METADATA_KEY: &str = "agent_app_runtime";
pub(super) const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
pub(super) const LIME_RUNTIME_TOOL_SURFACE_KEY: &str = "tool_surface";
pub(super) const AGENT_APP_RUNTIME_CAPABILITY_SOURCE: &str = "agent_app_runtime";
pub(super) const CONTENT_FACTORY_WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";
pub(super) const AGENT_APP_RUNTIME_SESSION_ID_PREFIX: &str = "agent-app-runtime-";

pub(super) fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

pub(super) fn new_agent_app_runtime_session_id() -> String {
    format!("{}{}", AGENT_APP_RUNTIME_SESSION_ID_PREFIX, Uuid::new_v4())
}

pub(super) fn agent_app_runtime_event_name(app_id: &str, task_id: &str) -> String {
    format!("{AGENT_APP_RUNTIME_EVENT_PREFIX}:{app_id}:{task_id}")
}

pub(super) fn require_text(value: Option<&str>, label: &str) -> Result<String, String> {
    non_empty(value).ok_or_else(|| format!("{label} 不能为空"))
}
