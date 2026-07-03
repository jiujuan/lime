pub mod anthropic;
pub mod model_context;
pub mod openai;
pub mod session_context;
pub mod turn_context;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;

macro_rules! id_type {
    ($name:ident) => {
        #[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self::new(value)
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self::new(value)
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                self.as_str()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str(self.as_str())
            }
        }
    };
}

id_type!(SessionId);
id_type!(ThreadId);
id_type!(TurnId);
id_type!(RuntimeEventId);
id_type!(ToolCallId);
id_type!(ActionId);
id_type!(ArtifactId);
id_type!(ModelId);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeEventKind {
    SessionStarted,
    TurnStarted,
    ModelDelta,
    ToolCallStarted,
    ToolCallCompleted,
    ActionRequested,
    TurnCompleted,
    TurnFailed,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RuntimeEvent {
    pub id: RuntimeEventId,
    pub session_id: SessionId,
    pub thread_id: ThreadId,
    pub turn_id: Option<TurnId>,
    pub sequence: u64,
    pub kind: RuntimeEventKind,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentTurnInput {
    pub session_id: SessionId,
    pub thread_id: ThreadId,
    pub turn_id: TurnId,
    pub text: String,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RuntimeSnapshot {
    pub session_id: SessionId,
    pub thread_id: ThreadId,
    pub latest_turn_id: Option<TurnId>,
    #[serde(default)]
    pub events: Vec<RuntimeEvent>,
    #[serde(default)]
    pub metadata: Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_serialize_as_plain_strings() {
        let id = SessionId::new("session-1");
        let encoded = serde_json::to_string(&id).expect("session id should serialize");

        assert_eq!(encoded, "\"session-1\"");
        assert_eq!(id.as_str(), "session-1");
    }
}
