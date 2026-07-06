use super::plan_events;
use super::tool_process_metadata::{tool_failure_category, SoulStyleMetadata};
use super::tool_process_runtime_metadata;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use lime_agent::{AgentEvent as RuntimeAgentEvent, AgentProviderTraceStage};
#[cfg(test)]
use runtime_core::runtime_event_from_llm_event as runtime_core_event_from_llm_event;
use serde_json::{json, Value};

#[cfg(test)]
pub(super) fn runtime_event_from_llm_event(event: &runtime_core::LlmEvent) -> RuntimeEvent {
    let mapped = runtime_core_event_from_llm_event(event);
    RuntimeEvent::new(mapped.event_type, mapped.payload)
}

pub(super) fn runtime_events_from_agent_event(
    event: &RuntimeAgentEvent,
) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
    runtime_events_from_agent_event_with_soul_style(event, None)
}

pub(super) fn runtime_events_from_agent_event_with_soul_style(
    event: &RuntimeAgentEvent,
    soul_style: Option<&SoulStyleMetadata>,
) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
    let runtime_event = serde_json::to_value(event).map_err(event_error)?;
    let raw_type = runtime_event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("runtime_event")
        .to_string();
    let mut payload = runtime_event
        .as_object()
        .cloned()
        .map(Value::Object)
        .unwrap_or_else(|| json!({ "value": runtime_event.clone() }));
    if let Some(payload_object) = payload.as_object_mut() {
        payload_object.insert("backend".to_string(), Value::String("runtime".to_string()));
        payload_object.insert("runtimeEvent".to_string(), runtime_event);
        enrich_tool_terminal_payload(event, payload_object);
        tool_process_runtime_metadata::enrich_runtime_tool_process_payload(
            event,
            payload_object,
            soul_style,
        );
        enrich_reasoning_payload(event, payload_object);
    }
    let mut events = vec![RuntimeEvent::new(
        runtime_event_type_for_agent_event(event, &raw_type),
        payload,
    )];
    if let RuntimeAgentEvent::ToolStart {
        tool_name,
        tool_id,
        arguments,
    } = event
    {
        if let Some(arguments) = arguments.as_deref().and_then(non_empty_str) {
            events.push(RuntimeEvent::new(
                "tool.args",
                tool_process_runtime_metadata::runtime_tool_args_event_payload(
                    tool_id, tool_name, arguments, soul_style,
                ),
            ));
        }
    }
    if let Some(plan_event) = update_plan_event_from_tool_end(event) {
        events.push(plan_event);
    }
    Ok(events)
}

pub(super) fn runtime_event_type_from_raw(raw_type: &str) -> &'static str {
    match raw_type {
        "thread_started" => "thread.started",
        "turn_started" => "turn.started",
        "turn_completed" => "turn.completed",
        "turn_failed" => "turn.failed",
        "item_started" => "item.started",
        "item_updated" => "item.updated",
        "item_completed" => "item.completed",
        "text_delta" => "message.delta",
        "text_delta_batch" => "message.delta_batch",
        "thinking_delta" => "reasoning.delta",
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
        "provider_trace" => "provider.trace",
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
        "single_candidate_only" => "limit.single_candidate_only",
        "single_candidate_capability_gap" => "limit.single_candidate_capability_gap",
        "cost_estimated" => "cost.estimated",
        "cost_recorded" => "cost.recorded",
        "rate_limit_hit" => "rate_limit.hit",
        "quota_low" => "quota.low",
        "quota_blocked" => "quota.blocked",
        "queue_added" => "queue.added",
        "queue_removed" => "queue.removed",
        "queue_started" => "queue.started",
        "queue_cleared" => "queue.cleared",
        "error" => "turn.failed",
        "warning" => "runtime.warning",
        "message" => "message",
        _ => "runtime.event",
    }
}

fn enrich_reasoning_payload(
    event: &RuntimeAgentEvent,
    payload_object: &mut serde_json::Map<String, Value>,
) {
    let RuntimeAgentEvent::ThinkingDelta { text } = event else {
        return;
    };
    payload_object.insert("delta".to_string(), Value::String(text.clone()));
    payload_object.insert(
        "reasoningId".to_string(),
        Value::String("runtime-thinking".to_string()),
    );
}

fn update_plan_event_from_tool_end(event: &RuntimeAgentEvent) -> Option<RuntimeEvent> {
    let RuntimeAgentEvent::ToolEnd { tool_id, result } = event else {
        return None;
    };
    if !result.success {
        return None;
    }
    plan_events::plan_final_event_from_update_plan_result(
        tool_id,
        &result.output,
        result.metadata.as_ref(),
    )
}

fn runtime_event_type_for_agent_event(event: &RuntimeAgentEvent, raw_type: &str) -> &'static str {
    match event {
        RuntimeAgentEvent::ProviderTrace { stage, .. } => {
            runtime_event_type_for_provider_trace_stage(*stage)
        }
        RuntimeAgentEvent::ToolEnd { result, .. } if !result.success => "tool.failed",
        _ => runtime_event_type_from_raw(raw_type),
    }
}

fn runtime_event_type_for_provider_trace_stage(stage: AgentProviderTraceStage) -> &'static str {
    match stage {
        AgentProviderTraceStage::RequestStarted => "provider.request.started",
        AgentProviderTraceStage::FirstEventReceived => "provider.first_event.received",
        AgentProviderTraceStage::FirstTextDeltaReceived => "provider.first_text_delta.received",
        AgentProviderTraceStage::Failed => "provider.failed",
        AgentProviderTraceStage::Canceled => "provider.canceled",
    }
}

fn enrich_tool_terminal_payload(
    event: &RuntimeAgentEvent,
    payload_object: &mut serde_json::Map<String, Value>,
) {
    let RuntimeAgentEvent::ToolEnd { tool_id, result } = event else {
        return;
    };
    payload_object.insert("toolCallId".to_string(), Value::String(tool_id.clone()));
    payload_object.insert(
        "status".to_string(),
        Value::String(
            if result.success {
                "completed"
            } else {
                "failed"
            }
            .to_string(),
        ),
    );
    if result.success {
        return;
    }
    payload_object.insert(
        "failureCategory".to_string(),
        Value::String(tool_failure_category(result)),
    );
    if let Some(error) = result.error.as_deref().and_then(non_empty_str) {
        payload_object.insert("error".to_string(), Value::String(error.to_string()));
    }
    if let Some(output) = non_empty_str(&result.output) {
        payload_object.insert("output".to_string(), Value::String(output.to_string()));
    }
}

fn non_empty_str(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}

fn event_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_agent::AgentToolResult;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn final_done_raw_runtime_event_does_not_map_to_current_terminal_event() {
        assert_eq!(runtime_event_type_from_raw("final_done"), "runtime.event");
    }

    #[test]
    fn thinking_delta_maps_to_standard_reasoning_delta_event() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ThinkingDelta {
            text: "先理解目标".to_string(),
        })
        .expect("thinking delta should emit");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "reasoning.delta");
        assert_eq!(events[0].payload["delta"], "先理解目标");
        assert_eq!(events[0].payload["text"], "先理解目标");
        assert_eq!(events[0].payload["reasoningId"], "runtime-thinking");
    }

    #[test]
    fn provider_trace_stage_maps_to_provider_runtime_event() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ProviderTrace {
            stage: AgentProviderTraceStage::FirstTextDeltaReceived,
            provider: "openai".to_string(),
            model: "gpt-4.1".to_string(),
            attempt: 1,
            elapsed_ms: Some(1234),
            text_chars: Some(8),
            status: "running".to_string(),
            failure_category: None,
            retryable: None,
            non_retryable_provider_rejection: None,
            cancel_reason: None,
            provider_request_id: Some("req-provider-1".to_string()),
            provider_request_id_header: Some("x-request-id".to_string()),
            runtime_provider_backend: Some("aster_compat".to_string()),
            runtime_provider_selector: Some("codex".to_string()),
            runtime_provider_protocol: Some("responses".to_string()),
            runtime_provider_active_model: Some("gpt-4.1".to_string()),
        })
        .expect("provider trace should emit");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "provider.first_text_delta.received");
        assert_eq!(events[0].payload["stage"], "first_text_delta_received");
        assert_eq!(events[0].payload["provider"], "openai");
        assert_eq!(events[0].payload["model"], "gpt-4.1");
        assert_eq!(events[0].payload["provider_request_id"], "req-provider-1");
        assert_eq!(
            events[0].payload["provider_request_id_header"],
            "x-request-id"
        );
        assert_eq!(
            events[0].payload["runtime_provider_backend"],
            "aster_compat"
        );
        assert_eq!(events[0].payload["runtime_provider_selector"], "codex");
        assert_eq!(events[0].payload["runtime_provider_protocol"], "responses");
        assert_eq!(
            events[0].payload["runtime_provider_active_model"],
            "gpt-4.1"
        );
        assert_eq!(events[0].payload["elapsed_ms"], json!(1234));
        assert_eq!(events[0].payload["text_chars"], json!(8));
    }

    #[test]
    fn runtime_agent_tool_start_without_arguments_does_not_emit_empty_tool_args() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolStart {
            tool_name: "WebFetch".to_string(),
            tool_id: "tool-no-args".to_string(),
            arguments: None,
        })
        .expect("tool start should emit");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "tool.started");
    }

    #[test]
    fn runtime_agent_tool_args_preserve_non_json_arguments() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-raw-args".to_string(),
            arguments: Some("echo hello".to_string()),
        })
        .expect("tool start should emit");

        let args_event = events
            .iter()
            .find(|event| event.event_type == "tool.args")
            .expect("tool args event");
        assert_eq!(
            args_event.payload["toolCallId"].as_str(),
            Some("tool-raw-args")
        );
        assert_eq!(args_event.payload["args"].as_str(), Some("echo hello"));
        assert_eq!(args_event.payload["rawArgs"].as_str(), Some("echo hello"));
    }

    #[test]
    fn runtime_agent_json_tool_args_emit_tool_args_fact() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-json-args".to_string(),
            arguments: Some(json!({ "command": "cargo test" }).to_string()),
        })
        .expect("tool start should emit");

        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec!["tool.started", "tool.args"]
        );
        assert_eq!(
            events[1].payload["args"]["command"].as_str(),
            Some("cargo test")
        );
        assert_eq!(
            events[1].payload["source"].as_str(),
            Some("runtime_tool_start")
        );
    }

    #[test]
    fn runtime_agent_tool_start_adds_key_based_process_summary_metadata() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolStart {
            tool_name: "web_search".to_string(),
            tool_id: "tool-search-start".to_string(),
            arguments: Some(json!({ "query": "runtime facts" }).to_string()),
        })
        .expect("tool start should emit");

        assert_eq!(events[0].event_type, "tool.started");
        assert_eq!(
            events[0].payload["metadata"]["tool_process_summary"]["pre"]["key"],
            "toolCall.processSummary.webSearch.searchFirstWithQuery"
        );
        assert_eq!(
            events[0].payload["metadata"]["tool_process_summary"]["pre"]["values"]["query"],
            "runtime facts"
        );
        assert_eq!(
            events[0].payload["metadata"]["tool_process_facts"]["phase"],
            "before_tool"
        );
        assert_eq!(
            events[0].payload["metadata"]["soul_lifecycle"]["status"],
            "started"
        );
    }

    #[test]
    fn runtime_agent_tool_start_adds_active_soul_style_metadata() {
        let soul_style = SoulStyleMetadata {
            profile_id: Some("cool_confident_operator".to_string()),
            pack_id: Some("com.lime.soul.cool-confident-operator".to_string()),
            tone_variant: Some("cool_confident".to_string()),
        };
        let events = runtime_events_from_agent_event_with_soul_style(
            &RuntimeAgentEvent::ToolStart {
                tool_name: "web_search".to_string(),
                tool_id: "tool-search-style".to_string(),
                arguments: Some(json!({ "query": "runtime facts" }).to_string()),
            },
            Some(&soul_style),
        )
        .expect("tool start should emit");

        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec!["tool.started", "tool.args"]
        );
        assert_eq!(events[0].event_type, "tool.started");
        assert_eq!(
            events[0].payload["metadata"]["soul_lifecycle"]["profileId"].as_str(),
            Some("cool_confident_operator")
        );
        assert_eq!(
            events[0].payload["metadata"]["soul_lifecycle"]["packId"].as_str(),
            Some("com.lime.soul.cool-confident-operator")
        );
        assert_eq!(
            events[0].payload["metadata"]["soul_lifecycle"]["toneVariant"].as_str(),
            Some("cool_confident")
        );
        assert_eq!(
            events[0].payload["toolProcessFacts"]["profileId"].as_str(),
            Some("cool_confident_operator")
        );
        assert_eq!(
            events[0].payload["metadata"]["profile_id"].as_str(),
            Some("cool_confident_operator")
        );
        assert_eq!(
            events[1].payload["metadata"]["tool_process_facts"]["status"].as_str(),
            Some("input_delta")
        );
        assert_eq!(
            events[1].payload["metadata"]["soul_lifecycle"]["profileId"].as_str(),
            Some("cool_confident_operator")
        );
        assert_eq!(
            events[1].payload["toolProcessFacts"]["toneVariant"].as_str(),
            Some("cool_confident")
        );
    }

    #[test]
    fn llm_event_mapping_delegates_to_runtime_core_contract() {
        let event = runtime_event_from_llm_event(&runtime_core::LlmEvent::OutputDelta {
            part: runtime_core::LlmOutputPart::Text {
                text: "hello".to_string(),
            },
        });

        assert_eq!(event.event_type, "message.delta");
        assert_eq!(event.payload["text"].as_str(), Some("hello"));
        assert_eq!(event.payload["backend"].as_str(), Some("llm_protocol"));
    }

    #[test]
    fn llm_tool_delta_uses_current_tool_args_delta_event() {
        let event = runtime_event_from_llm_event(&runtime_core::LlmEvent::ToolCallDelta {
            call_id: "call_1".to_string(),
            name: "read_file".to_string(),
            arguments_delta: "{\"path\"".to_string(),
        });

        assert_eq!(event.event_type, "tool.args.delta");
        assert_eq!(event.payload["toolCallId"].as_str(), Some("call_1"));
        assert_eq!(event.payload["toolName"].as_str(), Some("read_file"));
        assert_eq!(event.payload["delta"].as_str(), Some("{\"path\""));
    }

    #[test]
    fn runtime_agent_successful_tool_end_emits_tool_result() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-ok".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                structured_content: None,
                images: None,
                metadata: None,
            },
        })
        .expect("tool end should emit");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "tool.result");
        assert_eq!(events[0].payload["toolCallId"].as_str(), Some("tool-ok"));
        assert_eq!(events[0].payload["status"].as_str(), Some("completed"));
    }

    #[test]
    fn runtime_agent_tool_end_adds_process_summary_descriptor_to_result_metadata() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-ok".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([(
                    "tool_name".to_string(),
                    json!("web_search"),
                )])),
            },
        })
        .expect("tool end should emit");

        let metadata = &events[0].payload["result"]["metadata"];
        assert_eq!(
            metadata["tool_process_summary"]["completed"]["key"],
            "toolCall.processSummary.generic.searchedWithSubject"
        );
        assert_eq!(
            metadata["tool_process_summary"]["completed"]["values"]["subject"],
            "web_search"
        );
        assert_eq!(metadata["tool_process_facts"]["status"], "completed");
        assert_eq!(metadata["soul_phase"], "after_tool_success");
    }

    #[test]
    fn runtime_agent_tool_end_preserves_existing_process_summary_descriptor() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-preserve-summary".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([(
                    "tool_process_summary".to_string(),
                    json!({
                        "source": "tool_runtime",
                        "completed": {
                            "key": "toolCall.processSummary.webSearch.sourcesFound",
                            "values": { "count": 7 }
                        }
                    }),
                )])),
            },
        })
        .expect("tool end should emit");

        let metadata = &events[0].payload["result"]["metadata"];
        assert_eq!(metadata["tool_process_summary"]["source"], "tool_runtime");
        assert_eq!(
            metadata["tool_process_summary"]["completed"]["values"]["count"],
            7
        );
        assert_eq!(metadata["tool_process_facts"]["status"], "completed");
    }

    #[test]
    fn runtime_agent_tool_end_does_not_treat_raw_process_summary_as_descriptor() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-raw-summary".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([(
                    "process_summary".to_string(),
                    json!("fixed copy should not block runtime descriptor"),
                )])),
            },
        })
        .expect("tool end should emit");

        let metadata = &events[0].payload["result"]["metadata"];
        assert_eq!(
            metadata["process_summary"],
            "fixed copy should not block runtime descriptor"
        );
        assert_eq!(
            metadata["tool_process_summary"]["completed"]["key"],
            "toolCall.processSummary.generic.completed"
        );
    }

    #[test]
    fn runtime_agent_update_plan_tool_end_emits_plan_final_fact() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-plan".to_string(),
            result: AgentToolResult {
                success: true,
                output: "Plan updated".to_string(),
                error: None,
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([
                    (
                        "plan".to_string(),
                        json!([
                            { "step": "读现状", "status": "completed" },
                            { "step": "打通主链", "status": "in_progress" }
                        ]),
                    ),
                    ("explanation".to_string(), json!("开始实现")),
                ])),
            },
        })
        .expect("update_plan tool end should emit");

        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec!["tool.result", "plan.final"]
        );
        let plan_event = &events[1];
        assert_eq!(plan_event.payload["source"], "update_plan");
        assert_eq!(plan_event.payload["toolCallId"], "tool-plan");
        assert_eq!(plan_event.payload["revisionId"], "update_plan:tool-plan");
        assert_eq!(plan_event.payload["text"], "- [x] 读现状\n- [ ] 打通主链");
    }

    #[test]
    fn runtime_agent_tool_end_preserves_structured_content_in_result_payload() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-mcp-structured".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                structured_content: Some(json!({
                    "answer": "ok",
                    "ids": ["doc-1"]
                })),
                images: None,
                metadata: Some(HashMap::from([("source".to_string(), json!("mcp"))])),
            },
        })
        .expect("tool end should emit");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "tool.result");
        assert_eq!(
            events[0].payload["result"]["structuredContent"],
            json!({
                "answer": "ok",
                "ids": ["doc-1"]
            })
        );
    }

    #[test]
    fn runtime_agent_failed_tool_end_emits_tool_failed() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-failed".to_string(),
            result: AgentToolResult {
                success: false,
                output: "test failed".to_string(),
                error: Some("exit code 101".to_string()),
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([
                    ("exit_code".to_string(), json!(101)),
                    ("failureCategory".to_string(), json!("test_failed")),
                ])),
            },
        })
        .expect("failed tool end should emit");

        assert_eq!(events.len(), 1);
        let failed_event = &events[0];
        assert_eq!(failed_event.event_type, "tool.failed");
        assert_eq!(
            failed_event.payload["toolCallId"].as_str(),
            Some("tool-failed")
        );
        assert_eq!(failed_event.payload["status"].as_str(), Some("failed"));
        assert_eq!(
            failed_event.payload["failureCategory"].as_str(),
            Some("test_failed")
        );
        assert_eq!(
            failed_event.payload["result"]["metadata"]["tool_process_summary"]["failed"]["key"],
            "toolCall.processSummary.error.failed"
        );
        assert_eq!(
            failed_event.payload["result"]["metadata"]["soul_phase"],
            "after_tool_failure"
        );
        assert_eq!(
            failed_event.payload["error"].as_str(),
            Some("exit code 101")
        );
        assert_eq!(failed_event.payload["output"].as_str(), Some("test failed"));
    }
}
