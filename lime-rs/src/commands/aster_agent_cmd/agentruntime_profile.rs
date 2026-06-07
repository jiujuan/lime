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

    pub(crate) fn routing_decided(
        &self,
        task_kind: Option<&str>,
        routing_mode: Option<&str>,
        candidate_count: u32,
        selected_model: Option<&str>,
        decision_source: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "routing.decided",
            json!({
                "taskKind": normalize_optional_label_option(task_kind),
                "routingMode": normalize_optional_label_option(routing_mode),
                "candidateCount": candidate_count,
                "selectedModel": normalize_optional_label_option(selected_model),
                "decisionSource": normalize_optional_label_option(decision_source),
                "status": "selected",
            }),
        )
    }

    pub(crate) fn routing_not_possible(
        &self,
        task_kind: Option<&str>,
        routing_mode: Option<&str>,
        candidate_count: u32,
        decision_source: Option<&str>,
        reason_code: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "routing.not_possible",
            json!({
                "taskKind": normalize_optional_label_option(task_kind),
                "routingMode": normalize_optional_label_option(routing_mode),
                "candidateCount": candidate_count,
                "decisionSource": normalize_optional_label_option(decision_source),
                "reasonCode": normalize_optional_label_option(reason_code),
                "status": "blocked",
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

    pub(crate) fn subagent_spawned(
        &self,
        subagent_session_id: &str,
        created_from_turn_id: Option<&str>,
        parent_task_id: Option<&str>,
        origin_tool: Option<&str>,
        role_key: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "subagent.spawned",
            json!({
                "subagentSessionId": normalize_optional_label(subagent_session_id, "subagent_unavailable"),
                "parentSessionId": self.session_id.clone(),
                "parentThreadId": self.thread_id.clone(),
                "createdFromTurnId": normalize_optional_label_option(created_from_turn_id),
                "parentTaskId": normalize_optional_label_option(parent_task_id),
                "originTool": normalize_optional_label_option(origin_tool),
                "roleKey": normalize_optional_label_option(role_key),
                "status": "spawned",
            }),
        )
    }

    pub(crate) fn subagent_status(
        &self,
        subagent_session_id: &str,
        runtime_status: &str,
        parent_task_id: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "subagent.status",
            json!({
                "subagentSessionId": normalize_optional_label(subagent_session_id, "subagent_unavailable"),
                "parentSessionId": self.session_id.clone(),
                "parentThreadId": self.thread_id.clone(),
                "parentTaskId": normalize_optional_label_option(parent_task_id),
                "runtimeStatus": normalize_optional_label(runtime_status, "unknown"),
                "status": "updated",
            }),
        )
    }

    pub(crate) fn subagent_completed(
        &self,
        subagent_session_id: &str,
        parent_task_id: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "subagent.completed",
            json!({
                "subagentSessionId": normalize_optional_label(subagent_session_id, "subagent_unavailable"),
                "parentSessionId": self.session_id.clone(),
                "parentThreadId": self.thread_id.clone(),
                "parentTaskId": normalize_optional_label_option(parent_task_id),
                "status": "completed",
            }),
        )
    }

    pub(crate) fn subagent_failed(
        &self,
        subagent_session_id: &str,
        failure_category: &str,
        parent_task_id: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "subagent.failed",
            json!({
                "subagentSessionId": normalize_optional_label(subagent_session_id, "subagent_unavailable"),
                "parentSessionId": self.session_id.clone(),
                "parentThreadId": self.thread_id.clone(),
                "parentTaskId": normalize_optional_label_option(parent_task_id),
                "failureCategory": normalize_optional_label(failure_category, "subagent_error"),
                "status": "failed",
            }),
        )
    }

    pub(crate) fn subagent_closed(
        &self,
        subagent_session_id: &str,
        parent_task_id: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "subagent.closed",
            json!({
                "subagentSessionId": normalize_optional_label(subagent_session_id, "subagent_unavailable"),
                "parentSessionId": self.session_id.clone(),
                "parentThreadId": self.thread_id.clone(),
                "parentTaskId": normalize_optional_label_option(parent_task_id),
                "status": "closed",
            }),
        )
    }

    pub(crate) fn job_created(
        &self,
        job_id: &str,
        source: &str,
        source_ref: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "job.created",
            json!({
                "jobId": normalize_optional_label(job_id, "job_unavailable"),
                "source": normalize_optional_label(source, "unknown"),
                "sourceRef": normalize_optional_label_option(source_ref),
                "owner": "AgentRun",
                "status": "created",
            }),
        )
    }

    pub(crate) fn job_status(
        &self,
        job_id: &str,
        runtime_status: &str,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "job.status",
            json!({
                "jobId": normalize_optional_label(job_id, "job_unavailable"),
                "runtimeStatus": normalize_optional_label(runtime_status, "unknown"),
                "owner": "AgentRun",
                "status": "updated",
            }),
        )
    }

    pub(crate) fn job_item_started(
        &self,
        job_id: &str,
        item_id: &str,
        item_kind: Option<&str>,
        source_ref: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "job.item.started",
            json!({
                "jobId": normalize_optional_label(job_id, "job_unavailable"),
                "itemId": normalize_optional_label(item_id, "job_item_unavailable"),
                "itemKind": normalize_optional_label_option(item_kind),
                "sourceRef": normalize_optional_label_option(source_ref),
                "owner": "AgentRun",
                "status": "running",
            }),
        )
    }

    pub(crate) fn job_item_failed(
        &self,
        job_id: &str,
        item_id: &str,
        failure_category: &str,
        error_code: Option<&str>,
        retryable: bool,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "job.item.failed",
            json!({
                "jobId": normalize_optional_label(job_id, "job_unavailable"),
                "itemId": normalize_optional_label(item_id, "job_item_unavailable"),
                "failureCategory": normalize_optional_label(failure_category, "runtime_error"),
                "errorCode": normalize_optional_label_option(error_code),
                "retryable": retryable,
                "owner": "AgentRun",
                "status": "failed",
            }),
        )
    }

    pub(crate) fn job_completed(&self, job_id: &str) -> AgentRuntimeProfileEvent {
        self.next_event(
            "job.completed",
            json!({
                "jobId": normalize_optional_label(job_id, "job_unavailable"),
                "owner": "AgentRun",
                "status": "completed",
            }),
        )
    }

    pub(crate) fn job_failed(
        &self,
        job_id: &str,
        failure_category: &str,
        error_code: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "job.failed",
            json!({
                "jobId": normalize_optional_label(job_id, "job_unavailable"),
                "failureCategory": normalize_optional_label(failure_category, "runtime_error"),
                "errorCode": normalize_optional_label_option(error_code),
                "owner": "AgentRun",
                "status": "failed",
            }),
        )
    }

    pub(crate) fn channel_connected(
        &self,
        remote_task_id: &str,
        channel: Option<&str>,
        account_id: Option<&str>,
        run_id: Option<&str>,
        source: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "channel.connected",
            json!({
                "remoteTaskId": normalize_optional_label(remote_task_id, "remote_task_unavailable"),
                "channel": normalize_optional_label_option(channel),
                "accountId": normalize_optional_label_option(account_id),
                "runId": normalize_optional_label_option(run_id),
                "source": normalize_optional_label_option(source),
                "owner": "AgentRun",
                "status": "connected",
            }),
        )
    }

    pub(crate) fn channel_disconnected(
        &self,
        remote_task_id: &str,
        channel: Option<&str>,
        account_id: Option<&str>,
        reason_code: Option<&str>,
        retryable: bool,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "channel.disconnected",
            json!({
                "remoteTaskId": normalize_optional_label(remote_task_id, "remote_task_unavailable"),
                "channel": normalize_optional_label_option(channel),
                "accountId": normalize_optional_label_option(account_id),
                "reasonCode": normalize_optional_label_option(reason_code),
                "retryable": retryable,
                "owner": "AgentRun",
                "status": "disconnected",
            }),
        )
    }

    pub(crate) fn channel_resumed(
        &self,
        remote_task_id: &str,
        channel: Option<&str>,
        account_id: Option<&str>,
        snapshot_ref: Option<&str>,
        replay_ref: Option<&str>,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "channel.resumed",
            json!({
                "remoteTaskId": normalize_optional_label(remote_task_id, "remote_task_unavailable"),
                "channel": normalize_optional_label_option(channel),
                "accountId": normalize_optional_label_option(account_id),
                "snapshotRef": normalize_optional_label_option(snapshot_ref),
                "replayRef": normalize_optional_label_option(replay_ref),
                "owner": "AgentRun",
                "status": "resumed",
            }),
        )
    }

    pub(crate) fn snapshot_repaired(
        &self,
        source: &str,
        remote_task_id: Option<&str>,
        channel: Option<&str>,
        account_id: Option<&str>,
        repair_status: Option<&str>,
        stale: bool,
    ) -> AgentRuntimeProfileEvent {
        self.next_event(
            "snapshot.repaired",
            json!({
                "source": normalize_optional_label(source, "runtime_snapshot"),
                "remoteTaskId": normalize_optional_label_option(remote_task_id),
                "channel": normalize_optional_label_option(channel),
                "accountId": normalize_optional_label_option(account_id),
                "repairStatus": normalize_optional_label_option(repair_status),
                "stale": stale,
                "status": "repaired",
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
        let decided = stream.routing_decided(
            Some("translation"),
            Some("fallback_chain"),
            2,
            Some("gpt-5.4"),
            Some("model_router"),
        );
        let blocked = stream.routing_not_possible(
            Some("image_generation"),
            Some("no_candidate"),
            0,
            Some("capability_filter"),
            Some("image_generation_model_capability_gap"),
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

        let decided_value = serde_json::to_value(decided).expect("decided event");
        assert_eq!(decided_value["type"], "routing.decided");
        assert_eq!(decided_value["payload"]["routingMode"], "fallback_chain");
        assert_eq!(decided_value["payload"]["candidateCount"], 2);
        assert_eq!(decided_value["payload"]["selectedModel"], "gpt-5.4");
        assert_eq!(decided_value["payload"]["status"], "selected");

        let blocked_value = serde_json::to_value(blocked).expect("blocked event");
        assert_eq!(blocked_value["type"], "routing.not_possible");
        assert_eq!(blocked_value["payload"]["routingMode"], "no_candidate");
        assert_eq!(blocked_value["payload"]["candidateCount"], 0);
        assert_eq!(
            blocked_value["payload"]["reasonCode"],
            "image_generation_model_capability_gap"
        );
        assert_eq!(blocked_value["payload"]["status"], "blocked");

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

    #[test]
    fn subagent_events_keep_parent_child_correlation_shape() {
        let stream = AgentRuntimeProfileStream::new("parent-session-1", "thread-1", "turn-1")
            .expect("profile stream");

        let spawned = stream.subagent_spawned(
            "child-session-1",
            Some("turn-1"),
            Some("task-thread-1"),
            Some("SpawnAgent"),
            Some("verifier"),
        );
        let status = stream.subagent_status("child-session-1", "running", Some("task-thread-1"));
        let completed = stream.subagent_completed("child-session-1", Some("task-thread-1"));
        let failed =
            stream.subagent_failed("child-session-2", "runtime_error", Some("task-thread-1"));
        let closed = stream.subagent_closed("child-session-3", Some("task-thread-1"));

        let spawned_value = serde_json::to_value(spawned).expect("spawned event");
        assert_eq!(spawned_value["type"], "subagent.spawned");
        assert_eq!(
            spawned_value["payload"]["parentSessionId"],
            "parent-session-1"
        );
        assert_eq!(spawned_value["payload"]["parentThreadId"], "thread-1");
        assert_eq!(
            spawned_value["payload"]["subagentSessionId"],
            "child-session-1"
        );
        assert_eq!(spawned_value["payload"]["createdFromTurnId"], "turn-1");
        assert_eq!(spawned_value["payload"]["parentTaskId"], "task-thread-1");
        assert_eq!(spawned_value["payload"]["roleKey"], "verifier");

        let status_value = serde_json::to_value(status).expect("status event");
        assert_eq!(status_value["type"], "subagent.status");
        assert_eq!(status_value["payload"]["runtimeStatus"], "running");
        assert_eq!(status_value["payload"]["parentTaskId"], "task-thread-1");

        let completed_value = serde_json::to_value(completed).expect("completed event");
        assert_eq!(completed_value["type"], "subagent.completed");
        assert_eq!(completed_value["payload"]["status"], "completed");

        let failed_value = serde_json::to_value(failed).expect("failed event");
        assert_eq!(failed_value["type"], "subagent.failed");
        assert_eq!(failed_value["payload"]["failureCategory"], "runtime_error");

        let closed_value = serde_json::to_value(closed).expect("closed event");
        assert_eq!(closed_value["type"], "subagent.closed");
        assert_eq!(closed_value["payload"]["status"], "closed");
    }

    #[test]
    fn job_events_keep_agent_run_owner_shape() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");

        let created = stream.job_created("job-1", "automation", Some("owner-1"));
        let status = stream.job_status("job-1", "running");
        let item_started = stream.job_item_started(
            "job-1",
            "job-1:execution",
            Some("agent_turn"),
            Some("owner-1"),
        );
        let item_failed = stream.job_item_failed(
            "job-2",
            "job-2:execution",
            "runtime_error",
            Some("automation_job_failed"),
            true,
        );
        let completed = stream.job_completed("job-1");
        let failed = stream.job_failed("job-2", "timeout", Some("provider_timeout"));

        let created_value = serde_json::to_value(created).expect("created event");
        assert_eq!(created_value["type"], "job.created");
        assert_eq!(created_value["payload"]["jobId"], "job-1");
        assert_eq!(created_value["payload"]["source"], "automation");
        assert_eq!(created_value["payload"]["sourceRef"], "owner-1");
        assert_eq!(created_value["payload"]["owner"], "AgentRun");

        let status_value = serde_json::to_value(status).expect("status event");
        assert_eq!(status_value["type"], "job.status");
        assert_eq!(status_value["payload"]["runtimeStatus"], "running");

        let item_started_value = serde_json::to_value(item_started).expect("item started event");
        assert_eq!(item_started_value["type"], "job.item.started");
        assert_eq!(item_started_value["payload"]["jobId"], "job-1");
        assert_eq!(item_started_value["payload"]["itemId"], "job-1:execution");
        assert_eq!(item_started_value["payload"]["itemKind"], "agent_turn");

        let item_failed_value = serde_json::to_value(item_failed).expect("item failed event");
        assert_eq!(item_failed_value["type"], "job.item.failed");
        assert_eq!(
            item_failed_value["payload"]["failureCategory"],
            "runtime_error"
        );
        assert_eq!(
            item_failed_value["payload"]["errorCode"],
            "automation_job_failed"
        );
        assert_eq!(item_failed_value["payload"]["retryable"], true);

        let completed_value = serde_json::to_value(completed).expect("completed event");
        assert_eq!(completed_value["type"], "job.completed");
        assert_eq!(completed_value["payload"]["status"], "completed");

        let failed_value = serde_json::to_value(failed).expect("failed event");
        assert_eq!(failed_value["type"], "job.failed");
        assert_eq!(failed_value["payload"]["failureCategory"], "timeout");
        assert_eq!(failed_value["payload"]["errorCode"], "provider_timeout");
    }

    #[test]
    fn remote_channel_events_keep_remote_task_correlation_shape() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");

        let connected = stream.channel_connected(
            "gateway:telegram:default:message-1",
            Some("telegram"),
            Some("default"),
            Some("run-remote-1"),
            Some("gateway_channel"),
        );
        let disconnected = stream.channel_disconnected(
            "gateway:telegram:default:message-1",
            Some("telegram"),
            Some("default"),
            Some("connection_lost"),
            true,
        );
        let resumed = stream.channel_resumed(
            "gateway:telegram:default:message-1",
            Some("telegram"),
            Some("default"),
            Some("agent-runtime://snapshot/remote-1"),
            Some("agent-runtime://replay/remote-1"),
        );
        let repaired = stream.snapshot_repaired(
            "remote_channel_snapshot",
            Some("gateway:telegram:default:message-1"),
            Some("telegram"),
            Some("default"),
            Some("repaired"),
            false,
        );

        let connected_value = serde_json::to_value(connected).expect("connected event");
        assert_eq!(connected_value["type"], "channel.connected");
        assert_eq!(
            connected_value["payload"]["remoteTaskId"],
            "gateway:telegram:default:message-1"
        );
        assert_eq!(connected_value["payload"]["channel"], "telegram");
        assert_eq!(connected_value["payload"]["runId"], "run-remote-1");
        assert_eq!(connected_value["payload"]["owner"], "AgentRun");

        let disconnected_value = serde_json::to_value(disconnected).expect("disconnected event");
        assert_eq!(disconnected_value["type"], "channel.disconnected");
        assert_eq!(
            disconnected_value["payload"]["reasonCode"],
            "connection_lost"
        );
        assert_eq!(disconnected_value["payload"]["retryable"], true);

        let resumed_value = serde_json::to_value(resumed).expect("resumed event");
        assert_eq!(resumed_value["type"], "channel.resumed");
        assert_eq!(
            resumed_value["payload"]["snapshotRef"],
            "agent-runtime://snapshot/remote-1"
        );
        assert_eq!(resumed_value["payload"]["status"], "resumed");

        let repaired_value = serde_json::to_value(repaired).expect("repaired event");
        assert_eq!(repaired_value["type"], "snapshot.repaired");
        assert_eq!(
            repaired_value["payload"]["source"],
            "remote_channel_snapshot"
        );
        assert_eq!(repaired_value["payload"]["repairStatus"], "repaired");
        assert_eq!(repaired_value["payload"]["stale"], false);
    }
}
