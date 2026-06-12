pub fn runtime_event_type_from_backend_type(event_type: &str) -> String {
    match event_type {
        "thread_started" => "thread.started",
        "turn_started" => "turn.started",
        "turn_completed" => "turn.completed",
        "turn_failed" => "turn.failed",
        "item_started" => "item.started",
        "item_updated" => "item.updated",
        "item_completed" => "item.completed",
        "text_delta" | "text_delta_batch" => "message.delta",
        "thinking_delta" => "thinking.delta",
        "tool_start" => "tool.started",
        "tool_end" => "tool.result",
        "tool_progress" => "tool.progress",
        "tool_output_delta" => "tool.output.delta",
        "tool_input_delta" => "tool.input.delta",
        "artifact_snapshot" => "artifact.snapshot",
        "action_required" => "action.required",
        "action_resolved" => "action.resolved",
        "turn_context" => "turn.context",
        "model_change" => "model.changed",
        "context_trace" => "context.trace",
        "context_compaction_started" => "context.compaction.started",
        "context_compaction_completed" => "context.compaction.completed",
        "runtime_status" => "runtime.status",
        "task_profile_resolved" => "task.profile.resolved",
        "candidate_set_resolved" => "routing.candidates.resolved",
        "routing_decision_made" => "routing.decision.made",
        "routing_fallback_applied" => "routing.fallback.applied",
        "routing_not_possible" => "routing.not_possible",
        "limit_state_updated" => "limit.state.updated",
        "quota_blocked" => "quota.blocked",
        "quota_low" => "quota.low",
        "rate_limit_hit" => "rate_limit.hit",
        "cost_estimated" => "cost.estimated",
        "cost_recorded" => "cost.recorded",
        "queue_added" => "queue.added",
        "queue_started" => "queue.started",
        "queue_removed" => "queue.removed",
        "queue_cleared" => "queue.cleared",
        "error" => "runtime.error",
        "warning" => "runtime.warning",
        other => return other.replace('_', "."),
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_backend_event_type() {
        assert_eq!(
            runtime_event_type_from_backend_type("text_delta"),
            "message.delta"
        );
        assert_eq!(
            runtime_event_type_from_backend_type("custom_backend_event"),
            "custom.backend.event"
        );
    }
}
