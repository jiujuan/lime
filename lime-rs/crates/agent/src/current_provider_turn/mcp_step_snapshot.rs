use super::{is_web_tool, tool_executor::CurrentTurnToolExecutor};
use crate::model_request_policy::{
    native_tool_policy_disallowed_tool_names, native_tool_policy_from_turn_context,
};
use crate::protocol::AgentEvent;
use crate::request_tool_policy::{is_same_tool, RequestToolPolicy};
use crate::runtime_state::AgentRuntimeState;
use agent_protocol::ThreadId;
use agent_runtime::provider_turn::{
    RuntimeToolStepSnapshot, RuntimeToolStepSnapshotFuture, RuntimeToolStepSnapshotSource,
    RuntimeToolStepSnapshotSourceHandle,
};
use rmcp::model::CallToolResult;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc::UnboundedSender, Mutex};
use tool_runtime::native_dispatch::runtime_native_dispatch_definitions;
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_executor::RuntimeToolExecutorHandle;
use tool_runtime::tool_extension::RuntimeToolCaller;

const MCP_TOOL_DISCOVERY_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Default)]
pub(super) struct DeferredToolSelections(Arc<Mutex<HashSet<String>>>);

impl DeferredToolSelections {
    async fn snapshot(&self) -> HashSet<String> {
        self.0.lock().await.clone()
    }

    pub(super) async fn activate_from_tool_search_result(
        &self,
        result: &mut CallToolResult,
    ) -> bool {
        let Some(structured_content) = result.structured_content.as_mut() else {
            return false;
        };
        let matches = structured_content
            .get("matches")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>();
        let mut selected = self.0.lock().await;
        let updated = matches
            .into_iter()
            .fold(false, |updated, name| selected.insert(name) || updated);
        if let Some(object) = structured_content.as_object_mut() {
            object.insert("tool_surface_updated".to_string(), Value::Bool(updated));
        }
        updated
    }
}

pub(super) fn current_tool_step_snapshot_source(
    state: AgentRuntimeState,
    policy: RequestToolPolicy,
    turn_context: Option<agent_protocol::turn_context::TurnContextOverride>,
    event_sender: UnboundedSender<AgentEvent>,
    thread_id: ThreadId,
) -> RuntimeToolStepSnapshotSourceHandle {
    let deferred_tools = DeferredToolSelections::default();
    RuntimeToolStepSnapshotSourceHandle::new(Arc::new(CurrentTurnToolStepSnapshotSource {
        state,
        policy,
        turn_context,
        event_sender,
        thread_id,
        deferred_tools,
    }))
}

pub(super) async fn mcp_step_snapshot(
    state: &AgentRuntimeState,
    timeout_duration: Duration,
    deferred_tools: &DeferredToolSelections,
) -> tool_runtime::mcp_connection::McpStepSnapshot {
    state
        .mcp_connections()
        .step_snapshot(
            None,
            RuntimeToolCaller::assistant(),
            deferred_tools.snapshot().await,
            timeout_duration,
        )
        .await
}

fn tool_definitions(
    state: &AgentRuntimeState,
    policy: &RequestToolPolicy,
    turn_context: Option<&agent_protocol::turn_context::TurnContextOverride>,
    mcp_snapshot: &tool_runtime::mcp_connection::McpStepSnapshot,
) -> Vec<RuntimeToolDefinition> {
    let native_policy = native_tool_policy_from_turn_context(turn_context);
    let blocked_by_model = native_tool_policy_disallowed_tool_names(native_policy.as_ref())
        .into_iter()
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let mut definitions = runtime_native_dispatch_definitions();
    definitions.push(tool_runtime::request_user_input::request_user_input_tool_definition());
    definitions.extend(state.gateway_tools().definitions());
    definitions.extend(mcp_tool_definitions(mcp_snapshot));

    let mut seen = HashSet::new();
    definitions.retain(|definition| {
        let key = definition.name.to_ascii_lowercase();
        seen.insert(key)
            && !blocked_by_model
                .iter()
                .any(|name| is_same_tool(name, &definition.name))
            && !policy.matches_any_disallowed_tool(&definition.name)
            && (policy.allows_web_search() || !is_web_tool(&definition.name))
    });
    definitions.sort_by(|left, right| left.name.cmp(&right.name));
    definitions
}

fn mcp_tool_definitions(
    snapshot: &tool_runtime::mcp_connection::McpStepSnapshot,
) -> Vec<RuntimeToolDefinition> {
    snapshot
        .tools()
        .iter()
        .map(|tool| RuntimeToolDefinition {
            name: tool.name.to_string(),
            description: tool
                .description
                .clone()
                .map(|value| value.to_string())
                .unwrap_or_default(),
            input_schema: Value::Object((*tool.input_schema).clone()),
        })
        .collect()
}

#[derive(Clone)]
struct CurrentTurnToolStepSnapshotSource {
    state: AgentRuntimeState,
    policy: RequestToolPolicy,
    turn_context: Option<agent_protocol::turn_context::TurnContextOverride>,
    event_sender: UnboundedSender<AgentEvent>,
    thread_id: ThreadId,
    deferred_tools: DeferredToolSelections,
}

impl RuntimeToolStepSnapshotSource for CurrentTurnToolStepSnapshotSource {
    fn capture(&self) -> RuntimeToolStepSnapshotFuture<'_> {
        Box::pin(async move {
            let mcp_snapshot = mcp_step_snapshot(
                &self.state,
                MCP_TOOL_DISCOVERY_TIMEOUT,
                &self.deferred_tools,
            )
            .await;
            let definitions = tool_definitions(
                &self.state,
                &self.policy,
                self.turn_context.as_ref(),
                &mcp_snapshot,
            );
            let executor = RuntimeToolExecutorHandle::new(Arc::new(CurrentTurnToolExecutor {
                state: self.state.clone(),
                policy: self.policy.clone(),
                event_sender: self.event_sender.clone(),
                thread_id: self.thread_id.clone(),
                mcp_snapshot,
                deferred_tools: self.deferred_tools.clone(),
            }));
            Ok(RuntimeToolStepSnapshot::new(definitions, executor))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn deferred_tool_selections_are_turn_local_and_report_real_updates() {
        let first_turn = DeferredToolSelections::default();
        let second_turn = DeferredToolSelections::default();
        let mut result = CallToolResult::success(Vec::new());
        result.structured_content = Some(serde_json::json!({
            "matches": ["docs__query", "docs__query", "  "],
            "tool_surface_updated": false
        }));

        assert!(
            first_turn
                .activate_from_tool_search_result(&mut result)
                .await
        );
        assert_eq!(
            result
                .structured_content
                .as_ref()
                .and_then(|value| value.get("tool_surface_updated")),
            Some(&Value::Bool(true))
        );
        assert_eq!(
            first_turn.snapshot().await,
            HashSet::from(["docs__query".to_string()])
        );
        assert!(second_turn.snapshot().await.is_empty());

        assert!(
            !first_turn
                .activate_from_tool_search_result(&mut result)
                .await
        );
        assert_eq!(
            result
                .structured_content
                .as_ref()
                .and_then(|value| value.get("tool_surface_updated")),
            Some(&Value::Bool(false))
        );
    }
}
