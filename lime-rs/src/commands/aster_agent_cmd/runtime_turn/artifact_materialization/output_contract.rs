use super::super::runtime_turn_agent_app_skill_contract::resolve_agent_app_required_skill_tool_allowlist;
use super::*;

pub(super) fn metadata_value_at_path<'a>(
    request_metadata: Option<&'a serde_json::Value>,
    path: &[&str],
) -> Option<&'a serde_json::Value> {
    let mut current = request_metadata?;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

pub(super) fn metadata_string_at_paths(
    request_metadata: Option<&serde_json::Value>,
    paths: &[&[&str]],
) -> Option<String> {
    paths.iter().find_map(|path| {
        metadata_value_at_path(request_metadata, path)
            .and_then(serde_json::Value::as_str)
            .and_then(|value| non_empty_projection_text(Some(value)))
    })
}

pub(super) fn resolve_agent_app_output_contract_value(
    request_metadata: Option<&serde_json::Value>,
) -> Option<serde_json::Value> {
    [
        &["harness", "agent_app_runtime_output_contract"][..],
        &["harness", "agentAppRuntimeOutputContract"][..],
        &["harness", "agent_app_runtime", "output_contract"][..],
        &["harness", "agentAppRuntime", "outputContract"][..],
        &["agent_app_runtime_output_contract"][..],
        &["agentAppRuntimeOutputContract"][..],
        &["agent_app_runtime", "output_contract"][..],
        &["agentAppRuntime", "outputContract"][..],
        &["outputContract"][..],
        &["output_contract"][..],
    ]
    .iter()
    .find_map(|path| metadata_value_at_path(request_metadata, path))
    .filter(|value| value.is_object())
    .cloned()
}

pub(super) fn value_string_at_nested_paths(
    value: &serde_json::Value,
    paths: &[&[&str]],
) -> Option<String> {
    paths.iter().find_map(|path| {
        let mut current = value;
        for key in path.iter() {
            current = current.get(*key)?;
        }
        current
            .as_str()
            .and_then(|text| non_empty_projection_text(Some(text)))
    })
}

pub(super) fn resolve_agent_app_output_contract_artifact_kind(
    output_contract: &serde_json::Value,
) -> Option<String> {
    value_string_at_nested_paths(
        output_contract,
        &[
            &["artifact_kind"][..],
            &["artifactKind"][..],
            &["output_kind"][..],
            &["outputKind"][..],
            &["artifact_type"][..],
            &["artifactType"][..],
            &["workspacePatchContract", "artifactKind"][..],
            &["workspace_patch_contract", "artifact_kind"][..],
            &["requiredEnvelope", "artifactKind"][..],
            &["required_envelope", "artifact_kind"][..],
        ],
    )
}

pub(super) fn resolve_agent_app_content_factory_project_id(
    request_metadata: Option<&serde_json::Value>,
) -> String {
    metadata_string_at_paths(
        request_metadata,
        &[
            &["contentFactory", "projectId"][..],
            &["contentFactory", "project_id"][..],
            &["content_factory", "projectId"][..],
            &["content_factory", "project_id"][..],
            &["harness", "contentFactory", "projectId"][..],
            &["harness", "contentFactory", "project_id"][..],
            &["harness", "content_factory", "project_id"][..],
            &["harness", "agent_app_runtime_output_contract", "project_id"][..],
            &["harness", "agentAppRuntimeOutputContract", "projectId"][..],
            &[
                "harness",
                "agent_app_runtime",
                "output_contract",
                "project_id",
            ][..],
            &["harness", "agentAppRuntime", "outputContract", "projectId"][..],
            &["agent_app_runtime_output_contract", "project_id"][..],
            &["agentAppRuntimeOutputContract", "projectId"][..],
            &["agent_app_runtime", "output_contract", "project_id"][..],
            &["agentAppRuntime", "outputContract", "projectId"][..],
            &["projectId"][..],
            &["project_id"][..],
        ],
    )
    .unwrap_or_else(|| "unknown-project".to_string())
}

pub(super) fn resolve_agent_app_runtime_metadata_text(
    request_metadata: Option<&serde_json::Value>,
    snake_key: &str,
    camel_key: &str,
) -> Option<String> {
    metadata_string_at_paths(
        request_metadata,
        &[
            &["harness", "agent_app_runtime", snake_key][..],
            &["harness", "agentAppRuntime", camel_key][..],
            &["agent_app_runtime", snake_key][..],
            &["agentAppRuntime", camel_key][..],
            &["agentRuntime", camel_key][..],
            &["contentFactory", camel_key][..],
            &["lime_runtime", snake_key][..],
            &["limeRuntime", camel_key][..],
        ],
    )
}

pub(super) fn is_content_factory_agent_app_output_contract(
    request_metadata: Option<&serde_json::Value>,
    output_contract: &serde_json::Value,
) -> bool {
    let app_id = resolve_agent_app_runtime_metadata_text(request_metadata, "app_id", "appId");
    let task_kind =
        resolve_agent_app_runtime_metadata_text(request_metadata, "task_kind", "taskKind");
    let artifact_metadata_kind = value_string_at_nested_paths(
        output_contract,
        &[&["artifact_metadata_kind"][..], &["kind"][..]],
    );

    app_id.as_deref() == Some("content-factory-app")
        || task_kind
            .as_deref()
            .is_some_and(|value| value.trim().starts_with("content_factory."))
        || artifact_metadata_kind
            .as_deref()
            .is_some_and(|value| value.trim() == "content_factory.workspace_patch")
}

pub(super) fn is_agent_app_report_output_kind(artifact_kind: &str) -> bool {
    matches!(artifact_kind.trim(), "strategy_report" | "review_report")
}

pub(super) fn is_agent_app_draft_materialization_output_kind(artifact_kind: &str) -> bool {
    matches!(artifact_kind.trim(), "script_batch" | "prompt_batch")
}

pub(super) fn collect_agent_app_required_skill_names(
    request_metadata: Option<&serde_json::Value>,
) -> Vec<String> {
    resolve_agent_app_required_skill_tool_allowlist(request_metadata).unwrap_or_default()
}
