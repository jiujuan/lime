use super::json_helpers::json_string;
use super::PluginHookDeclaration;
use serde_json::Value;

pub(super) fn hook_declarations(installed_state: &Value) -> Vec<PluginHookDeclaration> {
    let manifest = installed_state.get("manifest").unwrap_or(installed_state);
    let agent_runtime = manifest.get("agentRuntime");
    let runtime_package = manifest.get("runtimePackage");
    let sources = [
        agent_runtime
            .and_then(|runtime| runtime.get("hooks"))
            .and_then(|hooks| hooks.get("handlers")),
        runtime_package
            .and_then(|runtime| runtime.get("hooks"))
            .and_then(|hooks| hooks.get("handlers")),
        manifest
            .get("hooks")
            .and_then(|hooks| hooks.get("handlers")),
        manifest.get("hooks"),
    ];
    let mut declarations = Vec::new();
    for source in sources.into_iter().flatten() {
        let Some(items) = source.as_array() else {
            continue;
        };
        for item in items {
            let Some(key) = json_string(item, &["key", "id"]) else {
                continue;
            };
            let event = json_string(item, &["event", "hookEvent"]);
            if declarations.iter().any(|existing: &PluginHookDeclaration| {
                existing.key == key && existing.event == event
            }) {
                continue;
            }
            declarations.push(PluginHookDeclaration {
                key,
                event,
                entrypoint: json_string(item, &["entrypoint", "path"]),
                required: item
                    .get("required")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            });
        }
    }
    declarations
}

pub(super) fn host_managed_generation_config(installed_state: &Value) -> Option<Value> {
    let manifest = installed_state.get("manifest").unwrap_or(installed_state);
    manifest
        .pointer("/agentRuntime/worker/hostManagedGeneration")
        .or_else(|| manifest.pointer("/runtimePackage/worker/hostManagedGeneration"))
        .filter(|value| value.is_object())
        .cloned()
}

impl PluginHookDeclaration {
    pub(super) fn matches(&self, key: &str, hook_event: &str) -> bool {
        self.key == key
            && self
                .event
                .as_deref()
                .map(|event| event == hook_event)
                .unwrap_or(true)
    }
}

pub(super) fn hook_result_status(result: &Value) -> &str {
    match json_string(result, &["status"]).as_deref() {
        Some("completed" | "ok" | "ready") | None => "completed",
        Some("skipped") => "skipped",
        Some("failed" | "error") => "failed",
        Some(_) => "completed",
    }
}

pub(super) fn hook_error_reason(error_message: &str) -> &'static str {
    let lower = error_message.to_ascii_lowercase();
    if lower.contains("not found") {
        "HOOK_HANDLER_NOT_FOUND"
    } else if lower.contains("timed out") || lower.contains("timeout") {
        "HOOK_HANDLER_TIMEOUT"
    } else if lower.contains("decode") || lower.contains("json") || lower.contains("stdout") {
        "HOOK_HANDLER_OUTPUT_INVALID"
    } else {
        "HOOK_HANDLER_FAILED"
    }
}
