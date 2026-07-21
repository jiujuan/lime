use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const TOOL_CONFIRMATION_ACTION_TYPE: &str = "tool_confirmation";
pub const ASK_USER_ACTION_TYPE: &str = "ask_user";
pub const ELICITATION_ACTION_TYPE: &str = "elicitation";
pub const ELICITATION_RESPONSE_ACTION_TYPE: &str = "elicitation_response";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActionRequiredScope {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

impl ActionRequiredScope {
    pub fn from_parts(
        session_id: Option<String>,
        thread_id: Option<String>,
        turn_id: Option<String>,
    ) -> Option<Self> {
        if session_id.is_none() && thread_id.is_none() && turn_id.is_none() {
            return None;
        }

        Some(Self {
            session_id,
            thread_id,
            turn_id,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ActionRequiredProjection {
    pub id: String,
    pub action_type: String,
    pub data: Value,
    pub scope: Option<ActionRequiredScope>,
}

pub fn tool_confirmation_action(
    id: impl Into<String>,
    tool_name: impl Into<String>,
    arguments: Value,
    prompt: Option<String>,
    scope: Option<ActionRequiredScope>,
) -> ActionRequiredProjection {
    ActionRequiredProjection {
        id: id.into(),
        action_type: TOOL_CONFIRMATION_ACTION_TYPE.to_string(),
        data: serde_json::json!({
            "tool_name": tool_name.into(),
            "arguments": arguments,
            "prompt": prompt,
        }),
        scope,
    }
}

pub fn elicitation_action(
    id: impl Into<String>,
    message: impl Into<String>,
    requested_schema: Value,
    scope: Option<ActionRequiredScope>,
) -> ActionRequiredProjection {
    ActionRequiredProjection {
        id: id.into(),
        action_type: ELICITATION_ACTION_TYPE.to_string(),
        data: serde_json::json!({
            "message": message.into(),
            "requested_schema": requested_schema,
        }),
        scope,
    }
}

pub fn elicitation_response_event_action(
    id: impl Into<String>,
    user_data: Value,
    scope: Option<ActionRequiredScope>,
) -> ActionRequiredProjection {
    ActionRequiredProjection {
        id: id.into(),
        action_type: ELICITATION_RESPONSE_ACTION_TYPE.to_string(),
        data: serde_json::json!({
            "user_data": user_data,
        }),
        scope,
    }
}

pub fn elicitation_response_message_action(
    id: impl Into<String>,
    user_data: Value,
    scope: Option<ActionRequiredScope>,
) -> ActionRequiredProjection {
    ActionRequiredProjection {
        id: id.into(),
        action_type: ELICITATION_RESPONSE_ACTION_TYPE.to_string(),
        data: user_data,
        scope,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_from_parts_should_drop_empty_scope() {
        assert_eq!(ActionRequiredScope::from_parts(None, None, None), None);

        let scope = ActionRequiredScope::from_parts(
            Some("session-1".to_string()),
            None,
            Some("turn-1".to_string()),
        )
        .expect("scope should exist");

        assert_eq!(scope.session_id.as_deref(), Some("session-1"));
        assert_eq!(scope.thread_id, None);
        assert_eq!(scope.turn_id.as_deref(), Some("turn-1"));
    }

    #[test]
    fn tool_confirmation_action_should_preserve_wire_shape() {
        let projection = tool_confirmation_action(
            "req-1",
            "write_file",
            serde_json::json!({ "path": "README.md" }),
            Some("确认写入？".to_string()),
            None,
        );

        assert_eq!(projection.id, "req-1");
        assert_eq!(projection.action_type, TOOL_CONFIRMATION_ACTION_TYPE);
        assert_eq!(
            projection.data["tool_name"],
            serde_json::json!("write_file")
        );
        assert_eq!(
            projection.data["arguments"],
            serde_json::json!({ "path": "README.md" })
        );
        assert_eq!(projection.data["prompt"], serde_json::json!("确认写入？"));
    }

    #[test]
    fn elicitation_response_should_keep_event_and_message_shapes_distinct() {
        let event_projection =
            elicitation_response_event_action("ask-1", serde_json::json!({ "answer": "ok" }), None);
        assert_eq!(
            event_projection.data,
            serde_json::json!({ "user_data": { "answer": "ok" } })
        );

        let message_projection = elicitation_response_message_action(
            "ask-1",
            serde_json::json!({ "answer": "ok" }),
            None,
        );
        assert_eq!(
            message_projection.data,
            serde_json::json!({ "answer": "ok" })
        );
    }
}
