//! Aster 事件转换 adapter
//!
//! 将 Aster AgentEvent 转换为 runtime event 格式
//! 用于前端实时显示流式响应

use aster::AgentEvent;

use crate::protocol::{
    AgentContextTraceStep as RuntimeContextTraceStep, AgentEvent as RuntimeAgentEvent,
    AgentToolProgressPayload as RuntimeToolProgressPayload,
};
use crate::turn_context_configuration::{to_agent_turn_context, AgentTurnContext};
use std::collections::HashMap;
use tool_runtime::mcp_notification::{project_mcp_notification, McpNotificationProjection};

fn convert_mcp_notification(
    tool_id: String,
    notification: rmcp::model::ServerNotification,
) -> Vec<RuntimeAgentEvent> {
    project_mcp_notification(tool_id, notification)
        .into_iter()
        .map(|projection| match projection {
            McpNotificationProjection::ToolProgress { tool_id, progress } => {
                RuntimeAgentEvent::ToolProgress {
                    tool_id,
                    progress: RuntimeToolProgressPayload {
                        message: progress.message,
                        progress: progress.progress,
                        total: progress.total,
                        metadata: progress.metadata,
                    },
                }
            }
            McpNotificationProjection::ToolOutputDelta {
                tool_id,
                delta,
                output_kind,
                metadata,
            } => RuntimeAgentEvent::ToolOutputDelta {
                tool_id,
                delta,
                output_kind,
                metadata,
            },
        })
        .collect()
}

fn read_metadata_string(
    metadata: &HashMap<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn extract_turn_execution_strategy(turn_context: Option<&AgentTurnContext>) -> Option<String> {
    let metadata = &turn_context?.metadata;
    read_metadata_string(
        metadata,
        &[
            "effective_execution_strategy",
            "effectiveExecutionStrategy",
            "execution_strategy",
            "executionStrategy",
        ],
    )
    .map(|_| "react".to_string())
}

/// 将 Aster AgentEvent 转换为 RuntimeAgentEvent 列表
///
/// 一个 AgentEvent 可能产生多个 RuntimeAgentEvent
#[cfg(test)]
pub(crate) fn convert_agent_event(event: AgentEvent) -> Vec<RuntimeAgentEvent> {
    convert_agent_event_with_turn_context(event, None)
}

pub(crate) fn convert_agent_event_with_turn_context(
    event: AgentEvent,
    active_turn_context: Option<&AgentTurnContext>,
) -> Vec<RuntimeAgentEvent> {
    match event {
        AgentEvent::TurnStarted { turn } => {
            let agent_turn_context = turn.context_override.clone().map(to_agent_turn_context);
            let context_summary = crate::protocol_projection::project_turn_context_summary(
                agent_turn_context.as_ref(),
            );
            let execution_strategy = extract_turn_execution_strategy(agent_turn_context.as_ref());
            let approval_policy = agent_turn_context
                .as_ref()
                .and_then(|context| context.approval_policy.clone());
            let sandbox_policy = agent_turn_context
                .as_ref()
                .and_then(|context| context.sandbox_policy.clone());
            let turn_context_event = if turn.context_override.is_some()
                || turn.output_schema_runtime.is_some()
                || context_summary.is_some()
            {
                Some(RuntimeAgentEvent::TurnContext {
                    session_id: turn.session_id.clone(),
                    thread_id: turn.thread_id.clone(),
                    turn_id: turn.id.clone(),
                    execution_strategy,
                    output_schema_runtime: turn
                        .output_schema_runtime
                        .as_ref()
                        .map(
                            crate::session_execution_runtime_adapter::project_aster_output_schema_runtime,
                        ),
                    context_summary,
                    approval_policy,
                    sandbox_policy,
                })
            } else {
                None
            };
            let thread_id = turn.thread_id.clone();
            let mut events = vec![
                RuntimeAgentEvent::ThreadStarted { thread_id },
                RuntimeAgentEvent::TurnStarted {
                    turn: crate::protocol_projection::project_turn_runtime(
                        crate::runtime_timeline_adapter::convert_aster_turn_runtime(turn),
                    ),
                },
            ];
            if let Some(turn_context_event) = turn_context_event {
                events.push(turn_context_event);
            }
            events
        }
        AgentEvent::ItemStarted { item } => {
            crate::runtime_timeline_adapter::convert_aster_item_runtime(item)
                .map(crate::protocol_projection::project_item_runtime)
                .map(|item| RuntimeAgentEvent::ItemStarted { item })
                .into_iter()
                .collect()
        }
        AgentEvent::ItemUpdated { item } => {
            crate::runtime_timeline_adapter::convert_aster_item_runtime(item)
                .map(crate::protocol_projection::project_item_runtime)
                .map(|item| RuntimeAgentEvent::ItemUpdated { item })
                .into_iter()
                .collect()
        }
        AgentEvent::ItemCompleted { item } => {
            crate::runtime_timeline_adapter::convert_aster_item_runtime(item)
                .map(crate::protocol_projection::project_item_runtime)
                .map(|item| RuntimeAgentEvent::ItemCompleted { item })
                .into_iter()
                .collect()
        }
        AgentEvent::Message(message) => {
            crate::message_content_adapter::convert_aster_message_to_events_with_turn_context(
                message,
                active_turn_context,
            )
        }
        AgentEvent::McpNotification((tool_id, notification)) => {
            convert_mcp_notification(tool_id, notification)
        }
        AgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        } => vec![RuntimeAgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        }],
        AgentEvent::ModelChange { model, mode } => {
            vec![RuntimeAgentEvent::ModelChange { model, mode }]
        }
        AgentEvent::ProviderTrace { event } => vec![RuntimeAgentEvent::ProviderTrace { event }],
        AgentEvent::HistoryReplaced(_conversation) => vec![],
        AgentEvent::ContextTrace { steps } => vec![RuntimeAgentEvent::ContextTrace {
            steps: steps
                .into_iter()
                .map(|step| RuntimeContextTraceStep {
                    stage: step.stage,
                    detail: step.detail,
                })
                .collect(),
        }],
        AgentEvent::ContextCompactionStarted {
            item_id,
            trigger,
            detail,
        } => vec![RuntimeAgentEvent::ContextCompactionStarted {
            item_id,
            trigger,
            detail,
        }],
        AgentEvent::ContextCompactionCompleted {
            item_id,
            trigger,
            detail,
        } => vec![RuntimeAgentEvent::ContextCompactionCompleted {
            item_id,
            trigger,
            detail,
        }],
        AgentEvent::ContextCompactionWarning { message } => vec![RuntimeAgentEvent::Warning {
            code: Some("context_compaction_accuracy".to_string()),
            message,
        }],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message_content_adapter::convert_aster_message_to_events;
    use crate::protocol::AgentMessageContent as RuntimeMessageContent;
    use aster::TurnRuntime;
    use aster::{
        ActionRequiredData, ActionRequiredScope as AsterActionRequiredScope, Message,
        MessageContent,
    };
    use std::collections::HashMap;

    #[test]
    fn test_convert_text_delta() {
        let message = Message::assistant().with_text("Hello, world!");
        let events = convert_aster_message_to_events(message);

        assert_eq!(events.len(), 2);
        assert!(matches!(events[0], RuntimeAgentEvent::Message { .. }));
        assert!(matches!(
            &events[1],
            RuntimeAgentEvent::TextDelta { text } if text == "Hello, world!"
        ));
    }

    #[test]
    fn test_convert_action_required_scope_for_event_and_message_content() {
        let message = Message::assistant().with_content(MessageContent::ActionRequired(
            aster::ActionRequired {
                data: ActionRequiredData::Elicitation {
                    id: "req-1".to_string(),
                    message: "请补充发布渠道".to_string(),
                    requested_schema: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "channel": { "type": "string" }
                        }
                    }),
                },
                scope: Some(AsterActionRequiredScope {
                    session_id: Some("session-1".to_string()),
                    thread_id: Some("thread-1".to_string()),
                    turn_id: Some("turn-1".to_string()),
                }),
            },
        ));

        let events = convert_aster_message_to_events(message);
        let runtime_message = events
            .iter()
            .find_map(|event| match event {
                RuntimeAgentEvent::Message { message } => Some(message),
                _ => None,
            })
            .expect("expected runtime message event");
        assert_eq!(runtime_message.content.len(), 1);
        match &runtime_message.content[0] {
            RuntimeMessageContent::ActionRequired {
                id,
                action_type,
                data,
                scope,
            } => {
                assert_eq!(id, "req-1");
                assert_eq!(action_type, "elicitation");
                assert_eq!(
                    data.get("message").and_then(serde_json::Value::as_str),
                    Some("请补充发布渠道")
                );
                let scope = scope.as_ref().expect("expected action scope");
                assert_eq!(scope.session_id.as_deref(), Some("session-1"));
                assert_eq!(scope.thread_id.as_deref(), Some("thread-1"));
                assert_eq!(scope.turn_id.as_deref(), Some("turn-1"));
            }
            other => panic!("Expected ActionRequired message content, got {other:?}"),
        }

        assert_eq!(events.len(), 2);
        match &events[1] {
            RuntimeAgentEvent::ActionRequired {
                request_id,
                action_type,
                data,
                scope,
            } => {
                assert_eq!(request_id, "req-1");
                assert_eq!(action_type, "elicitation");
                assert_eq!(
                    data.get("message").and_then(serde_json::Value::as_str),
                    Some("请补充发布渠道")
                );
                let scope = scope.as_ref().expect("expected action scope");
                assert_eq!(scope.session_id.as_deref(), Some("session-1"));
                assert_eq!(scope.thread_id.as_deref(), Some("thread-1"));
                assert_eq!(scope.turn_id.as_deref(), Some("turn-1"));
            }
            other => panic!("Expected ActionRequired event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_model_change() {
        let event = AgentEvent::ModelChange {
            model: "claude-3".to_string(),
            mode: "chat".to_string(),
        };
        let events = convert_agent_event(event);

        assert_eq!(events.len(), 1);
        match &events[0] {
            RuntimeAgentEvent::ModelChange { model, mode } => {
                assert_eq!(model, "claude-3");
                assert_eq!(mode, "chat");
            }
            _ => panic!("Expected ModelChange event"),
        }
    }

    #[test]
    fn test_convert_context_trace() {
        let event = AgentEvent::ContextTrace {
            steps: vec![aster::ContextTraceStep {
                stage: "memory_injection".to_string(),
                detail: "query_len=10,injected=2".to_string(),
            }],
        };

        let events = convert_agent_event(event);
        assert_eq!(events.len(), 1);
        match &events[0] {
            RuntimeAgentEvent::ContextTrace { steps } => {
                assert_eq!(steps.len(), 1);
                assert_eq!(steps[0].stage, "memory_injection");
                assert_eq!(steps[0].detail, "query_len=10,injected=2");
            }
            _ => panic!("Expected ContextTrace event"),
        }
    }

    #[test]
    fn test_convert_mcp_notifications_to_tool_stream_events() {
        use rmcp::model::{
            LoggingLevel, LoggingMessageNotification, LoggingMessageNotificationMethod,
            LoggingMessageNotificationParam, NumberOrString, ProgressNotification,
            ProgressNotificationMethod, ProgressNotificationParam, ProgressToken,
            ServerNotification,
        };

        let progress_events = convert_agent_event(AgentEvent::McpNotification((
            "tool-1".to_string(),
            ServerNotification::ProgressNotification(ProgressNotification {
                method: ProgressNotificationMethod,
                params: ProgressNotificationParam {
                    progress_token: ProgressToken(NumberOrString::Number(7)),
                    progress: 2.0,
                    total: Some(4.0),
                    message: Some("正在处理第 2 项".to_string()),
                },
                extensions: Default::default(),
            }),
        )));

        assert_eq!(progress_events.len(), 1);
        match &progress_events[0] {
            RuntimeAgentEvent::ToolProgress { tool_id, progress } => {
                assert_eq!(tool_id, "tool-1");
                assert_eq!(progress.message.as_deref(), Some("正在处理第 2 项"));
                assert_eq!(progress.progress, Some(2.0));
                assert_eq!(progress.total, Some(4.0));
                assert_eq!(
                    progress
                        .metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("notification_kind"))
                        .and_then(serde_json::Value::as_str),
                    Some("mcp_progress")
                );
            }
            other => panic!("Expected ToolProgress event, got {other:?}"),
        }

        let output_events = convert_agent_event(AgentEvent::McpNotification((
            "tool-1".to_string(),
            ServerNotification::LoggingMessageNotification(LoggingMessageNotification {
                method: LoggingMessageNotificationMethod,
                params: LoggingMessageNotificationParam {
                    level: LoggingLevel::Info,
                    logger: Some("runner".to_string()),
                    data: serde_json::json!({
                        "message": "已生成一段工具输出",
                        "processId": "process-tool-1",
                        "executionProcessStatus": "running",
                        "executionProcessControlStatus": "registered",
                        "executionSurface": "live_process",
                        "stdinWritable": true,
                        "outputSequence": 3,
                        "outputKind": "stdout"
                    }),
                },
                extensions: Default::default(),
            }),
        )));

        assert_eq!(output_events.len(), 1);
        match &output_events[0] {
            RuntimeAgentEvent::ToolOutputDelta {
                tool_id,
                delta,
                output_kind,
                metadata,
            } => {
                assert_eq!(tool_id, "tool-1");
                assert!(delta.contains("已生成一段工具输出"));
                assert_eq!(output_kind.as_deref(), Some("log"));
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("notification_kind"))
                        .and_then(serde_json::Value::as_str),
                    Some("mcp_log")
                );
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("processId"))
                        .and_then(serde_json::Value::as_str),
                    Some("process-tool-1")
                );
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("executionProcessStatus"))
                        .and_then(serde_json::Value::as_str),
                    Some("running")
                );
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("executionProcessControlStatus"))
                        .and_then(serde_json::Value::as_str),
                    Some("registered")
                );
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("stdinWritable"))
                        .and_then(serde_json::Value::as_bool),
                    Some(true)
                );
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("outputSequence"))
                        .and_then(serde_json::Value::as_u64),
                    Some(3)
                );
            }
            other => panic!("Expected ToolOutputDelta event, got {other:?}"),
        }

        let lifecycle_events = convert_agent_event(AgentEvent::McpNotification((
            "tool-1".to_string(),
            ServerNotification::LoggingMessageNotification(LoggingMessageNotification {
                method: LoggingMessageNotificationMethod,
                params: LoggingMessageNotificationParam {
                    level: LoggingLevel::Info,
                    logger: Some("runner".to_string()),
                    data: serde_json::json!({
                        "message": "",
                        "delta": "",
                        "processId": "process-tool-1",
                        "executionProcessStatus": "started",
                        "executionProcessControlStatus": "registered",
                        "executionSurface": "live_process",
                        "stdinWritable": true,
                        "phase": "started"
                    }),
                },
                extensions: Default::default(),
            }),
        )));

        assert_eq!(lifecycle_events.len(), 1);
        match &lifecycle_events[0] {
            RuntimeAgentEvent::ToolOutputDelta {
                delta, metadata, ..
            } => {
                assert!(
                    delta.is_empty(),
                    "metadata-only process lifecycle logs should not render JSON as output"
                );
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("phase"))
                        .and_then(serde_json::Value::as_str),
                    Some("started")
                );
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|metadata| metadata.get("stdinWritable"))
                        .and_then(serde_json::Value::as_bool),
                    Some(true)
                );
            }
            other => panic!("Expected ToolOutputDelta event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_provider_tool_input_delta_event() {
        let events = convert_agent_event(AgentEvent::ToolInputDelta {
            tool_id: "tool-1".to_string(),
            tool_name: Some("read_file".to_string()),
            delta: "{\"path\"".to_string(),
            accumulated_arguments: Some("{\"path\"".to_string()),
            provider: Some("openai_compatible".to_string()),
        });

        assert_eq!(events.len(), 1);
        match &events[0] {
            RuntimeAgentEvent::ToolInputDelta {
                tool_id,
                tool_name,
                delta,
                accumulated_arguments,
                provider,
            } => {
                assert_eq!(tool_id, "tool-1");
                assert_eq!(tool_name.as_deref(), Some("read_file"));
                assert_eq!(delta, "{\"path\"");
                assert_eq!(accumulated_arguments.as_deref(), Some("{\"path\""));
                assert_eq!(provider.as_deref(), Some("openai_compatible"));
            }
            other => panic!("Expected ToolInputDelta event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_history_replaced_returns_empty_for_runtime_projection() {
        let event = AgentEvent::HistoryReplaced(aster::Conversation::empty());

        let events = convert_agent_event(event);
        assert!(events.is_empty());
    }

    #[test]
    fn test_convert_context_compaction_lifecycle_events() {
        let started_events = convert_agent_event(AgentEvent::ContextCompactionStarted {
            item_id: "compact-1".to_string(),
            trigger: "manual".to_string(),
            detail: Some("压缩最近 8 轮历史".to_string()),
        });
        assert_eq!(started_events.len(), 1);
        match &started_events[0] {
            RuntimeAgentEvent::ContextCompactionStarted {
                item_id,
                trigger,
                detail,
            } => {
                assert_eq!(item_id, "compact-1");
                assert_eq!(trigger, "manual");
                assert_eq!(detail.as_deref(), Some("压缩最近 8 轮历史"));
            }
            other => panic!("Expected ContextCompactionStarted event, got {other:?}"),
        }

        let completed_events = convert_agent_event(AgentEvent::ContextCompactionCompleted {
            item_id: "compact-1".to_string(),
            trigger: "auto".to_string(),
            detail: Some("已生成摘要并替换旧上下文".to_string()),
        });
        assert_eq!(completed_events.len(), 1);
        match &completed_events[0] {
            RuntimeAgentEvent::ContextCompactionCompleted {
                item_id,
                trigger,
                detail,
            } => {
                assert_eq!(item_id, "compact-1");
                assert_eq!(trigger, "auto");
                assert_eq!(detail.as_deref(), Some("已生成摘要并替换旧上下文"));
            }
            other => panic!("Expected ContextCompactionCompleted event, got {other:?}"),
        }

        let warning_events = convert_agent_event(AgentEvent::ContextCompactionWarning {
            message: "长对话和多次上下文压缩会降低模型准确性；如果后续结果开始漂移，建议新开会话。"
                .to_string(),
        });
        assert_eq!(warning_events.len(), 1);
        match &warning_events[0] {
            RuntimeAgentEvent::Warning { code, message } => {
                assert_eq!(code.as_deref(), Some("context_compaction_accuracy"));
                assert_eq!(
                    message,
                    "长对话和多次上下文压缩会降低模型准确性；如果后续结果开始漂移，建议新开会话。"
                );
            }
            other => panic!("Expected Warning event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_turn_started() {
        let turn = TurnRuntime::new(
            "turn-1",
            "session-1",
            "thread-1",
            Some("帮我总结".to_string()),
            None,
        );
        let events = convert_agent_event(AgentEvent::TurnStarted { turn });

        assert_eq!(events.len(), 2);
        match &events[0] {
            RuntimeAgentEvent::ThreadStarted { thread_id } => {
                assert_eq!(thread_id, "thread-1");
            }
            _ => panic!("Expected ThreadStarted event"),
        }
        match &events[1] {
            RuntimeAgentEvent::TurnStarted { turn } => {
                assert_eq!(turn.id, "turn-1");
                assert_eq!(turn.thread_id, "thread-1");
                assert_eq!(turn.prompt_text, "帮我总结");
            }
            _ => panic!("Expected TurnStarted event"),
        }
    }

    #[test]
    fn test_convert_turn_started_with_output_schema_runtime_emits_turn_context() {
        let turn = TurnRuntime::new(
            "turn-2",
            "session-2",
            "thread-2",
            Some("输出结构化结果".to_string()),
            Some(aster::TurnContextOverride {
                model: Some("gpt-5.4".to_string()),
                ..aster::TurnContextOverride::default()
            }),
        )
        .with_output_schema_runtime(Some(aster::TurnOutputSchemaRuntime {
            source: aster::TurnOutputSchemaSource::Turn,
            strategy: aster::TurnOutputSchemaStrategy::Native,
            provider_name: Some("openai".to_string()),
            model_name: Some("gpt-5.4".to_string()),
        }));

        let events = convert_agent_event(AgentEvent::TurnStarted { turn });

        assert_eq!(events.len(), 3);
        match &events[2] {
            RuntimeAgentEvent::TurnContext {
                session_id,
                thread_id,
                turn_id,
                output_schema_runtime,
                context_summary,
                ..
            } => {
                assert_eq!(session_id, "session-2");
                assert_eq!(thread_id, "thread-2");
                assert_eq!(turn_id, "turn-2");
                assert!(context_summary.is_none());
                let runtime = output_schema_runtime
                    .as_ref()
                    .expect("expected output schema runtime");
                assert_eq!(runtime.provider_name.as_deref(), Some("openai"));
                assert_eq!(runtime.model_name.as_deref(), Some("gpt-5.4"));
            }
            other => panic!("Expected TurnContext event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_turn_started_with_execution_strategy_emits_turn_context() {
        let mut metadata = HashMap::new();
        metadata.insert(
            "effective_execution_strategy".to_string(),
            serde_json::Value::String("react".to_string()),
        );
        let turn = TurnRuntime::new(
            "turn-code",
            "session-code",
            "thread-code",
            Some("修复图片卡片回归".to_string()),
            Some(aster::TurnContextOverride {
                metadata,
                ..aster::TurnContextOverride::default()
            }),
        );

        let events = convert_agent_event(AgentEvent::TurnStarted { turn });

        assert_eq!(events.len(), 3);
        match &events[2] {
            RuntimeAgentEvent::TurnContext {
                session_id,
                thread_id,
                turn_id,
                execution_strategy,
                ..
            } => {
                assert_eq!(session_id, "session-code");
                assert_eq!(thread_id, "thread-code");
                assert_eq!(turn_id, "turn-code");
                assert_eq!(execution_strategy.as_deref(), Some("react"));
            }
            other => panic!("Expected TurnContext event, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_turn_started_with_context_summary_facts() {
        let mut metadata = HashMap::new();
        metadata.insert(
            "agentui_context".to_string(),
            serde_json::json!({
                "memory_budget": {
                    "used_tokens": 640,
                    "max_tokens": 1200,
                    "status": "ready",
                    "source": "knowledge_context_resolver"
                },
                "retrieval_refs": [
                    {
                        "source_id": "knowledge_pack:brand:compiled/splits/brief.md",
                        "kind": "knowledge_pack",
                        "title": "brand:brief",
                        "path": "compiled/splits/brief.md",
                        "scope": "workspace",
                        "status": "ready",
                        "source": "knowledge_context_resolver"
                    }
                ],
                "missing_context": [
                    {
                        "id": "knowledge_warning:0",
                        "kind": "knowledge_warning",
                        "label": "sources/missing.md",
                        "status": "unknown",
                        "reason": "缺少来源",
                        "source": "knowledge_context_resolver"
                    }
                ]
            }),
        );
        metadata.insert(
            "team_memory_shadow".to_string(),
            serde_json::json!({
                "repo_scope": "/repo/lime",
                "entries": [
                    {
                        "key": "team.selection",
                        "content": "不要把 memory 正文透出到 AgentUI refs",
                        "updated_at": 1710000000
                    }
                ]
            }),
        );
        let turn = TurnRuntime::new(
            "turn-context",
            "session-context",
            "thread-context",
            Some("使用项目资料".to_string()),
            Some(aster::TurnContextOverride {
                approval_policy: Some("on-request".to_string()),
                sandbox_policy: Some("workspace-write".to_string()),
                metadata,
                ..aster::TurnContextOverride::default()
            }),
        );

        let events = convert_agent_event(AgentEvent::TurnStarted { turn });

        assert_eq!(events.len(), 3);
        match &events[2] {
            RuntimeAgentEvent::TurnContext {
                session_id,
                thread_id,
                turn_id,
                context_summary: Some(summary),
                approval_policy,
                sandbox_policy,
                ..
            } => {
                assert_eq!(session_id, "session-context");
                assert_eq!(thread_id, "thread-context");
                assert_eq!(turn_id, "turn-context");
                assert_eq!(approval_policy.as_deref(), Some("on-request"));
                assert_eq!(sandbox_policy.as_deref(), Some("workspace-write"));
                let budget = summary.memory_budget.as_ref().expect("context budget");
                assert_eq!(budget.used_tokens, Some(640));
                assert_eq!(budget.max_tokens, Some(1200));
                assert_eq!(summary.retrieval_refs.len(), 1);
                assert_eq!(
                    summary.retrieval_refs[0].source_id,
                    "knowledge_pack:brand:compiled/splits/brief.md"
                );
                assert_eq!(summary.missing_context[0].status, "unknown");
                assert_eq!(summary.team_memory_refs.len(), 1);
                assert_eq!(summary.team_memory_refs[0].key, "team.selection");
                assert_eq!(
                    summary.team_memory_refs[0].repo_scope.as_deref(),
                    Some("/repo/lime")
                );
            }
            other => panic!("Expected TurnContext with context_summary, got {other:?}"),
        }
    }

    #[test]
    fn test_convert_message_tool_response_preserves_mcp_structured_content() {
        let message = Message::assistant().with_tool_response(
            "tool-mcp-structured",
            Ok(rmcp::model::CallToolResult {
                content: vec![rmcp::model::Content::text("任务已完成")],
                structured_content: Some(serde_json::json!({
                    "answer": "ok",
                    "ids": ["doc-1"]
                })),
                meta: Some(rmcp::model::Meta(serde_json::Map::from_iter([(
                    "source".to_string(),
                    serde_json::json!("mcp"),
                )]))),
                is_error: None,
            }),
        );

        let events = convert_aster_message_to_events(message);

        let tool_end = events
            .iter()
            .find_map(|event| match event {
                RuntimeAgentEvent::ToolEnd { result, .. } => Some(result),
                _ => None,
            })
            .expect("expected tool_end event");
        assert_eq!(
            tool_end.structured_content.as_ref(),
            Some(&serde_json::json!({
                "answer": "ok",
                "ids": ["doc-1"]
            }))
        );
        assert_eq!(
            tool_end
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("source"))
                .and_then(serde_json::Value::as_str),
            Some("legacy_message_tool_response")
        );
    }

    #[test]
    fn test_convert_message_tool_response_marks_legacy_tool_end_as_compat() {
        let message = Message::assistant().with_tool_response(
            "tool-legacy-1",
            Ok(rmcp::model::CallToolResult {
                content: vec![rmcp::model::Content::text("任务已完成")],
                structured_content: None,
                meta: Some(rmcp::model::Meta(serde_json::Map::from_iter([
                    ("exit_code".to_string(), serde_json::json!(0)),
                    ("source".to_string(), serde_json::json!("tool_payload")),
                    ("sourceType".to_string(), serde_json::json!("custom_result")),
                    ("compat".to_string(), serde_json::json!(false)),
                    ("canonical".to_string(), serde_json::json!(true)),
                ]))),
                is_error: None,
            }),
        );

        let events = convert_aster_message_to_events(message);

        let tool_end = events
            .iter()
            .find_map(|event| match event {
                RuntimeAgentEvent::ToolEnd { result, .. } => Some(result),
                _ => None,
            })
            .expect("expected legacy tool_end event");
        let metadata = tool_end
            .metadata
            .as_ref()
            .expect("legacy tool_end metadata");
        assert_eq!(
            metadata.get("source"),
            Some(&serde_json::json!("legacy_message_tool_response"))
        );
        assert_eq!(
            metadata.get("sourceType"),
            Some(&serde_json::json!("tool_end"))
        );
        assert_eq!(metadata.get("compat"), Some(&serde_json::json!(true)));
        assert_eq!(metadata.get("canonical"), Some(&serde_json::json!(false)));
        assert_eq!(metadata.get("exit_code"), Some(&serde_json::json!(0)));
    }

    #[test]
    fn test_convert_message_tool_response_uses_turn_context_truncation_policy() {
        let message = Message::assistant().with_tool_response(
            "tool-legacy-truncated",
            Ok(rmcp::model::CallToolResult {
                content: vec![rmcp::model::Content::text(
                    "alpha beta gamma delta epsilon zeta eta theta iota kappa",
                )],
                structured_content: None,
                meta: None,
                is_error: None,
            }),
        );
        let turn_context = AgentTurnContext {
            metadata: HashMap::from([(
                "runtime_options".to_string(),
                serde_json::json!({
                    "harness": {
                        "model_request_policy": {
                            "truncation_policy": {
                                "mode": "tokens",
                                "limit": 4
                            }
                        }
                    }
                }),
            )]),
            ..AgentTurnContext::default()
        };

        let events = convert_agent_event_with_turn_context(
            AgentEvent::Message(message),
            Some(&turn_context),
        );

        let tool_end = events
            .iter()
            .find_map(|event| match event {
                RuntimeAgentEvent::ToolEnd { result, .. } => Some(result),
                _ => None,
            })
            .expect("expected legacy tool_end event");
        assert!(tool_end
            .output
            .starts_with("Warning: truncated output (original token count:"));
        assert!(tool_end.output.contains("Total output lines: 1"));
        assert!(tool_end.output.contains("tokens truncated"));
        let metadata = tool_end
            .metadata
            .as_ref()
            .expect("legacy tool_end metadata");
        assert_eq!(
            metadata.get("source"),
            Some(&serde_json::json!("legacy_message_tool_response"))
        );
        assert_eq!(metadata.get("compat"), Some(&serde_json::json!(true)));
        assert_eq!(metadata.get("canonical"), Some(&serde_json::json!(false)));
    }

    #[test]
    fn test_convert_failed_message_tool_response_marks_legacy_tool_end_as_compat() {
        let message = Message::assistant().with_tool_response(
            "tool-legacy-failed",
            Err(rmcp::model::ErrorData::new(
                rmcp::model::ErrorCode::INTERNAL_ERROR,
                "tool failed",
                None,
            )),
        );

        let events = convert_aster_message_to_events(message);

        let tool_end = events
            .iter()
            .find_map(|event| match event {
                RuntimeAgentEvent::ToolEnd { result, .. } => Some(result),
                _ => None,
            })
            .expect("expected legacy failed tool_end event");
        assert!(!tool_end.success);
        assert_eq!(tool_end.error.as_deref(), Some("-32603: tool failed"));
        let metadata = tool_end
            .metadata
            .as_ref()
            .expect("legacy failed tool_end metadata");
        assert_eq!(
            metadata.get("source"),
            Some(&serde_json::json!("legacy_message_tool_response"))
        );
        assert_eq!(metadata.get("compat"), Some(&serde_json::json!(true)));
        assert_eq!(metadata.get("canonical"), Some(&serde_json::json!(false)));
    }

    #[test]
    fn test_convert_message_emits_full_message_event_with_id() {
        let message = Message::assistant().with_id("resp-1").with_text("hello");

        let events = convert_agent_event(AgentEvent::Message(message));

        assert!(events.iter().any(
            |event| matches!(event, RuntimeAgentEvent::Message { message } if message.id.as_deref() == Some("resp-1"))
        ));
        assert!(events.iter().any(
            |event| matches!(event, RuntimeAgentEvent::TextDelta { text } if text == "hello")
        ));
    }
}
