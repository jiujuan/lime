use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use uuid::Uuid;

pub(crate) const LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION: &str = "lime-profile-0.4.0";
pub(crate) const LIME_AGENT_RUNTIME_ID: &str = "lime_runtime_local";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentRuntimeProfileEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub event_id: String,
    pub timestamp: String,
    pub schema_version: String,
    pub runtime_id: String,
    pub session_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub sequence: u64,
    pub trace_id: String,
    pub payload: Value,
}

#[derive(Debug, Clone)]
pub(crate) struct AgentRuntimeProfileStream {
    session_id: String,
    thread_id: String,
    turn_id: String,
    trace_id: String,
    sequence: Arc<AtomicU64>,
}

impl AgentRuntimeProfileStream {
    pub(crate) fn new(
        session_id: impl Into<String>,
        thread_id: impl Into<String>,
        turn_id: impl Into<String>,
    ) -> Result<Self, String> {
        let session_id = normalize_required_id(session_id.into(), "sessionId")?;
        let thread_id = normalize_required_id(thread_id.into(), "threadId")?;
        let turn_id = normalize_required_id(turn_id.into(), "turnId")?;

        Ok(Self {
            trace_id: format!("trace_{turn_id}"),
            session_id,
            thread_id,
            turn_id,
            sequence: Arc::new(AtomicU64::new(0)),
        })
    }

    pub(crate) fn turn_submitted(&self, source: &str) -> AgentRuntimeProfileEvent {
        self.next_event(
            "turn.submitted",
            json!({
                "inputRef": format!("input://{}/user", self.turn_id),
                "source": normalize_optional_label(source, "workspace"),
                "status": "accepted",
            }),
        )
    }

    pub(crate) fn turn_started(&self) -> AgentRuntimeProfileEvent {
        self.next_event(
            "turn.started",
            json!({
                "status": "running",
            }),
        )
    }

    pub(crate) fn model_requested(
        &self,
        provider_selector: &str,
        provider_name: &str,
        model_name: &str,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "model.requested",
            json!({
                "providerSelector": normalize_optional_label(provider_selector, "unconfigured"),
                "providerName": normalize_optional_label(provider_name, "unconfigured"),
                "modelName": normalize_optional_label(model_name, "unconfigured"),
                "status": "started",
            }),
        )
    }

    pub(crate) fn model_completed(
        &self,
        provider_selector: &str,
        provider_name: &str,
        model_name: &str,
        output_chars: usize,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "model.completed",
            json!({
                "providerSelector": normalize_optional_label(provider_selector, "unconfigured"),
                "providerName": normalize_optional_label(provider_name, "unconfigured"),
                "modelName": normalize_optional_label(model_name, "unconfigured"),
                "outputChars": output_chars,
                "status": "completed",
            }),
        )
    }

    pub(crate) fn model_failed(
        &self,
        provider_selector: &str,
        provider_name: &str,
        model_name: &str,
        failure_category: &str,
        message: &str,
        retryable: bool,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "model.failed",
            json!({
                "providerSelector": normalize_optional_label(provider_selector, "unconfigured"),
                "providerName": normalize_optional_label(provider_name, "unconfigured"),
                "modelName": normalize_optional_label(model_name, "unconfigured"),
                "failureCategory": normalize_optional_label(failure_category, "unknown"),
                "message": message,
                "retryable": retryable,
                "status": "failed",
            }),
        )
    }

    pub(crate) fn turn_completed(&self) -> AgentRuntimeProfileEvent {
        self.next_event(
            "turn.completed",
            json!({
                "status": "completed",
            }),
        )
    }

    pub(crate) fn turn_failed(
        &self,
        failure_category: &str,
        message: &str,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "turn.failed",
            json!({
                "failureCategory": normalize_optional_label(failure_category, "unknown"),
                "message": message,
                "status": "failed",
            }),
        )
    }

    pub(crate) fn snapshot_updated(&self, status: &str) -> AgentRuntimeProfileEvent {
        self.next_event(
            "snapshot.updated",
            json!({
                "source": "thread_read_model",
                "status": normalize_optional_label(status, "updated"),
            }),
        )
    }

    pub(crate) fn permission_evaluated(
        &self,
        decision_id: &str,
        result: &str,
        scope: Value,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "permission.evaluated",
            json!({
                "decisionId": normalize_optional_label(decision_id, "policy_decision_unavailable"),
                "result": normalize_policy_result(result),
                "scope": scope,
                "owner": "AgentPolicy",
            }),
        )
    }

    pub(crate) fn action_required(
        &self,
        action_id: &str,
        tool_call_id: Option<&str>,
        action_type: &str,
        decision_kind: &str,
        scope: Value,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "action.required",
            json!({
                "actionId": normalize_optional_label(action_id, "action_unavailable"),
                "toolCallId": normalize_optional_label_option(tool_call_id),
                "actionType": normalize_optional_label(action_type, "approval"),
                "decisionKind": normalize_optional_label(decision_kind, "ask"),
                "scope": scope,
                "status": "pending",
                "owner": "AgentPolicy",
            }),
        )
    }

    pub(crate) fn action_resolved(
        &self,
        action_id: &str,
        result: &str,
        confirmed: bool,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "action.resolved",
            json!({
                "actionId": normalize_optional_label(action_id, "action_unavailable"),
                "result": normalize_policy_result(result),
                "confirmed": confirmed,
                "status": "resolved",
                "owner": "AgentPolicy",
            }),
        )
    }

    pub(crate) fn tool_started(
        &self,
        tool_call_id: &str,
        tool_name: &str,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "tool.started",
            json!({
                "toolCallId": normalize_optional_label(tool_call_id, "tool_call_unavailable"),
                "toolName": normalize_optional_label(tool_name, "unknown_tool"),
                "status": "running",
            }),
        )
    }

    pub(crate) fn tool_result(
        &self,
        tool_call_id: &str,
        tool_name: &str,
        success: bool,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "tool.result",
            json!({
                "toolCallId": normalize_optional_label(tool_call_id, "tool_call_unavailable"),
                "toolName": normalize_optional_label(tool_name, "unknown_tool"),
                "success": success,
                "status": "completed",
            }),
        )
    }

    pub(crate) fn tool_failed(
        &self,
        tool_call_id: &str,
        tool_name: &str,
        failure_category: &str,
        message: &str,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "tool.failed",
            json!({
                "toolCallId": normalize_optional_label(tool_call_id, "tool_call_unavailable"),
                "toolName": normalize_optional_label(tool_name, "unknown_tool"),
                "failureCategory": normalize_optional_label(failure_category, "tool_error"),
                "message": message,
                "status": "failed",
            }),
        )
    }

    pub(crate) fn task_profile_resolved(
        &self,
        task_kind: Option<&str>,
        service_model_slot: Option<&str>,
        routing_mode: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "task.profile.resolved",
            json!({
                "taskKind": normalize_optional_label_option(task_kind),
                "serviceModelSlot": normalize_optional_label_option(service_model_slot),
                "routingMode": normalize_optional_label_option(routing_mode),
                "status": "resolved",
            }),
        )
    }

    pub(crate) fn routing_single_candidate(
        &self,
        task_kind: Option<&str>,
        candidate_count: u32,
        selected_model: Option<&str>,
        decision_source: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "routing.single_candidate",
            json!({
                "taskKind": normalize_optional_label_option(task_kind),
                "candidateCount": candidate_count,
                "selectedModel": normalize_optional_label_option(selected_model),
                "decisionSource": normalize_optional_label_option(decision_source),
                "status": "selected",
            }),
        )
    }

    pub(crate) fn cost_estimated(
        &self,
        estimated_cost_class: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "cost.estimated",
            json!({
                "estimatedCostClass": normalize_optional_label_option(estimated_cost_class),
                "status": "recorded",
            }),
        )
    }

    pub(crate) fn limit_changed(
        &self,
        limit_status: Option<&str>,
        single_candidate_only: Option<bool>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "limit.changed",
            json!({
                "limitStatus": normalize_optional_label_option(limit_status),
                "singleCandidateOnly": single_candidate_only,
                "status": "changed",
            }),
        )
    }

    pub(crate) fn task_created(
        &self,
        task_id: &str,
        task_kind: Option<&str>,
        source: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "task.created",
            json!({
                "taskId": normalize_optional_label(task_id, "task_unavailable"),
                "taskKind": normalize_optional_label_option(task_kind),
                "source": normalize_optional_label_option(source),
                "status": "created",
            }),
        )
    }

    pub(crate) fn task_attempt_started(
        &self,
        task_id: &str,
        run_id: &str,
        attempt_id: &str,
        attempt_index: usize,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "task.attempt.started",
            json!({
                "taskId": normalize_optional_label(task_id, "task_unavailable"),
                "runId": normalize_optional_label(run_id, "run_unavailable"),
                "attemptId": normalize_optional_label(attempt_id, "attempt_unavailable"),
                "attemptIndex": attempt_index,
                "status": "running",
            }),
        )
    }

    pub(crate) fn task_attempt_failed(
        &self,
        task_id: &str,
        run_id: &str,
        attempt_id: &str,
        attempt_index: usize,
        failure_category: &str,
        message: Option<&str>,
        retryable: bool,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "task.attempt.failed",
            json!({
                "taskId": normalize_optional_label(task_id, "task_unavailable"),
                "runId": normalize_optional_label(run_id, "run_unavailable"),
                "attemptId": normalize_optional_label(attempt_id, "attempt_unavailable"),
                "attemptIndex": attempt_index,
                "failureCategory": normalize_optional_label(failure_category, "unknown"),
                "message": normalize_optional_label_option(message),
                "retryable": retryable,
                "status": "failed",
            }),
        )
    }

    pub(crate) fn task_retrying(
        &self,
        task_id: &str,
        failed_attempt_id: Option<&str>,
        queued_turn_id: &str,
        next_attempt_index: usize,
        reason: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "task.retrying",
            json!({
                "taskId": normalize_optional_label(task_id, "task_unavailable"),
                "failedAttemptId": normalize_optional_label_option(failed_attempt_id),
                "queuedTurnId": normalize_optional_label(queued_turn_id, "queued_turn_unavailable"),
                "nextAttemptIndex": next_attempt_index,
                "reason": normalize_optional_label_option(reason),
                "status": "queued",
            }),
        )
    }

    pub(crate) fn task_completed(
        &self,
        task_id: &str,
        run_id: &str,
        attempt_id: &str,
        attempt_index: usize,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "task.completed",
            json!({
                "taskId": normalize_optional_label(task_id, "task_unavailable"),
                "runId": normalize_optional_label(run_id, "run_unavailable"),
                "attemptId": normalize_optional_label(attempt_id, "attempt_unavailable"),
                "attemptIndex": attempt_index,
                "status": "completed",
            }),
        )
    }

    pub(crate) fn task_failed(
        &self,
        task_id: &str,
        run_id: &str,
        attempt_id: &str,
        attempt_index: usize,
        failure_category: &str,
        message: Option<&str>,
        retryable: bool,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "task.failed",
            json!({
                "taskId": normalize_optional_label(task_id, "task_unavailable"),
                "runId": normalize_optional_label(run_id, "run_unavailable"),
                "attemptId": normalize_optional_label(attempt_id, "attempt_unavailable"),
                "attemptIndex": attempt_index,
                "failureCategory": normalize_optional_label(failure_category, "unknown"),
                "message": normalize_optional_label_option(message),
                "retryable": retryable,
                "status": "failed",
            }),
        )
    }

    fn next_event(&self, event_type: &str, payload: Value) -> AgentRuntimeProfileEvent {
        let sequence = self.sequence.fetch_add(1, Ordering::SeqCst) + 1;
        AgentRuntimeProfileEvent {
            event_type: event_type.to_string(),
            event_id: build_profile_event_id(event_type, sequence),
            timestamp: Utc::now().to_rfc3339(),
            schema_version: LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION.to_string(),
            runtime_id: LIME_AGENT_RUNTIME_ID.to_string(),
            session_id: self.session_id.clone(),
            thread_id: self.thread_id.clone(),
            turn_id: self.turn_id.clone(),
            sequence,
            trace_id: self.trace_id.clone(),
            payload,
        }
    }
}

fn normalize_required_id(value: String, field_name: &str) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        Err(format!("AgentRuntime Profile {field_name} 不能为空"))
    } else {
        Ok(trimmed)
    }
}

fn normalize_optional_label(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_optional_label_option(value: Option<&str>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_policy_result(value: &str) -> String {
    match value.trim() {
        "allow" | "deny" | "ask" | "defer" | "escalate" | "waive" | "not_applicable"
        | "indeterminate" => value.trim().to_string(),
        "" => "indeterminate".to_string(),
        _ => "indeterminate".to_string(),
    }
}

fn build_profile_event_id(event_type: &str, sequence: u64) -> String {
    let normalized_type = event_type.replace('.', "_");
    format!("evt_{normalized_type}_{sequence}_{}", Uuid::new_v4())
}

pub(crate) fn profile_failure_category(message: &str) -> &'static str {
    let normalized = message.to_ascii_lowercase();
    if normalized.contains("cancel") || normalized.contains("停止") || normalized.contains("中断")
    {
        "cancelled"
    } else if normalized.contains("quota") || normalized.contains("rate limit") {
        "limit"
    } else if normalized.contains("permission") || normalized.contains("权限") {
        "permission"
    } else {
        "provider_error"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn submit_turn_event_matches_lime_profile_fixture_shape() {
        let stream =
            AgentRuntimeProfileStream::new("sess_lime_001", "thread_lime_001", "turn_lime_001")
                .expect("profile stream");

        let event = stream.turn_submitted("workspace");
        let value = serde_json::to_value(event).expect("serialize event");

        assert_eq!(value["type"], "turn.submitted");
        assert_eq!(
            value["schemaVersion"],
            LIME_AGENT_RUNTIME_PROFILE_SCHEMA_VERSION
        );
        assert_eq!(value["runtimeId"], LIME_AGENT_RUNTIME_ID);
        assert_eq!(value["sessionId"], "sess_lime_001");
        assert_eq!(value["threadId"], "thread_lime_001");
        assert_eq!(value["turnId"], "turn_lime_001");
        assert_eq!(value["sequence"], 1);
        assert_eq!(value["payload"]["inputRef"], "input://turn_lime_001/user");
        assert_eq!(value["payload"]["source"], "workspace");
        assert_eq!(value["payload"]["status"], "accepted");
        assert!(value["eventId"]
            .as_str()
            .is_some_and(|value| !value.is_empty()));
        assert!(value["timestamp"]
            .as_str()
            .is_some_and(|value| !value.is_empty()));
        assert!(value["traceId"]
            .as_str()
            .is_some_and(|value| !value.is_empty()));
    }

    #[test]
    fn minimal_submit_turn_events_keep_monotonic_sequence() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");

        let events = vec![
            stream.turn_submitted("workspace"),
            stream.turn_started(),
            stream.model_requested("openai", "openai", "gpt-5.1"),
            stream.model_completed("openai", "openai", "gpt-5.1", 42),
            stream.turn_completed(),
            stream.snapshot_updated("completed"),
        ];

        let types = events
            .iter()
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            types,
            vec![
                "turn.submitted",
                "turn.started",
                "model.requested",
                "model.completed",
                "turn.completed",
                "snapshot.updated",
            ]
        );

        for (index, event) in events.iter().enumerate() {
            assert_eq!(event.sequence, (index + 1) as u64);
            assert_eq!(event.session_id, "session-1");
            assert_eq!(event.thread_id, "thread-1");
            assert_eq!(event.turn_id, "turn-1");
        }
    }

    #[test]
    fn profile_stream_rejects_missing_core_ids() {
        let result = AgentRuntimeProfileStream::new("session-1", "", "turn-1");

        assert!(result.is_err());
    }

    #[test]
    fn policy_action_events_match_agentpolicy_linkage_shape() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");
        let scope = json!({
            "threadId": "thread-1",
            "turnId": "turn-1",
            "toolCallId": "tool-call-1"
        });

        let permission = stream.permission_evaluated("decision-1", "ask", scope.clone());
        let required = stream.action_required(
            "action-1",
            Some("tool-call-1"),
            "tool_confirmation",
            "ask",
            scope,
        );
        let resolved = stream.action_resolved("action-1", "allow", true);

        let permission_value = serde_json::to_value(permission).expect("permission event");
        assert_eq!(permission_value["type"], "permission.evaluated");
        assert_eq!(permission_value["payload"]["decisionId"], "decision-1");
        assert_eq!(permission_value["payload"]["result"], "ask");
        assert_eq!(permission_value["payload"]["owner"], "AgentPolicy");

        let required_value = serde_json::to_value(required).expect("required event");
        assert_eq!(required_value["type"], "action.required");
        assert_eq!(required_value["payload"]["actionId"], "action-1");
        assert_eq!(required_value["payload"]["toolCallId"], "tool-call-1");
        assert_eq!(required_value["payload"]["decisionKind"], "ask");
        assert_eq!(required_value["payload"]["status"], "pending");

        let resolved_value = serde_json::to_value(resolved).expect("resolved event");
        assert_eq!(resolved_value["type"], "action.resolved");
        assert_eq!(resolved_value["payload"]["actionId"], "action-1");
        assert_eq!(resolved_value["payload"]["result"], "allow");
        assert_eq!(resolved_value["payload"]["confirmed"], true);
        assert_eq!(resolved_value["payload"]["status"], "resolved");
    }

    #[test]
    fn policy_result_fails_closed_for_unknown_values() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");
        let event = stream.permission_evaluated("decision-1", "maybe", Value::Null);
        let value = serde_json::to_value(event).expect("permission event");

        assert_eq!(value["payload"]["result"], "indeterminate");
    }

    #[test]
    fn tool_events_match_runtime_tool_fact_shape() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");

        let started = stream.tool_started("tool-1", "Read");
        let result = stream.tool_result("tool-1", "Read", true);
        let failed = stream.tool_failed("tool-2", "Write", "permission", "denied");

        let started_value = serde_json::to_value(started).expect("started event");
        assert_eq!(started_value["type"], "tool.started");
        assert_eq!(started_value["payload"]["toolCallId"], "tool-1");
        assert_eq!(started_value["payload"]["toolName"], "Read");
        assert_eq!(started_value["payload"]["status"], "running");

        let result_value = serde_json::to_value(result).expect("result event");
        assert_eq!(result_value["type"], "tool.result");
        assert_eq!(result_value["payload"]["toolCallId"], "tool-1");
        assert_eq!(result_value["payload"]["success"], true);
        assert_eq!(result_value["payload"]["status"], "completed");

        let failed_value = serde_json::to_value(failed).expect("failed event");
        assert_eq!(failed_value["type"], "tool.failed");
        assert_eq!(failed_value["payload"]["toolCallId"], "tool-2");
        assert_eq!(failed_value["payload"]["failureCategory"], "permission");
        assert_eq!(failed_value["payload"]["message"], "denied");
        assert_eq!(failed_value["payload"]["status"], "failed");
    }

    #[test]
    fn routing_events_match_single_candidate_fact_shape() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");

        let profile = stream.task_profile_resolved(
            Some("translation"),
            Some("translation"),
            Some("single_candidate"),
        );
        let routing = stream.routing_single_candidate(
            Some("translation"),
            1,
            Some("gpt-5.4-mini"),
            Some("service_model_setting"),
        );
        let cost = stream.cost_estimated(Some("low"));
        let limit = stream.limit_changed(Some("single_candidate_only"), Some(true));

        let profile_value = serde_json::to_value(profile).expect("profile event");
        assert_eq!(profile_value["type"], "task.profile.resolved");
        assert_eq!(profile_value["payload"]["taskKind"], "translation");
        assert_eq!(profile_value["payload"]["serviceModelSlot"], "translation");
        assert_eq!(profile_value["payload"]["routingMode"], "single_candidate");

        let routing_value = serde_json::to_value(routing).expect("routing event");
        assert_eq!(routing_value["type"], "routing.single_candidate");
        assert_eq!(routing_value["payload"]["candidateCount"], 1);
        assert_eq!(routing_value["payload"]["selectedModel"], "gpt-5.4-mini");
        assert_eq!(
            routing_value["payload"]["decisionSource"],
            "service_model_setting"
        );

        let cost_value = serde_json::to_value(cost).expect("cost event");
        assert_eq!(cost_value["type"], "cost.estimated");
        assert_eq!(cost_value["payload"]["estimatedCostClass"], "low");

        let limit_value = serde_json::to_value(limit).expect("limit event");
        assert_eq!(limit_value["type"], "limit.changed");
        assert_eq!(
            limit_value["payload"]["limitStatus"],
            "single_candidate_only"
        );
        assert_eq!(limit_value["payload"]["singleCandidateOnly"], true);
    }

    #[test]
    fn task_retry_events_match_attempt_fact_shape() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");

        let created = stream.task_created(
            "task-thread-1",
            Some("managed_task"),
            Some("thread_read_model"),
        );
        let attempt_started =
            stream.task_attempt_started("task-thread-1", "run-turn-1", "attempt-turn-1", 1);
        let attempt_failed = stream.task_attempt_failed(
            "task-thread-1",
            "run-turn-1",
            "attempt-turn-1",
            1,
            "provider_error",
            Some("rate limit"),
            true,
        );
        let retrying = stream.task_retrying(
            "task-thread-1",
            Some("attempt-turn-1"),
            "queued-1",
            2,
            Some("rate limit"),
        );

        let created_value = serde_json::to_value(created).expect("created event");
        assert_eq!(created_value["type"], "task.created");
        assert_eq!(created_value["payload"]["taskId"], "task-thread-1");
        assert_eq!(created_value["payload"]["taskKind"], "managed_task");

        let started_value = serde_json::to_value(attempt_started).expect("started event");
        assert_eq!(started_value["type"], "task.attempt.started");
        assert_eq!(started_value["payload"]["runId"], "run-turn-1");
        assert_eq!(started_value["payload"]["attemptIndex"], 1);

        let failed_value = serde_json::to_value(attempt_failed).expect("failed event");
        assert_eq!(failed_value["type"], "task.attempt.failed");
        assert_eq!(failed_value["payload"]["failureCategory"], "provider_error");
        assert_eq!(failed_value["payload"]["retryable"], true);

        let retrying_value = serde_json::to_value(retrying).expect("retrying event");
        assert_eq!(retrying_value["type"], "task.retrying");
        assert_eq!(
            retrying_value["payload"]["failedAttemptId"],
            "attempt-turn-1"
        );
        assert_eq!(retrying_value["payload"]["queuedTurnId"], "queued-1");
        assert_eq!(retrying_value["payload"]["nextAttemptIndex"], 2);
    }
}
