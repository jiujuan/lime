use serde_json::Value;
use std::collections::HashMap;

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
}
