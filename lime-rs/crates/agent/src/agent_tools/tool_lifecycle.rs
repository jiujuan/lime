use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentToolResult};
use serde_json::{json, Value};
use std::collections::HashMap;
use tool_runtime::execution_approval::execution_approval_projection;
use tool_runtime::execution_process::ExecutionOutputDelta;
use tool_runtime::tool_batch::{
    PlannedToolExecution, ToolExecutionOutcome, ToolTerminalEventUpdate,
};

const TOOL_CONFIRMATION_ACTION_TYPE: &str = "tool_confirmation";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolExecutionLifecycleState {
    Active,
    AwaitingApproval,
    ApprovalDenied,
    Blocked,
    Terminal,
}

#[derive(Debug, Default)]
pub(crate) struct ToolExecutionLifecycleEvents {
    states: HashMap<String, ToolExecutionLifecycleState>,
}

impl ToolExecutionLifecycleEvents {
    pub fn start_event(&mut self, planned: &PlannedToolExecution) -> RuntimeAgentEvent {
        self.set_state(&planned.tool_id, ToolExecutionLifecycleState::Active);
        tool_start_event_from_planned(planned)
    }

    pub fn outcome_events(
        &mut self,
        outcome: &ToolExecutionOutcome<RuntimeAgentEvent>,
    ) -> Vec<RuntimeAgentEvent> {
        let action_required = ToolApprovalActionSnapshot::from_outcome(outcome);
        let resolution = ToolApprovalResolutionSnapshot::from_outcome(outcome);
        let lifecycle_tool_id = action_required
            .as_ref()
            .map(|action| action.tool_id.clone())
            .or_else(|| {
                resolution
                    .as_ref()
                    .map(|resolution| resolution.tool_id.clone())
            })
            .unwrap_or_else(|| outcome.tool_id.clone());

        if self.is_terminal(&lifecycle_tool_id) {
            return Vec::new();
        }

        let terminal =
            ToolExecutionTerminalSnapshot::from_outcome_with_tool_id(outcome, &lifecycle_tool_id);
        let mut events = Vec::new();

        if let Some(action_required) = action_required {
            if self.is_awaiting_approval(&action_required.tool_id) {
                return Vec::new();
            }
            self.set_state(
                &action_required.tool_id,
                ToolExecutionLifecycleState::AwaitingApproval,
            );
            events.push(action_required.into_action_required_event());
            return events;
        }

        if self.is_awaiting_approval(&lifecycle_tool_id) {
            let Some(resolution) = resolution else {
                return Vec::new();
            };
            let Some(resolved_event) = self.approval_resolved_event(resolution) else {
                return Vec::new();
            };
            events.push(resolved_event);
        }

        if terminal.block_decision.is_some() {
            self.set_state(&lifecycle_tool_id, ToolExecutionLifecycleState::Blocked);
        } else if self.is_approval_denied(&lifecycle_tool_id) {
            if outcome.success {
                return events;
            }
        } else if self.can_emit_stream_events(&lifecycle_tool_id) {
            events.extend(outcome.stream_events.clone());
        }

        events.push(terminal.into_tool_end_event());
        self.set_state(&lifecycle_tool_id, ToolExecutionLifecycleState::Terminal);
        events
    }

    fn approval_resolved_event(
        &mut self,
        resolution: ToolApprovalResolutionSnapshot,
    ) -> Option<RuntimeAgentEvent> {
        if !self.is_awaiting_approval(&resolution.tool_id) {
            return None;
        }

        let state = if resolution.confirmed {
            ToolExecutionLifecycleState::Active
        } else {
            ToolExecutionLifecycleState::ApprovalDenied
        };
        self.set_state(&resolution.tool_id, state);
        Some(resolution.into_action_resolved_event())
    }

    fn can_emit_stream_events(&self, tool_id: &str) -> bool {
        matches!(
            self.states.get(tool_id),
            Some(ToolExecutionLifecycleState::Active)
        )
    }

    fn is_terminal(&self, tool_id: &str) -> bool {
        matches!(
            self.states.get(tool_id),
            Some(ToolExecutionLifecycleState::Terminal)
        )
    }

    fn is_awaiting_approval(&self, tool_id: &str) -> bool {
        matches!(
            self.states.get(tool_id),
            Some(ToolExecutionLifecycleState::AwaitingApproval)
        )
    }

    fn is_approval_denied(&self, tool_id: &str) -> bool {
        matches!(
            self.states.get(tool_id),
            Some(ToolExecutionLifecycleState::ApprovalDenied)
        )
    }

    fn set_state(&mut self, tool_id: &str, state: ToolExecutionLifecycleState) {
        self.states.insert(tool_id.to_string(), state);
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolExecutionLifecycleSnapshot {
    pub tool_name: String,
    pub tool_id: String,
    pub arguments: Option<String>,
}

impl ToolExecutionLifecycleSnapshot {
    pub fn from_planned(planned: &PlannedToolExecution) -> Self {
        Self {
            tool_name: planned.tool_name.clone(),
            tool_id: planned.tool_id.clone(),
            arguments: planned.arguments.clone(),
        }
    }

    pub fn into_tool_start_event(self) -> RuntimeAgentEvent {
        RuntimeAgentEvent::ToolStart {
            tool_name: self.tool_name,
            tool_id: self.tool_id,
            arguments: self.arguments,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolApprovalActionSnapshot {
    pub tool_id: String,
    pub request_id: String,
    pub tool_name: String,
    pub metadata: HashMap<String, Value>,
}

impl ToolApprovalActionSnapshot {
    pub fn from_outcome(outcome: &ToolExecutionOutcome<RuntimeAgentEvent>) -> Option<Self> {
        let metadata = outcome.metadata.as_ref()?;
        if metadata.get("eventClass").and_then(Value::as_str) != Some("action.required") {
            return None;
        }

        let tool_id = metadata_string(
            metadata,
            &["toolCallId", "tool_call_id", "toolId", "tool_id"],
        )
        .unwrap_or_else(|| outcome.tool_id.clone());
        let request_id = metadata_string(
            metadata,
            &[
                "actionId",
                "action_id",
                "requestId",
                "request_id",
                "approvalActionId",
                "approval_action_id",
            ],
        )
        .unwrap_or_else(|| tool_id.clone());

        Some(Self {
            tool_id,
            request_id,
            tool_name: outcome.tool_name.clone(),
            metadata: metadata.clone(),
        })
    }

    pub fn into_action_required_event(self) -> RuntimeAgentEvent {
        let approval = execution_approval_projection(&self.tool_name, &self.metadata);
        RuntimeAgentEvent::ActionRequired {
            request_id: self.request_id,
            action_type: TOOL_CONFIRMATION_ACTION_TYPE.to_string(),
            data: json!({
                "toolCallId": self.tool_id,
                "toolName": self.tool_name,
                "toolFamily": approval.tool_family.clone(),
                "tool_family": approval.tool_family.clone(),
                "actionType": TOOL_CONFIRMATION_ACTION_TYPE,
                "actionKind": approval.action_kind.clone(),
                "action_kind": approval.action_kind,
                "availableDecisions": approval.available_decisions,
                "runtime_contract": approval.runtime_contract.clone(),
                "contractKey": approval.contract_key.clone(),
                "contract_key": approval.contract_key,
                "approvalScope": approval.approval_scope.clone(),
                "approval_scope": approval.approval_scope,
                "reasonCode": self.metadata.get("reasonCode").cloned(),
                "reason": self.metadata.get("reason").cloned(),
                "command": self.metadata.get("command").cloned(),
                "cwd": self.metadata.get("cwd").cloned(),
                "approvalPolicy": self.metadata.get("approvalPolicy").cloned(),
                "requestedSandboxPolicy": self.metadata.get("requestedSandboxPolicy").cloned(),
                "policy": self.metadata,
            }),
            scope: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolApprovalResolutionSnapshot {
    pub tool_id: String,
    pub request_id: String,
    pub confirmed: bool,
}

impl ToolApprovalResolutionSnapshot {
    pub fn from_outcome(outcome: &ToolExecutionOutcome<RuntimeAgentEvent>) -> Option<Self> {
        let metadata = outcome.metadata.as_ref()?;
        let event_class = metadata_string(metadata, &["actionEventClass", "action_event_class"])
            .or_else(|| metadata_string(metadata, &["eventClass", "event_class"]));
        if event_class.as_deref() != Some("action.resolved") {
            return None;
        }

        Some(Self {
            tool_id: metadata_string(
                metadata,
                &["toolCallId", "tool_call_id", "toolId", "tool_id"],
            )
            .unwrap_or_else(|| outcome.tool_id.clone()),
            request_id: metadata_string(
                metadata,
                &[
                    "actionId",
                    "action_id",
                    "requestId",
                    "request_id",
                    "approvalActionId",
                    "approval_action_id",
                ],
            )
            .unwrap_or_else(|| outcome.tool_id.clone()),
            confirmed: metadata_bool(metadata, &["confirmed", "approvalConfirmed"])
                .unwrap_or_else(|| metadata_decision_confirms(metadata)),
        })
    }

    pub fn into_action_resolved_event(self) -> RuntimeAgentEvent {
        let decision = if self.confirmed { "approve" } else { "deny" };
        let tool_id = self.tool_id;
        let request_id = self.request_id;
        RuntimeAgentEvent::ActionResolved {
            request_id: request_id.clone(),
            action_type: "tool_confirmation".to_string(),
            data: json!({
                "toolCallId": tool_id.clone(),
                "toolId": tool_id.clone(),
                "tool_id": tool_id,
                "requestId": request_id.clone(),
                "actionId": request_id,
                "actionType": "tool_confirmation",
                "confirmed": self.confirmed,
                "decision": decision,
            }),
            scope: None,
        }
    }
}

fn metadata_string(metadata: &HashMap<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn metadata_bool(metadata: &HashMap<String, Value>, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_bool)
}

fn metadata_decision_confirms(metadata: &HashMap<String, Value>) -> bool {
    metadata_string(metadata, &["decision", "status", "result"])
        .map(|value| {
            !matches!(
                value.as_str(),
                "deny" | "denied" | "reject" | "rejected" | "cancel" | "canceled" | "cancelled"
            )
        })
        .unwrap_or(true)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolBlockDecisionKind {
    PermissionDenied,
    SandboxBlocked,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolSandboxDecisionSnapshot {
    pub kind: ToolBlockDecisionKind,
    pub reason_code: Option<String>,
    pub reason: Option<String>,
}

impl ToolSandboxDecisionSnapshot {
    pub fn from_metadata(metadata: &HashMap<String, Value>) -> Option<Self> {
        let kind = match metadata.get("eventClass").and_then(Value::as_str) {
            Some("permission.denied") => ToolBlockDecisionKind::PermissionDenied,
            Some("sandbox.blocked") => ToolBlockDecisionKind::SandboxBlocked,
            _ => return None,
        };

        Some(Self {
            kind,
            reason_code: metadata
                .get("reasonCode")
                .and_then(Value::as_str)
                .map(str::to_string),
            reason: metadata
                .get("reason")
                .and_then(Value::as_str)
                .map(str::to_string),
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolExecutionTerminalSnapshot {
    pub tool_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub metadata: Option<HashMap<String, Value>>,
    pub block_decision: Option<ToolSandboxDecisionSnapshot>,
}

impl ToolExecutionTerminalSnapshot {
    #[cfg(test)]
    pub fn from_outcome(outcome: &ToolExecutionOutcome<RuntimeAgentEvent>) -> Self {
        Self::from_outcome_with_tool_id(outcome, &outcome.tool_id)
    }

    fn from_outcome_with_tool_id(
        outcome: &ToolExecutionOutcome<RuntimeAgentEvent>,
        tool_id: &str,
    ) -> Self {
        Self::new(
            tool_id.to_string(),
            outcome.success,
            outcome.output.clone(),
            outcome.error.clone(),
            outcome.metadata.clone(),
        )
    }

    pub fn from_update(update: &ToolTerminalEventUpdate) -> Self {
        Self::new(
            update.tool_id.clone(),
            update.success,
            update.output.clone(),
            update.error.clone(),
            update.metadata.clone(),
        )
    }

    pub fn into_tool_end_event(self) -> RuntimeAgentEvent {
        RuntimeAgentEvent::ToolEnd {
            tool_id: self.tool_id,
            result: AgentToolResult {
                success: self.success,
                output: self.output,
                error: self.error,
                structured_content: None,
                images: None,
                metadata: self.metadata,
            },
        }
    }

    fn new(
        tool_id: String,
        success: bool,
        output: String,
        error: Option<String>,
        metadata: Option<HashMap<String, Value>>,
    ) -> Self {
        let metadata = Some(normalize_tool_terminal_metadata(&tool_id, metadata));
        let block_decision = metadata
            .as_ref()
            .and_then(ToolSandboxDecisionSnapshot::from_metadata);
        Self {
            tool_id,
            success,
            output,
            error,
            metadata,
            block_decision,
        }
    }
}

fn normalize_tool_terminal_metadata(
    tool_id: &str,
    metadata: Option<HashMap<String, Value>>,
) -> HashMap<String, Value> {
    let mut metadata = metadata.unwrap_or_default();
    insert_tool_correlation_metadata(tool_id, &mut metadata);
    metadata
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolProcessLifecycleSnapshot {
    pub tool_id: String,
    pub metadata: HashMap<String, Value>,
}

impl ToolProcessLifecycleSnapshot {
    pub fn from_metadata(tool_id: &str, mut metadata: HashMap<String, Value>) -> Self {
        insert_tool_correlation_metadata(tool_id, &mut metadata);
        metadata.insert("executionSurface".to_string(), json!("live_process"));
        Self {
            tool_id: tool_id.to_string(),
            metadata,
        }
    }

    pub fn into_output_delta_event(self) -> RuntimeAgentEvent {
        RuntimeAgentEvent::ToolOutputDelta {
            tool_id: self.tool_id,
            delta: String::new(),
            output_kind: Some("process".to_string()),
            metadata: Some(self.metadata),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolExecutionOutputDeltaSnapshot {
    pub tool_id: String,
    pub delta: String,
    pub output_kind: String,
    pub metadata: HashMap<String, Value>,
}

impl ToolExecutionOutputDeltaSnapshot {
    pub fn from_process_delta(delta: ExecutionOutputDelta) -> Self {
        let tool_id = delta.tool_id.clone();
        let output_kind = delta.kind.label().to_string();
        let output_delta = delta.delta.clone();
        let mut metadata = delta.metadata();
        insert_tool_correlation_metadata(&tool_id, &mut metadata);
        metadata.insert("executionSurface".to_string(), json!("live_process"));
        Self {
            tool_id,
            delta: output_delta,
            output_kind,
            metadata,
        }
    }

    pub fn into_output_delta_event(self) -> RuntimeAgentEvent {
        RuntimeAgentEvent::ToolOutputDelta {
            tool_id: self.tool_id,
            delta: self.delta,
            output_kind: Some(self.output_kind),
            metadata: Some(self.metadata),
        }
    }
}

pub fn tool_start_event_from_planned(planned: &PlannedToolExecution) -> RuntimeAgentEvent {
    ToolExecutionLifecycleSnapshot::from_planned(planned).into_tool_start_event()
}

pub fn tool_end_event_from_update(update: &ToolTerminalEventUpdate) -> RuntimeAgentEvent {
    ToolExecutionTerminalSnapshot::from_update(update).into_tool_end_event()
}

pub fn tool_process_lifecycle_event_from_metadata(
    tool_id: &str,
    metadata: HashMap<String, Value>,
) -> RuntimeAgentEvent {
    ToolProcessLifecycleSnapshot::from_metadata(tool_id, metadata).into_output_delta_event()
}

pub fn tool_output_delta_event_from_process_delta(
    delta: ExecutionOutputDelta,
) -> RuntimeAgentEvent {
    ToolExecutionOutputDeltaSnapshot::from_process_delta(delta).into_output_delta_event()
}

fn insert_tool_correlation_metadata(tool_id: &str, metadata: &mut HashMap<String, Value>) {
    metadata
        .entry("toolCallId".to_string())
        .or_insert_with(|| json!(tool_id));
    metadata
        .entry("toolId".to_string())
        .or_insert_with(|| json!(tool_id));
    metadata
        .entry("tool_id".to_string())
        .or_insert_with(|| json!(tool_id));
}

#[cfg(test)]
mod tests;
