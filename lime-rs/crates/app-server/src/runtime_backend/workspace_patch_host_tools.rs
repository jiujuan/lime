use crate::ExecutionRequest;
use crate::RuntimeEvent;
use lime_agent::agent_tools::workspace_patch_host::{
    enrich_workspace_patch_host_tool_payload, update_workspace_patch_with_host_tool_evidence,
};
pub(super) use lime_agent::agent_tools::workspace_patch_host::{
    BoundWorkspacePatchHostToolRequest, WorkspacePatchHostToolPlan,
    WORKSPACE_PATCH_HOST_TOOL_EVENT_SOURCE,
};
use lime_agent::{
    insert_agent_turn_metadata, set_agent_turn_user_visible_input_text, AgentTurnContext,
};
use serde_json::{json, Value};

use super::request_context::{self, RuntimeModelSelection, RuntimeSessionScope};
use app_server_protocol::RuntimeRequest;

pub(super) fn workspace_patch_host_tool_plan_from_events(
    events: &[RuntimeEvent],
) -> Option<WorkspacePatchHostToolPlan> {
    let patch = workspace_patch_from_events(events)?;
    WorkspacePatchHostToolPlan::from_patch(&patch)
}

pub(super) fn workspace_patch_host_tool_turn_context(
    request: &ExecutionRequest,
    host_request: Option<&RuntimeRequest>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
    config_metadata: Option<Value>,
) -> AgentTurnContext {
    let mut context = request_context::turn_context_from_request(
        request,
        host_request,
        scope,
        selection,
        config_metadata,
    )
    .unwrap_or_default();
    insert_agent_turn_metadata(&mut context, "web_search_enabled", json!(true));
    insert_agent_turn_metadata(&mut context, "webSearchEnabled", json!(true));
    set_agent_turn_user_visible_input_text(&mut context, Some(request.input.concat_text()));
    context
}

pub(super) fn workspace_patch_host_tool_runtime_event(
    event: lime_agent::AgentEvent,
    requests: &[BoundWorkspacePatchHostToolRequest],
) -> Option<RuntimeEvent> {
    let (event_type, item) = match event {
        lime_agent::AgentEvent::ItemStarted { item } => ("item.started", item),
        lime_agent::AgentEvent::ItemCompleted { item } => ("item.completed", item),
        _ => return None,
    };
    let mut payload = json!({ "item": item });
    enrich_workspace_patch_host_tool_payload(&mut payload, requests);
    Some(RuntimeEvent::new(event_type, payload))
}

pub(super) fn update_workspace_patch_host_tool_artifact_events(
    events: &mut [RuntimeEvent],
    host_tool_evidence: &[Value],
) {
    for event in events {
        if event.event_type != "artifact.snapshot" {
            continue;
        }
        let Some(artifact) = event.payload.get_mut("artifact") else {
            continue;
        };
        let Some(metadata) = artifact.get_mut("metadata").and_then(Value::as_object_mut) else {
            continue;
        };
        let patch = if let Some(patch) = metadata.get_mut("contentFactoryWorkspacePatch") {
            patch
        } else if let Some(patch) = metadata.get_mut("workspace_patch") {
            patch
        } else {
            continue;
        };
        update_workspace_patch_with_host_tool_evidence(patch, host_tool_evidence);
        if let Some(content) = serde_json::to_string(patch).ok() {
            artifact
                .as_object_mut()
                .map(|object| object.insert("content".to_string(), Value::String(content)));
        }
    }
}

fn workspace_patch_from_events(events: &[RuntimeEvent]) -> Option<Value> {
    events.iter().find_map(|event| {
        if event.event_type != "artifact.snapshot" {
            return None;
        }
        let artifact = event.payload.get("artifact")?;
        artifact
            .get("metadata")
            .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
            .cloned()
            .or_else(|| artifact.get("contentFactoryWorkspacePatch").cloned())
            .or_else(|| {
                artifact
                    .get("metadata")
                    .and_then(|metadata| metadata.get("workspace_patch"))
                    .cloned()
            })
    })
}
