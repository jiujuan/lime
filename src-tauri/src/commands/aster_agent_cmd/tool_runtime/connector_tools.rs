use super::*;

#[path = "connector_tools/cloud_overlay_outbox.rs"]
mod cloud_overlay_outbox;
#[path = "connector_tools/fixture_adapter.rs"]
mod fixture_adapter;
#[path = "connector_tools/readiness.rs"]
mod readiness;
#[path = "connector_tools/sanitize.rs"]
mod sanitize;
#[cfg(test)]
#[path = "connector_tools/tests.rs"]
mod tests;

use cloud_overlay_outbox::enqueue_cloud_overlay_connector_mutation;
use fixture_adapter::execute_host_fixture_connector_mutation;
use readiness::ConnectorAdapterReadiness;

#[derive(Clone)]
pub(crate) struct AgentAppConnectorPreviewTool {
    tool_name: String,
    connector_id: String,
    action: String,
    adapter: ConnectorAdapterReadiness,
}

impl AgentAppConnectorPreviewTool {
    fn new(
        tool_name: String,
        connector_id: String,
        action: String,
        request_metadata: Option<&serde_json::Value>,
    ) -> Self {
        let adapter = ConnectorAdapterReadiness::for_request(
            connector_id.as_str(),
            action.as_str(),
            request_metadata,
        );
        Self {
            tool_name,
            connector_id,
            action,
            adapter,
        }
    }

    fn parse_connector_tool_name(tool_name: &str) -> Option<(String, String)> {
        let mut parts = tool_name.trim().split("__");
        match (parts.next(), parts.next(), parts.next(), parts.next()) {
            (Some("connector"), Some(connector_id), Some(action), None)
                if !connector_id.trim().is_empty() && !action.trim().is_empty() =>
            {
                Some((connector_id.trim().to_string(), action.trim().to_string()))
            }
            _ => None,
        }
    }

    fn register_if_supported(
        registry: &mut aster::tools::ToolRegistry,
        tool_name: &str,
        request_metadata: Option<&serde_json::Value>,
    ) -> bool {
        let Some((connector_id, action)) = Self::parse_connector_tool_name(tool_name) else {
            return false;
        };
        if registry.contains(tool_name) {
            return false;
        }
        registry.register(Box::new(Self::new(
            tool_name.to_string(),
            connector_id,
            action,
            request_metadata,
        )));
        true
    }
}

#[async_trait]
impl Tool for AgentAppConnectorPreviewTool {
    fn name(&self) -> &str {
        &self.tool_name
    }

    fn description(&self) -> &str {
        "Agent App connector execution gate preview：当前只在 ToolRuntime 内承接 connector intent，不直接执行外部平台 mutation。"
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "connectorId": {
                    "type": "string",
                    "description": "Host-managed connector id。"
                },
                "action": {
                    "type": "string",
                    "description": "Connector action id。"
                },
                "input": {
                    "type": "object",
                    "description": "Connector action input；secret/token 必须留在 Host / Cloud Overlay。"
                },
                "reason": {
                    "type": "string",
                    "description": "业务 App 发起 connector intent 的原因。"
                }
            },
            "required": ["connectorId", "action"],
            "additionalProperties": true,
            "x-lime": {
                "always_visible": false,
                "tags": ["agent-app", "connector", "preview"],
                "allowed_callers": ["assistant", "skill"],
                "secret_binding": "host_managed",
                "token_exposed": false
            }
        })
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new()
            .with_max_retries(0)
            .with_base_timeout(Duration::from_secs(30))
            .with_dynamic_timeout(false)
    }

    async fn execute(
        &self,
        params: serde_json::Value,
        _context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        let connector_id = params
            .get("connectorId")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(self.connector_id.as_str());
        let action = params
            .get("action")
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(self.action.as_str());

        if connector_id != self.connector_id || action != self.action {
            return Err(ToolError::invalid_params(format!(
                "connector tool mismatch: expected {}/{}",
                self.connector_id, self.action
            )));
        }

        if self.adapter.is_host_fixture() {
            return execute_host_fixture_connector_mutation(
                &self.connector_id,
                &self.action,
                &params,
                _context,
                &self.adapter,
            )
            .await;
        }
        if self.adapter.is_cloud_overlay_outbox() {
            return enqueue_cloud_overlay_connector_mutation(
                &self.connector_id,
                &self.action,
                &params,
                _context,
                &self.adapter,
            )
            .await;
        }

        let result_payload = serde_json::json!({
            "success": false,
            "status": "not_available",
            "reason": self.adapter.reason,
            "connectorId": self.connector_id,
            "action": self.action,
            "adapterKind": self.adapter.kind,
            "adapterReadiness": self.adapter.readiness,
            "secretBinding": "host_managed",
            "tokenExposed": false,
            "source": "agent_app_connector_preview_tool",
            "next": {
                "owner": "lime_connector_policy",
                "required": self.adapter.next_required
            }
        });
        let output = serde_json::to_string_pretty(&result_payload)
            .unwrap_or_else(|_| result_payload.to_string());
        Ok(ToolResult::error(output).with_metadata("result", result_payload))
    }
}

pub(crate) fn register_agent_app_connector_preview_tools(
    registry: &mut aster::tools::ToolRegistry,
    request_metadata: Option<&serde_json::Value>,
) -> usize {
    resolve_agent_app_tool_execution_allowed_tools(request_metadata)
        .into_iter()
        .filter(|tool_name| {
            AgentAppConnectorPreviewTool::register_if_supported(
                registry,
                tool_name,
                request_metadata,
            )
        })
        .count()
}
