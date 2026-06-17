use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::{AgentSession, RuntimeOptions};
use serde_json::{json, Map, Value};

const IMPORTED_CONVERSATION_KIND: &str = "conversation.import";

impl RuntimeCore {
    pub(in crate::runtime) fn imported_session_runtime_options(
        &self,
        session_id: &str,
    ) -> Result<Option<RuntimeOptions>, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let Some(stored) = state.sessions.get(session_id) else {
            return Err(RuntimeCoreError::SessionNotFound(session_id.to_string()));
        };
        Ok(default_runtime_options_for_session(&stored.session))
    }
}

fn default_runtime_options_for_session(session: &AgentSession) -> Option<RuntimeOptions> {
    let metadata = session
        .business_object_ref
        .as_ref()
        .filter(|reference| reference.kind == IMPORTED_CONVERSATION_KIND)
        .and_then(|reference| reference.metadata.as_ref())?;
    let imported_continuation = metadata
        .get("importedContinuation")
        .or_else(|| metadata.get("imported_continuation"));
    let thread_settings = metadata
        .get("importedThreadSettings")
        .or_else(|| metadata.get("imported_thread_settings"));
    if imported_continuation.is_none() && thread_settings.is_none() {
        return None;
    }

    let cwd = string_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["cwd", "workingDir", "working_dir"],
    );
    let provider = string_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &[
            "modelProvider",
            "model_provider",
            "providerName",
            "provider_name",
        ],
    );
    let model = string_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["model", "modelName", "model_name"],
    );
    let reasoning_effort = string_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["effort", "reasoningEffort", "reasoning_effort"],
    );
    let reasoning_summary = value_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["summary", "reasoningSummary", "reasoning_summary"],
    );
    let approval_policy = string_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["approvalPolicy", "approval_policy"],
    );
    let approvals_reviewer = string_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["approvalsReviewer", "approvals_reviewer"],
    );
    let sandbox_policy = value_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["sandboxPolicy", "sandbox_policy"],
    );
    let active_permission_profile = value_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["activePermissionProfile", "active_permission_profile"],
    );
    let service_tier = string_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["serviceTier", "service_tier"],
    );
    let collaboration_mode = string_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["collaborationMode", "collaboration_mode"],
    );
    let personality = value_alias_from_sources(
        &[imported_continuation, thread_settings, Some(metadata)],
        &["personality"],
    );

    let host_options = compact_json(json!({
        "asterChatRequest": {
            "session_id": session.session_id,
            "workspace_id": session.workspace_id,
            "project_root": cwd,
            "cwd": cwd,
            "provider_preference": provider,
            "model_preference": model,
            "reasoning_effort": reasoning_effort,
            "approval_policy": approval_policy,
            "approvals_reviewer": approvals_reviewer,
            "sandbox_policy": sandbox_policy,
            "service_tier": service_tier,
            "collaboration_mode": collaboration_mode,
            "personality": personality,
            "metadata": continuation_metadata(metadata, thread_settings, imported_continuation),
            "turn_config": {
                "project_root": cwd,
                "cwd": cwd,
                "provider_preference": provider,
                "model_preference": model,
                "reasoning_effort": reasoning_effort,
                "reasoning_summary": reasoning_summary,
                "approval_policy": approval_policy,
                "approvals_reviewer": approvals_reviewer,
                "sandbox_policy": sandbox_policy,
                "active_permission_profile": active_permission_profile,
                "service_tier": service_tier,
                "collaboration_mode": collaboration_mode,
                "personality": personality,
                "metadata": continuation_metadata(metadata, thread_settings, imported_continuation)
            }
        }
    }));

    Some(RuntimeOptions {
        provider_preference: provider,
        model_preference: model,
        metadata: Some(continuation_metadata(
            metadata,
            thread_settings,
            imported_continuation,
        )),
        host_options: Some(host_options),
        ..RuntimeOptions::default()
    })
}

pub(super) fn merge_with_request_options(
    defaults: RuntimeOptions,
    request: Option<RuntimeOptions>,
) -> RuntimeOptions {
    let Some(request) = request else {
        return defaults;
    };

    RuntimeOptions {
        capability_id: request.capability_id.or(defaults.capability_id),
        stream: request.stream || defaults.stream,
        event_name: request.event_name.or(defaults.event_name),
        provider_preference: request.provider_preference.or(defaults.provider_preference),
        model_preference: request.model_preference.or(defaults.model_preference),
        metadata: merge_json_objects(defaults.metadata, request.metadata),
        queued_turn_id: request.queued_turn_id.or(defaults.queued_turn_id),
        host_options: merge_json_objects(defaults.host_options, request.host_options),
        expected_output: request.expected_output.or(defaults.expected_output),
        structured_output: request.structured_output.or(defaults.structured_output),
        output_schema: request.output_schema.or(defaults.output_schema),
    }
}

fn continuation_metadata(
    metadata: &Value,
    thread_settings: Option<&Value>,
    imported_continuation: Option<&Value>,
) -> Value {
    compact_json(json!({
        "imported": true,
        "sourceClient": string_alias(metadata, &["sourceClient", "source_client"]),
        "sourceThreadId": string_alias(metadata, &["sourceThreadId", "source_thread_id"]),
        "sourceRoot": string_alias(metadata, &["sourceRoot", "source_root"]),
        "sourcePath": string_alias(metadata, &["sourcePath", "source_path"]),
        "statePath": string_alias(metadata, &["statePath", "state_path"]),
        "threadSource": string_alias(metadata, &["threadSource", "thread_source"]),
        "memoryMode": string_alias(metadata, &["memoryMode", "memory_mode"]),
        "agentPath": string_alias(metadata, &["agentPath", "agent_path"]),
        "cliVersion": string_alias(metadata, &["cliVersion", "cli_version"]),
        "gitSha": string_alias(metadata, &["gitSha", "git_sha"]),
        "gitBranch": string_alias(metadata, &["gitBranch", "git_branch"]),
        "gitOriginUrl": string_alias(metadata, &["gitOriginUrl", "git_origin_url"]),
        "importedThreadSettings": thread_settings.cloned(),
        "importedContinuation": imported_continuation.cloned(),
    }))
}

fn string_alias(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn string_alias_from_sources(sources: &[Option<&Value>], keys: &[&str]) -> Option<String> {
    sources
        .iter()
        .filter_map(|source| *source)
        .find_map(|source| string_alias(source, keys))
}

fn value_alias_from_sources(sources: &[Option<&Value>], keys: &[&str]) -> Option<Value> {
    sources
        .iter()
        .filter_map(|source| *source)
        .find_map(|source| {
            keys.iter()
                .find_map(|key| source.get(*key))
                .filter(|value| !value.is_null())
                .cloned()
        })
}

fn merge_json_objects(defaults: Option<Value>, request: Option<Value>) -> Option<Value> {
    match (defaults, request) {
        (Some(Value::Object(mut defaults)), Some(Value::Object(request))) => {
            merge_object(&mut defaults, request);
            Some(Value::Object(defaults))
        }
        (_, Some(request)) => Some(request),
        (defaults, None) => defaults,
    }
}

fn merge_object(target: &mut Map<String, Value>, request: Map<String, Value>) {
    for (key, value) in request {
        match (target.get_mut(&key), value) {
            (Some(Value::Object(target)), Value::Object(request)) => {
                merge_object(target, request);
            }
            (_, value) => {
                target.insert(key, value);
            }
        }
    }
}

fn compact_json(value: Value) -> Value {
    match value {
        Value::Object(object) => {
            let mut compacted = Map::new();
            for (key, value) in object {
                let value = compact_json(value);
                if !value.is_null() {
                    compacted.insert(key, value);
                }
            }
            Value::Object(compacted)
        }
        Value::Array(values) => Value::Array(values.into_iter().map(compact_json).collect()),
        value => value,
    }
}
