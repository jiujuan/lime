use serde_json::Value;
use std::collections::HashMap;

use crate::shell_analysis::{
    is_bash_command_concurrency_safe, is_powershell_command_concurrency_safe,
};

#[derive(Debug, Clone)]
pub struct PlannedToolExecution {
    pub tool_name: String,
    pub tool_id: String,
    pub arguments: Option<String>,
    pub params: Value,
}

#[derive(Debug, Clone)]
pub struct ToolExecutionOutcome<TEvent = ()> {
    pub tool_name: String,
    pub tool_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub metadata: Option<HashMap<String, Value>>,
    pub stream_events: Vec<TEvent>,
}

#[derive(Debug, Clone)]
pub struct ToolExecutionBatch<TEvent = ()> {
    pub events: Vec<TEvent>,
    pub outcomes: Vec<ToolExecutionOutcome<TEvent>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolExecutionScheduleBatch<T> {
    pub is_concurrency_safe: bool,
    pub requests: Vec<T>,
}

#[derive(Debug, Clone)]
pub struct ToolTerminalEventUpdate {
    pub tool_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub metadata: Option<HashMap<String, Value>>,
}

impl ToolTerminalEventUpdate {
    pub fn from_outcome<TEvent>(outcome: &ToolExecutionOutcome<TEvent>) -> Self {
        Self {
            tool_id: outcome.tool_id.clone(),
            success: outcome.success,
            output: outcome.output.clone(),
            error: outcome.error.clone(),
            metadata: outcome.metadata.clone(),
        }
    }
}

pub fn runtime_tool_call_concurrency_safe(tool_name: &str, command: Option<&str>) -> bool {
    match tool_name {
        "Read" | "Glob" | "Grep" | "WebFetch" | "WebSearch" | "list_mcp_resources"
        | "read_mcp_resource" => true,
        "Bash" => command.is_some_and(is_bash_command_concurrency_safe),
        "PowerShell" => command.is_some_and(is_powershell_command_concurrency_safe),
        _ => false,
    }
}

pub fn partition_tool_execution_requests<T, F>(
    requests: &[T],
    mut is_concurrency_safe: F,
) -> Vec<ToolExecutionScheduleBatch<T>>
where
    T: Clone,
    F: FnMut(&T) -> bool,
{
    let mut batches = Vec::new();

    for request in requests {
        let is_concurrency_safe = is_concurrency_safe(request);
        if is_concurrency_safe
            && batches
                .last()
                .is_some_and(|batch: &ToolExecutionScheduleBatch<T>| batch.is_concurrency_safe)
        {
            if let Some(last_batch) = batches.last_mut() {
                last_batch.requests.push(request.clone());
            }
            continue;
        }

        batches.push(ToolExecutionScheduleBatch {
            is_concurrency_safe,
            requests: vec![request.clone()],
        });
    }

    batches
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn terminal_update_should_clone_outcome_terminal_fields() {
        let outcome = ToolExecutionOutcome::<String> {
            tool_name: "Echo".to_string(),
            tool_id: "tool-1".to_string(),
            success: true,
            output: "ok".to_string(),
            error: None,
            metadata: Some(HashMap::from([("source".to_string(), json!("test"))])),
            stream_events: vec!["event".to_string()],
        };

        let update = ToolTerminalEventUpdate::from_outcome(&outcome);

        assert_eq!(update.tool_id, "tool-1");
        assert!(update.success);
        assert_eq!(update.output, "ok");
        assert_eq!(
            update
                .metadata
                .as_ref()
                .and_then(|value| value.get("source")),
            Some(&json!("test"))
        );
    }

    #[test]
    fn runtime_tool_call_concurrency_safe_keeps_read_only_tools_parallel() {
        assert!(runtime_tool_call_concurrency_safe("Read", None));
        assert!(runtime_tool_call_concurrency_safe("WebSearch", None));
        assert!(runtime_tool_call_concurrency_safe(
            "Bash",
            Some("rg Lime src | head -20")
        ));
        assert!(runtime_tool_call_concurrency_safe(
            "PowerShell",
            Some("Get-Content README.md | Select-String Lime")
        ));
    }

    #[test]
    fn runtime_tool_call_concurrency_safe_rejects_mutating_or_unknown_tools() {
        assert!(!runtime_tool_call_concurrency_safe(
            "Bash",
            Some("mkdir tmp-output")
        ));
        assert!(!runtime_tool_call_concurrency_safe(
            "PowerShell",
            Some("Set-Content out.txt hi")
        ));
        assert!(!runtime_tool_call_concurrency_safe("Ask", None));
        assert!(!runtime_tool_call_concurrency_safe("Bash", None));
    }

    #[test]
    fn partition_tool_execution_requests_groups_adjacent_safe_requests_only() {
        let requests = vec![
            ("Read", None),
            ("WebSearch", None),
            ("Bash", Some("mkdir tmp-output")),
            ("Glob", None),
            ("Grep", None),
        ];

        let batches = partition_tool_execution_requests(&requests, |(name, command)| {
            runtime_tool_call_concurrency_safe(name, *command)
        });

        assert_eq!(batches.len(), 3);
        assert!(batches[0].is_concurrency_safe);
        assert_eq!(
            batches[0].requests,
            vec![("Read", None), ("WebSearch", None)]
        );
        assert!(!batches[1].is_concurrency_safe);
        assert_eq!(
            batches[1].requests,
            vec![("Bash", Some("mkdir tmp-output"))]
        );
        assert!(batches[2].is_concurrency_safe);
        assert_eq!(batches[2].requests, vec![("Glob", None), ("Grep", None)]);
    }
}
