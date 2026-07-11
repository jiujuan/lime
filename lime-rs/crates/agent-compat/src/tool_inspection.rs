use anyhow::Result;
use async_trait::async_trait;

use crate::conversation::message::{Message, ToolRequest};

/// Result of inspecting a tool call
#[derive(Debug, Clone)]
pub struct InspectionResult {
    pub tool_request_id: String,
    pub action: InspectionAction,
    pub reason: String,
    pub confidence: f32,
    pub inspector_name: String,
    pub finding_id: Option<String>,
}

/// Action to take based on inspection result
#[derive(Debug, Clone, PartialEq)]
pub enum InspectionAction {
    /// Allow the tool to execute without user intervention
    Allow,
    /// Deny the tool execution completely
    Deny,
    /// Require user approval before execution (with optional warning message)
    RequireApproval(Option<String>),
}

/// Trait for all tool inspectors
#[async_trait]
pub trait ToolInspector: Send + Sync {
    /// Name of this inspector (for logging/debugging)
    fn name(&self) -> &'static str;

    /// Inspect tool requests and return results
    async fn inspect(
        &self,
        tool_requests: &[ToolRequest],
        messages: &[Message],
    ) -> Result<Vec<InspectionResult>>;

    /// Whether this inspector is enabled
    fn is_enabled(&self) -> bool {
        true
    }

    /// Allow downcasting to concrete types
    fn as_any(&self) -> &dyn std::any::Any;
}

/// Manages all tool inspectors and coordinates their results
pub struct ToolInspectionManager {
    inspectors: Vec<Box<dyn ToolInspector>>,
}

impl ToolInspectionManager {
    pub fn new() -> Self {
        Self {
            inspectors: Vec::new(),
        }
    }

    /// Add an inspector to the manager
    /// Inspectors run in the order they are added
    pub fn add_inspector(&mut self, inspector: Box<dyn ToolInspector>) {
        self.inspectors.push(inspector);
    }

    /// Run all inspectors on the tool requests
    pub async fn inspect_tools(
        &self,
        tool_requests: &[ToolRequest],
        messages: &[Message],
    ) -> Result<Vec<InspectionResult>> {
        let mut all_results = Vec::new();

        for inspector in &self.inspectors {
            if !inspector.is_enabled() {
                continue;
            }

            tracing::debug!(
                inspector_name = inspector.name(),
                tool_count = tool_requests.len(),
                "Running tool inspector"
            );

            match inspector.inspect(tool_requests, messages).await {
                Ok(results) => {
                    tracing::debug!(
                        inspector_name = inspector.name(),
                        result_count = results.len(),
                        "Tool inspector completed"
                    );
                    all_results.extend(results);
                }
                Err(e) => {
                    tracing::error!(
                        inspector_name = inspector.name(),
                        error = %e,
                        "Tool inspector failed"
                    );
                    // Continue with other inspectors even if one fails
                }
            }
        }

        Ok(all_results)
    }

    /// Get list of registered inspector names
    pub fn inspector_names(&self) -> Vec<&'static str> {
        self.inspectors.iter().map(|i| i.name()).collect()
    }
}

impl Default for ToolInspectionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Default)]
pub(crate) struct ToolInspectionDecision {
    pub approved: Vec<ToolRequest>,
    pub needs_approval: Vec<ToolRequest>,
    pub denied: Vec<ToolRequest>,
}

pub(crate) fn categorize_inspected_tools(
    requests: &[ToolRequest],
    inspection_results: &[InspectionResult],
) -> ToolInspectionDecision {
    let mut decision = ToolInspectionDecision::default();

    for request in requests {
        let matching = inspection_results
            .iter()
            .filter(|result| result.tool_request_id == request.id)
            .collect::<Vec<_>>();

        for result in &matching {
            tracing::info!(
                inspector_name = result.inspector_name,
                tool_request_id = %result.tool_request_id,
                action = ?result.action,
                confidence = result.confidence,
                reason = %result.reason,
                finding_id = ?result.finding_id,
                "Applying inspection result"
            );
        }

        if matching
            .iter()
            .any(|result| result.action == InspectionAction::Deny)
        {
            decision.denied.push(request.clone());
        } else if matching
            .iter()
            .any(|result| matches!(result.action, InspectionAction::RequireApproval(_)))
        {
            decision.needs_approval.push(request.clone());
        } else if matching
            .iter()
            .any(|result| result.action == InspectionAction::Allow)
        {
            decision.approved.push(request.clone());
        } else {
            decision.needs_approval.push(request.clone());
        }
    }

    decision
}

pub fn get_security_finding_id_from_results(
    tool_request_id: &str,
    inspection_results: &[InspectionResult],
) -> Option<String> {
    inspection_results
        .iter()
        .find(|result| {
            result.tool_request_id == tool_request_id && result.inspector_name == "security"
        })
        .and_then(|result| result.finding_id.clone())
}
