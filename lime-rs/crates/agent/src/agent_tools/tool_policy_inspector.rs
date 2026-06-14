use crate::agent_tools::execution::{
    decide_tool_execution, persisted_tool_execution_policy_from_metadata,
    ToolExecutionDecisionInput, ToolExecutionDecisionKind, ToolExecutionResolverInput,
};
use anyhow::Result;
use aster::conversation::message::{Message, ToolRequest};
use aster::session_context;
use aster::tool_inspection::{InspectionAction, InspectionResult, ToolInspector};
use async_trait::async_trait;
use serde_json::{Map as JsonMap, Value};

#[derive(Debug, Default)]
pub struct WorkspaceToolPolicyInspector;

impl WorkspaceToolPolicyInspector {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl ToolInspector for WorkspaceToolPolicyInspector {
    fn name(&self) -> &'static str {
        "workspace_tool_policy"
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn inspect(
        &self,
        tool_requests: &[ToolRequest],
        _messages: &[Message],
    ) -> Result<Vec<InspectionResult>> {
        let turn_context = session_context::current_turn_context();
        let working_directory = turn_context
            .as_ref()
            .and_then(|context| context.cwd.clone())
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_default();
        let request_metadata = turn_context.as_ref().and_then(turn_context_metadata_value);
        let persisted_policy =
            persisted_tool_execution_policy_from_metadata(request_metadata.as_ref());

        let mut results = Vec::new();
        for request in tool_requests {
            let Ok(tool_call) = &request.tool_call else {
                continue;
            };
            let params = tool_call
                .arguments
                .clone()
                .map(Value::Object)
                .unwrap_or(Value::Null);
            let decision = decide_tool_execution(ToolExecutionDecisionInput {
                tool_name: tool_call.name.as_ref(),
                params: &params,
                working_directory: &working_directory,
                surface: "agent_tool_inspector",
                auto_mode: false,
                bypass_restrictions: false,
                approval_policy: turn_context
                    .as_ref()
                    .and_then(|context| context.approval_policy.as_deref()),
                requested_sandbox_policy: turn_context
                    .as_ref()
                    .and_then(|context| context.sandbox_policy.as_deref()),
                resolver_input: ToolExecutionResolverInput {
                    persisted_policy: persisted_policy.as_ref(),
                    request_metadata: request_metadata.as_ref(),
                },
            });

            let action = match decision.kind {
                ToolExecutionDecisionKind::Allow => InspectionAction::Allow,
                ToolExecutionDecisionKind::RequiresApproval => {
                    InspectionAction::RequireApproval(Some(decision.reason.clone()))
                }
                ToolExecutionDecisionKind::Deny | ToolExecutionDecisionKind::SandboxBlocked => {
                    InspectionAction::Deny
                }
            };

            results.push(InspectionResult {
                tool_request_id: request.id.clone(),
                action,
                reason: decision.reason,
                confidence: 1.0,
                inspector_name: self.name().to_string(),
                finding_id: Some(format!("workspace_tool_policy:{}", decision.reason_code)),
            });
        }

        Ok(results)
    }
}

fn turn_context_metadata_value(context: &aster::session::TurnContextOverride) -> Option<Value> {
    if context.metadata.is_empty() {
        return None;
    }
    let object = context
        .metadata
        .iter()
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<JsonMap<String, Value>>();
    Some(Value::Object(object))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::session::TurnContextOverride;
    use rmcp::model::CallToolRequestParam;
    use rmcp::object;
    use std::path::PathBuf;

    fn request(id: &str, name: &str, arguments: Value) -> ToolRequest {
        ToolRequest {
            id: id.to_string(),
            tool_call: Ok(CallToolRequestParam {
                name: name.to_string().into(),
                arguments: arguments.as_object().cloned(),
            }),
            metadata: None,
            tool_meta: None,
        }
    }

    #[tokio::test]
    async fn shell_on_request_policy_requires_approval_in_main_tool_inspector() {
        let inspector = WorkspaceToolPolicyInspector::new();
        let turn_context = TurnContextOverride {
            cwd: Some(PathBuf::from("/tmp/workspace")),
            approval_policy: Some("on-request".to_string()),
            sandbox_policy: Some("workspace-write".to_string()),
            ..TurnContextOverride::default()
        };

        let results = session_context::with_turn_context(
            Some(turn_context),
            inspector.inspect(
                &[request(
                    "tool-1",
                    "Bash",
                    Value::Object(object!({ "command": "cargo test" })),
                )],
                &[],
            ),
        )
        .await
        .expect("inspect");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].tool_request_id, "tool-1");
        assert!(matches!(
            results[0].action,
            InspectionAction::RequireApproval(Some(_))
        ));
        assert_eq!(
            results[0].finding_id.as_deref(),
            Some("workspace_tool_policy:shell_command_requires_approval")
        );
    }

    #[tokio::test]
    async fn persisted_policy_in_turn_metadata_allows_shell_in_main_tool_inspector() {
        let inspector = WorkspaceToolPolicyInspector::new();
        let turn_context = TurnContextOverride {
            cwd: Some(PathBuf::from("/tmp/workspace")),
            approval_policy: Some("on-request".to_string()),
            sandbox_policy: Some("workspace-write".to_string()),
            metadata: std::collections::HashMap::from([(
                "config".to_string(),
                serde_json::json!({
                    "agent": {
                        "toolExecution": {
                            "toolOverrides": {
                                "bash": {
                                    "warningPolicy": "none",
                                    "sandboxProfile": "none"
                                }
                            }
                        }
                    }
                }),
            )]),
            ..TurnContextOverride::default()
        };

        let results = session_context::with_turn_context(
            Some(turn_context),
            inspector.inspect(
                &[request(
                    "tool-1",
                    "Bash",
                    Value::Object(object!({ "command": "cargo test" })),
                )],
                &[],
            ),
        )
        .await
        .expect("inspect");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].action, InspectionAction::Allow);
        assert_eq!(
            results[0].finding_id.as_deref(),
            Some("workspace_tool_policy:allowed")
        );
    }

    #[tokio::test]
    async fn shell_never_policy_allows_main_tool_inspector_to_continue() {
        let inspector = WorkspaceToolPolicyInspector::new();
        let turn_context = TurnContextOverride {
            cwd: Some(PathBuf::from("/tmp/workspace")),
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("workspace-write".to_string()),
            ..TurnContextOverride::default()
        };

        let results = session_context::with_turn_context(
            Some(turn_context),
            inspector.inspect(
                &[request(
                    "tool-1",
                    "Bash",
                    Value::Object(object!({ "command": "cargo test" })),
                )],
                &[],
            ),
        )
        .await
        .expect("inspect");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].action, InspectionAction::Allow);
        assert_eq!(
            results[0].finding_id.as_deref(),
            Some("workspace_tool_policy:allowed")
        );
    }

    #[tokio::test]
    async fn shell_read_only_sandbox_denies_write_command_in_main_tool_inspector() {
        let inspector = WorkspaceToolPolicyInspector::new();
        let turn_context = TurnContextOverride {
            cwd: Some(PathBuf::from("/tmp/workspace")),
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("read-only".to_string()),
            ..TurnContextOverride::default()
        };

        let results = session_context::with_turn_context(
            Some(turn_context),
            inspector.inspect(
                &[request(
                    "tool-1",
                    "Bash",
                    Value::Object(object!({ "command": "cargo test" })),
                )],
                &[],
            ),
        )
        .await
        .expect("inspect");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].action, InspectionAction::Deny);
        assert_eq!(
            results[0].finding_id.as_deref(),
            Some("workspace_tool_policy:read_only_sandbox_blocks_shell_command")
        );
    }
}
