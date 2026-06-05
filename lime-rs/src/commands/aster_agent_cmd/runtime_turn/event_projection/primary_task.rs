use super::*;

pub(super) fn build_agent_app_runtime_event_primary_task_event(
    event: &RuntimeAgentEvent,
    runtime_event: Value,
) -> Option<Value> {
    match event {
        RuntimeAgentEvent::TextDelta { text } => build_runtime_projection_stream_task_event(
            "runtime:text",
            "task:partialArtifact",
            "assistant_text_delta",
            "streaming",
            text,
            runtime_event,
        ),
        RuntimeAgentEvent::TextDeltaBatch { text, .. } => {
            build_runtime_projection_stream_task_event(
                "runtime:text-batch",
                "task:partialArtifact",
                "assistant_text_batch",
                "streaming",
                text,
                runtime_event,
            )
        }
        RuntimeAgentEvent::ThinkingDelta { text } => build_runtime_projection_stream_task_event(
            "runtime:thinking",
            "task:progress",
            "thinking_delta",
            "thinking",
            text,
            runtime_event,
        ),
        RuntimeAgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            ..
        } => {
            let mut event = build_runtime_projection_stream_task_event(
                "runtime:tool-input",
                "task:toolCall",
                "tool_input_delta",
                "streaming",
                delta,
                runtime_event,
            )?;
            if let Some(task_event) = event.as_object_mut() {
                task_event.insert("toolId".to_string(), json!(tool_id));
                if let Some(tool_name) = tool_name {
                    task_event.insert("toolName".to_string(), json!(tool_name));
                }
            }
            Some(event)
        }
        RuntimeAgentEvent::ToolOutputDelta {
            tool_id,
            delta,
            output_kind,
            ..
        } => {
            let mut event = build_runtime_projection_stream_task_event(
                "runtime:tool-output",
                "task:toolCall",
                "tool_output_delta",
                "streaming",
                delta,
                runtime_event,
            )?;
            if let Some(task_event) = event.as_object_mut() {
                task_event.insert("toolId".to_string(), json!(tool_id));
                if let Some(output_kind) = output_kind {
                    task_event.insert("toolName".to_string(), json!(output_kind));
                }
            }
            Some(event)
        }
        RuntimeAgentEvent::TaskProfileResolved { task_profile } => {
            Some(Value::Object(build_runtime_projection_task_event(
                format!("runtime:task-profile:{}", task_profile.kind),
                "task:progress",
                "routing",
                format!("已识别任务类型：{}", task_profile.kind),
                runtime_event,
            )))
        }
        RuntimeAgentEvent::CandidateSetResolved { routing_decision } => {
            Some(Value::Object(build_runtime_projection_task_event(
                "runtime:routing:candidates".to_string(),
                "task:progress",
                "routing",
                format!("已找到 {} 个候选模型", routing_decision.candidate_count),
                runtime_event,
            )))
        }
        RuntimeAgentEvent::RoutingDecisionMade { routing_decision } => {
            let selected = routing_decision
                .selected_provider
                .as_deref()
                .zip(routing_decision.selected_model.as_deref())
                .map(|(provider, model)| format!("{provider}/{model}"))
                .or_else(|| routing_decision.selected_model.clone())
                .or_else(|| routing_decision.selected_provider.clone())
                .unwrap_or_else(|| "自动选择".to_string());
            Some(Value::Object(build_runtime_projection_task_event(
                "runtime:routing:decision".to_string(),
                "task:progress",
                "routing",
                format!("模型路由已确定：{selected}"),
                runtime_event,
            )))
        }
        RuntimeAgentEvent::RoutingFallbackApplied { routing_decision } => {
            let selected = routing_decision
                .selected_model
                .clone()
                .or_else(|| routing_decision.selected_provider.clone())
                .unwrap_or_else(|| "备用模型".to_string());
            Some(Value::Object(build_runtime_projection_task_event(
                "runtime:routing:fallback".to_string(),
                "task:incident",
                "warning",
                format!("模型路由已回退到：{selected}"),
                runtime_event,
            )))
        }
        RuntimeAgentEvent::RoutingNotPossible { routing_decision } => {
            let mut task_event = build_runtime_projection_task_event(
                "runtime:routing:not-possible".to_string(),
                "task:error",
                "failed",
                routing_decision.decision_reason.clone(),
                runtime_event,
            );
            task_event.insert("severity".to_string(), json!("error"));
            Some(Value::Object(task_event))
        }
        RuntimeAgentEvent::RuntimeStatus { status } => {
            Some(Value::Object(build_runtime_projection_task_event(
                format!("runtime:status:{}", status.phase),
                "task:progress",
                status.phase.clone(),
                status.title.clone(),
                runtime_event,
            )))
        }
        RuntimeAgentEvent::ToolStart {
            tool_name, tool_id, ..
        } => Some(build_runtime_projection_tool_task_event(
            format!("runtime:tool:{tool_id}:started"),
            "running",
            format!("工具 {tool_name} 开始执行"),
            Some(tool_name.clone()),
            runtime_event,
            false,
        )),
        RuntimeAgentEvent::ToolEnd { tool_id, result } => {
            let tool_name = runtime_tool_name_from_result_metadata(result).map(str::to_string);
            Some(build_runtime_projection_tool_task_event(
                format!("runtime:tool:{tool_id}:completed"),
                if result.success {
                    "completed"
                } else {
                    "failed"
                },
                result
                    .error
                    .clone()
                    .unwrap_or_else(|| "工具调用已完成".to_string()),
                tool_name,
                runtime_event,
                !result.success,
            ))
        }
        RuntimeAgentEvent::ToolProgress { tool_id, progress } => {
            Some(Value::Object(build_runtime_projection_task_event(
                format!("runtime:tool:{tool_id}:progress"),
                "task:toolCall",
                "running",
                progress
                    .message
                    .clone()
                    .unwrap_or_else(|| "工具正在执行".to_string()),
                runtime_event,
            )))
        }
        RuntimeAgentEvent::ArtifactSnapshot { artifact } => {
            Some(build_runtime_projection_artifact_task_event(
                format!("runtime:artifact:{}", artifact.artifact_id),
                "created",
                format!("Artifact 已创建：{}", artifact.file_path),
                artifact.file_path.clone(),
                runtime_event,
                runtime_workspace_patch_from_metadata_map(artifact.metadata.as_ref()),
            ))
        }
        RuntimeAgentEvent::ActionRequired {
            request_id,
            action_type,
            ..
        } => {
            let event_type = if action_type.contains("missing") || action_type.contains("ask") {
                "task:missingContextRequested"
            } else {
                "task:reviewRequested"
            };
            let mut task_event = build_runtime_projection_task_event(
                format!("runtime:action:{request_id}:required"),
                event_type,
                "pending",
                "AgentRuntime 等待 Host / 用户响应",
                runtime_event,
            );
            task_event.insert("requestId".to_string(), json!(request_id));
            Some(Value::Object(task_event))
        }
        RuntimeAgentEvent::ActionResolved { request_id, .. } => {
            let mut task_event = build_runtime_projection_task_event(
                format!("runtime:action:{request_id}:resolved"),
                "task:reviewResolved",
                "resolved",
                "Host / 用户响应已提交到 AgentRuntime",
                runtime_event,
            );
            task_event.insert("requestId".to_string(), json!(request_id));
            Some(Value::Object(task_event))
        }
        RuntimeAgentEvent::TurnCompleted { turn } => {
            Some(Value::Object(build_runtime_projection_task_event(
                format!("runtime:turn:{}:completed", turn.id),
                "task:completed",
                turn.status.as_str(),
                "AgentRuntime 回合已完成",
                runtime_event,
            )))
        }
        RuntimeAgentEvent::TurnFailed { turn } => {
            let mut task_event = build_runtime_projection_task_event(
                format!("runtime:turn:{}:failed", turn.id),
                "task:error",
                turn.status.as_str(),
                turn.error_message
                    .clone()
                    .unwrap_or_else(|| "AgentRuntime 回合执行失败".to_string()),
                runtime_event,
            );
            task_event.insert("severity".to_string(), json!("error"));
            Some(Value::Object(task_event))
        }
        RuntimeAgentEvent::ItemStarted { item } | RuntimeAgentEvent::ItemUpdated { item } => {
            match &item.payload {
                AgentThreadItemPayload::ToolCall { tool_name, .. } => {
                    Some(build_runtime_projection_tool_task_event(
                        format!("runtime:item:{}:tool", item.id),
                        item.status.as_str(),
                        format!("工具 {tool_name} {}", item.status.as_str()),
                        Some(tool_name.clone()),
                        runtime_event,
                        item.status == AgentThreadItemStatus::Failed,
                    ))
                }
                AgentThreadItemPayload::ApprovalRequest {
                    request_id, prompt, ..
                }
                | AgentThreadItemPayload::RequestUserInput {
                    request_id, prompt, ..
                } => {
                    let mut task_event = build_runtime_projection_task_event(
                        format!("runtime:item:{}:review", item.id),
                        "task:reviewRequested",
                        item.status.as_str(),
                        prompt
                            .clone()
                            .unwrap_or_else(|| "任务等待 Host / 用户响应".to_string()),
                        runtime_event,
                    );
                    task_event.insert("requestId".to_string(), json!(request_id));
                    Some(Value::Object(task_event))
                }
                _ => None,
            }
        }
        RuntimeAgentEvent::ItemCompleted { item } => match &item.payload {
            AgentThreadItemPayload::ToolCall {
                tool_name,
                success,
                error,
                ..
            } => Some(build_runtime_projection_tool_task_event(
                format!("runtime:item:{}:tool", item.id),
                item.status.as_str(),
                error
                    .clone()
                    .unwrap_or_else(|| format!("工具 {tool_name} {}", item.status.as_str())),
                Some(tool_name.clone()),
                runtime_event,
                item.status == AgentThreadItemStatus::Failed || matches!(success, Some(false)),
            )),
            AgentThreadItemPayload::FileArtifact { path, metadata, .. } => {
                Some(build_runtime_projection_artifact_task_event(
                    format!("runtime:item:{}:artifact", item.id),
                    item.status.as_str(),
                    format!("Artifact 已创建：{path}"),
                    path.clone(),
                    runtime_event,
                    runtime_workspace_patch_from_metadata_value(metadata.as_ref()),
                ))
            }
            AgentThreadItemPayload::ApprovalRequest {
                request_id, prompt, ..
            }
            | AgentThreadItemPayload::RequestUserInput {
                request_id, prompt, ..
            } => {
                let mut task_event = build_runtime_projection_task_event(
                    format!("runtime:item:{}:review", item.id),
                    "task:reviewResolved",
                    item.status.as_str(),
                    prompt
                        .clone()
                        .unwrap_or_else(|| "Host / 用户响应已记录".to_string()),
                    runtime_event,
                );
                task_event.insert("requestId".to_string(), json!(request_id));
                Some(Value::Object(task_event))
            }
            AgentThreadItemPayload::Warning { message, code } => {
                let mut task_event = build_runtime_projection_task_event(
                    format!(
                        "runtime:item:{}:{}",
                        item.id,
                        code.as_deref().unwrap_or("warning")
                    ),
                    "task:incident",
                    item.status.as_str(),
                    message.clone(),
                    runtime_event,
                );
                task_event.insert("severity".to_string(), json!("warning"));
                Some(Value::Object(task_event))
            }
            AgentThreadItemPayload::Error { message } => {
                let mut task_event = build_runtime_projection_task_event(
                    format!("runtime:item:{}:error", item.id),
                    "task:error",
                    item.status.as_str(),
                    message.clone(),
                    runtime_event,
                );
                task_event.insert("severity".to_string(), json!("error"));
                Some(Value::Object(task_event))
            }
            _ => None,
        },
        RuntimeAgentEvent::QueueAdded { queued_turn, .. } => {
            Some(Value::Object(build_runtime_projection_task_event(
                format!("runtime:queue:{}:added", queued_turn.queued_turn_id),
                "task:queued",
                "queued",
                queued_turn.message_preview.clone(),
                runtime_event,
            )))
        }
        RuntimeAgentEvent::QueueStarted { queued_turn_id, .. } => {
            Some(Value::Object(build_runtime_projection_task_event(
                format!("runtime:queue:{queued_turn_id}:started"),
                "task:progress",
                "running",
                "排队任务已开始执行",
                runtime_event,
            )))
        }
        RuntimeAgentEvent::QueueRemoved { queued_turn_id, .. } => {
            Some(Value::Object(build_runtime_projection_task_event(
                format!("runtime:queue:{queued_turn_id}:removed"),
                "task:cancelled",
                "cancelled",
                "排队任务已移除",
                runtime_event,
            )))
        }
        RuntimeAgentEvent::QueueCleared { .. } => {
            Some(Value::Object(build_runtime_projection_task_event(
                "runtime:queue:cleared".to_string(),
                "task:cancelled",
                "cancelled",
                "排队任务已清空",
                runtime_event,
            )))
        }
        RuntimeAgentEvent::Done { .. } | RuntimeAgentEvent::FinalDone { .. } => {
            Some(Value::Object(build_runtime_projection_task_event(
                "runtime:done".to_string(),
                "task:completed",
                "completed",
                "AgentRuntime 本轮输出已结束",
                runtime_event,
            )))
        }
        RuntimeAgentEvent::Error { message } => {
            let mut task_event = build_runtime_projection_task_event(
                "runtime:error".to_string(),
                "task:error",
                "failed",
                message.clone(),
                runtime_event,
            );
            task_event.insert("severity".to_string(), json!("error"));
            Some(Value::Object(task_event))
        }
        RuntimeAgentEvent::Warning { code, message } => {
            let mut task_event = build_runtime_projection_task_event(
                format!("runtime:warning:{}", code.as_deref().unwrap_or("warning")),
                "task:incident",
                "warning",
                message.clone(),
                runtime_event,
            );
            task_event.insert("severity".to_string(), json!("warning"));
            Some(Value::Object(task_event))
        }
        _ => None,
    }
}
