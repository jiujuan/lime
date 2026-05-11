use super::agentruntime_profile::{AgentRuntimeProfileEvent, AgentRuntimeProfileStream};
use lime_agent::{SessionExecutionRuntimeTaskProfile, TurnExecutionProfile};

const DEFAULT_ATTEMPT_INDEX: usize = 1;
const PROFILE_EVENT_SOURCE: &str = "agent_runtime_submit_turn";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RuntimeTurnTaskProfileRefs {
    pub(crate) task_id: String,
    pub(crate) task_kind: String,
    pub(crate) run_id: String,
    pub(crate) attempt_id: String,
    pub(crate) attempt_index: usize,
}

pub(crate) fn task_id_from_thread_id(thread_id: &str) -> String {
    format!(
        "task_{}",
        normalize_runtime_task_id_fragment(thread_id, "thread_unavailable")
    )
}

pub(crate) fn run_id_from_turn_id(turn_id: &str) -> String {
    format!(
        "run_{}",
        normalize_runtime_task_id_fragment(turn_id, "turn_unavailable")
    )
}

pub(crate) fn attempt_id_from_turn_id(turn_id: &str) -> String {
    format!(
        "attempt_{}",
        normalize_runtime_task_id_fragment(turn_id, "turn_unavailable")
    )
}

pub(crate) fn build_runtime_turn_task_profile_refs(
    thread_id: &str,
    turn_id: &str,
    execution_profile: TurnExecutionProfile,
    task_profile: Option<&SessionExecutionRuntimeTaskProfile>,
) -> RuntimeTurnTaskProfileRefs {
    RuntimeTurnTaskProfileRefs {
        task_id: task_id_from_thread_id(thread_id),
        task_kind: runtime_task_kind_for_execution_profile(execution_profile, task_profile),
        run_id: run_id_from_turn_id(turn_id),
        attempt_id: attempt_id_from_turn_id(turn_id),
        attempt_index: DEFAULT_ATTEMPT_INDEX,
    }
}

pub(crate) fn build_runtime_task_start_profile_events(
    profile_stream: &AgentRuntimeProfileStream,
    refs: &RuntimeTurnTaskProfileRefs,
) -> Vec<AgentRuntimeProfileEvent> {
    vec![
        profile_stream.task_created(
            refs.task_id.as_str(),
            Some(refs.task_kind.as_str()),
            Some(PROFILE_EVENT_SOURCE),
        ),
        profile_stream.task_attempt_started(
            refs.task_id.as_str(),
            refs.run_id.as_str(),
            refs.attempt_id.as_str(),
            refs.attempt_index,
        ),
    ]
}

pub(crate) fn build_runtime_task_completed_profile_event(
    profile_stream: &AgentRuntimeProfileStream,
    refs: &RuntimeTurnTaskProfileRefs,
) -> AgentRuntimeProfileEvent {
    profile_stream.task_completed(
        refs.task_id.as_str(),
        refs.run_id.as_str(),
        refs.attempt_id.as_str(),
        refs.attempt_index,
    )
}

pub(crate) fn build_runtime_task_failed_profile_events(
    profile_stream: &AgentRuntimeProfileStream,
    refs: &RuntimeTurnTaskProfileRefs,
    failure_category: &str,
    message: &str,
    retryable: bool,
) -> Vec<AgentRuntimeProfileEvent> {
    vec![
        profile_stream.task_attempt_failed(
            refs.task_id.as_str(),
            refs.run_id.as_str(),
            refs.attempt_id.as_str(),
            refs.attempt_index,
            failure_category,
            Some(message),
            retryable,
        ),
        profile_stream.task_failed(
            refs.task_id.as_str(),
            refs.run_id.as_str(),
            refs.attempt_id.as_str(),
            refs.attempt_index,
            failure_category,
            Some(message),
            retryable,
        ),
    ]
}

fn runtime_task_kind_for_execution_profile(
    execution_profile: TurnExecutionProfile,
    task_profile: Option<&SessionExecutionRuntimeTaskProfile>,
) -> String {
    task_profile
        .and_then(|profile| normalize_optional_runtime_task_text(profile.kind.as_str()))
        .unwrap_or_else(|| match execution_profile {
            TurnExecutionProfile::FastChat => "chat".to_string(),
            TurnExecutionProfile::FullRuntime => "conversation_turn".to_string(),
        })
}

fn normalize_runtime_task_id_fragment(value: &str, fallback: &str) -> String {
    normalize_optional_runtime_task_text(value).unwrap_or_else(|| fallback.to_string())
}

fn normalize_optional_runtime_task_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn task_profile(kind: &str) -> SessionExecutionRuntimeTaskProfile {
        SessionExecutionRuntimeTaskProfile {
            kind: kind.to_string(),
            source: "test".to_string(),
            traits: Vec::new(),
            modality_contract_key: None,
            routing_slot: None,
            execution_profile_key: None,
            executor_adapter_key: None,
            executor_kind: None,
            executor_binding_key: None,
            permission_profile_keys: Vec::new(),
            user_lock_policy: None,
            service_model_slot: None,
            scene_kind: None,
            scene_skill_id: None,
            entry_source: None,
        }
    }

    #[test]
    fn runtime_turn_task_profile_refs_should_keep_joinable_ids() {
        let refs = build_runtime_turn_task_profile_refs(
            "thread-1",
            "turn-1",
            TurnExecutionProfile::FullRuntime,
            Some(&task_profile("translation")),
        );

        assert_eq!(refs.task_id, "task_thread-1");
        assert_eq!(refs.task_kind, "translation");
        assert_eq!(refs.run_id, "run_turn-1");
        assert_eq!(refs.attempt_id, "attempt_turn-1");
        assert_eq!(refs.attempt_index, 1);
    }

    #[test]
    fn runtime_turn_task_profile_refs_should_fallback_to_execution_profile_kind() {
        let fast_chat = build_runtime_turn_task_profile_refs(
            "thread-1",
            "turn-1",
            TurnExecutionProfile::FastChat,
            None,
        );
        let full_runtime = build_runtime_turn_task_profile_refs(
            "thread-1",
            "turn-1",
            TurnExecutionProfile::FullRuntime,
            None,
        );

        assert_eq!(fast_chat.task_kind, "chat");
        assert_eq!(full_runtime.task_kind, "conversation_turn");
    }

    #[test]
    fn runtime_task_start_profile_events_should_emit_created_then_attempt_started() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");
        let refs = build_runtime_turn_task_profile_refs(
            "thread-1",
            "turn-1",
            TurnExecutionProfile::FullRuntime,
            Some(&task_profile("translation")),
        );

        let events = build_runtime_task_start_profile_events(&stream, &refs);
        let values = events
            .into_iter()
            .map(|event| serde_json::to_value(event).expect("event"))
            .collect::<Vec<_>>();

        assert_eq!(values[0]["type"], "task.created");
        assert_eq!(values[0]["payload"]["taskId"], "task_thread-1");
        assert_eq!(values[0]["payload"]["taskKind"], "translation");
        assert_eq!(values[0]["payload"]["source"], "agent_runtime_submit_turn");
        assert_eq!(values[1]["type"], "task.attempt.started");
        assert_eq!(values[1]["payload"]["runId"], "run_turn-1");
        assert_eq!(values[1]["payload"]["attemptId"], "attempt_turn-1");
        assert_eq!(values[1]["payload"]["attemptIndex"], 1);
        assert_eq!(values[0]["sequence"], 1);
        assert_eq!(values[1]["sequence"], 2);
    }

    #[test]
    fn runtime_task_failed_profile_events_should_emit_attempt_and_task_terminal() {
        let stream = AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1")
            .expect("profile stream");
        let refs = build_runtime_turn_task_profile_refs(
            "thread-1",
            "turn-1",
            TurnExecutionProfile::FullRuntime,
            None,
        );

        let events = build_runtime_task_failed_profile_events(
            &stream,
            &refs,
            "provider_error",
            "rate limit",
            false,
        );
        let values = events
            .into_iter()
            .map(|event| serde_json::to_value(event).expect("event"))
            .collect::<Vec<Value>>();

        assert_eq!(values[0]["type"], "task.attempt.failed");
        assert_eq!(values[0]["payload"]["failureCategory"], "provider_error");
        assert_eq!(values[0]["payload"]["message"], "rate limit");
        assert_eq!(values[0]["payload"]["retryable"], false);
        assert_eq!(values[1]["type"], "task.failed");
        assert_eq!(values[1]["payload"]["attemptId"], "attempt_turn-1");
    }
}
