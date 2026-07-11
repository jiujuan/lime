use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

use crate::session::extension_data::ExtensionData;
use crate::session::{extension_data::ExtensionState, Session, SessionStore, SessionType};

pub const SUBAGENT_SESSION_ORIGIN_TOOL: &str = "Agent";

/// Subagent session metadata stored in session extension data.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct SubagentSessionMetadata {
    pub parent_session_id: String,
    pub origin_tool: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role_hint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_from_turn_id: Option<String>,
}

impl ExtensionState for SubagentSessionMetadata {
    const EXTENSION_NAME: &'static str = "subagent_session";
    const VERSION: &'static str = "v0";
}

impl SubagentSessionMetadata {
    pub fn new(parent_session_id: impl Into<String>) -> Self {
        Self {
            parent_session_id: parent_session_id.into(),
            origin_tool: SUBAGENT_SESSION_ORIGIN_TOOL.to_string(),
            task_summary: None,
            role_hint: None,
            created_from_turn_id: None,
        }
    }

    pub fn with_task_summary(mut self, task_summary: Option<String>) -> Self {
        self.task_summary = task_summary;
        self
    }

    pub fn with_role_hint(mut self, role_hint: Option<String>) -> Self {
        self.role_hint = role_hint;
        self
    }

    pub fn with_created_from_turn_id(mut self, created_from_turn_id: Option<String>) -> Self {
        self.created_from_turn_id = created_from_turn_id;
        self
    }

    pub fn from_extension_data(extension_data: &ExtensionData) -> Option<Self> {
        <Self as ExtensionState>::from_extension_data(extension_data)
    }

    pub fn from_session(session: &Session) -> Option<Self> {
        Self::from_extension_data(&session.extension_data)
    }

    pub fn to_extension_data(&self, extension_data: &mut ExtensionData) -> Result<()> {
        <Self as ExtensionState>::to_extension_data(self, extension_data)
    }

    pub fn into_updated_extension_data(self, session: &Session) -> Result<ExtensionData> {
        let mut extension_data = session.extension_data.clone();
        self.to_extension_data(&mut extension_data)?;
        Ok(extension_data)
    }
}

pub fn resolve_subagent_session_metadata(
    extension_data: &ExtensionData,
) -> Option<SubagentSessionMetadata> {
    SubagentSessionMetadata::from_extension_data(extension_data)
}

async fn list_subagent_child_sessions(
    session_store: &dyn SessionStore,
    parent_session_id: &str,
) -> Result<Vec<Session>> {
    let sessions = session_store
        .list_sessions_by_types(&[SessionType::SubAgent])
        .await?;
    Ok(filter_subagent_child_sessions(
        sessions,
        Some(parent_session_id),
    ))
}

pub async fn resolve_named_subagent_child_session(
    session_store: &dyn SessionStore,
    parent_session_id: &str,
    name: &str,
) -> Result<Option<Session>> {
    let sessions = list_subagent_child_sessions(session_store, parent_session_id).await?;
    Ok(resolve_named_subagent_child_session_from_sessions(
        sessions, name,
    ))
}

fn filter_subagent_child_sessions(
    sessions: Vec<Session>,
    parent_session_id: Option<&str>,
) -> Vec<Session> {
    let mut filtered = sessions
        .into_iter()
        .filter(|session| {
            let Some(metadata) = SubagentSessionMetadata::from_session(session) else {
                return false;
            };

            match parent_session_id {
                Some(parent_id) => metadata.parent_session_id == parent_id,
                None => true,
            }
        })
        .collect::<Vec<_>>();

    filtered.sort_by(|left, right| compare_session_recency(right, left));
    filtered
}

fn resolve_named_subagent_child_session_from_sessions(
    sessions: Vec<Session>,
    name: &str,
) -> Option<Session> {
    let target = normalize_subagent_name(Some(name))?;

    sessions
        .into_iter()
        .filter(|session| {
            SubagentSessionMetadata::from_session(session)
                .and_then(|metadata| normalize_subagent_name(metadata.role_hint.as_deref()))
                .as_deref()
                == Some(target.as_str())
        })
        .max_by(compare_session_recency)
}

fn normalize_subagent_name(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn compare_session_recency(left: &Session, right: &Session) -> Ordering {
    left.updated_at
        .cmp(&right.updated_at)
        .then_with(|| left.created_at.cmp(&right.created_at))
        .then_with(|| left.id.cmp(&right.id))
}
