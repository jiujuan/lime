use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserProfileScopeKind {
    Persistent,
    Task,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProfileOwner {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProfileScope {
    pub profile_key: String,
    pub scope_kind: BrowserProfileScopeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<BrowserProfileOwner>,
    pub cleanup_on_owner_end: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrowserProfileCleanupPlan {
    pub owner: BrowserProfileOwner,
    pub profile_keys: Vec<String>,
}

impl BrowserProfileOwner {
    pub fn new(session_id: impl Into<String>, turn_id: Option<impl Into<String>>) -> Self {
        Self {
            session_id: session_id.into(),
            turn_id: turn_id.map(Into::into),
        }
    }
}

impl BrowserProfileScope {
    pub fn persistent(profile_key: impl Into<String>) -> Self {
        Self {
            profile_key: profile_key.into(),
            scope_kind: BrowserProfileScopeKind::Persistent,
            owner: None,
            cleanup_on_owner_end: false,
        }
    }

    pub fn task_scoped(profile_key: impl Into<String>, owner: BrowserProfileOwner) -> Self {
        Self {
            profile_key: profile_key.into(),
            scope_kind: BrowserProfileScopeKind::Task,
            owner: Some(owner),
            cleanup_on_owner_end: true,
        }
    }

    pub fn is_owned_by(&self, owner: &BrowserProfileOwner) -> bool {
        self.owner.as_ref() == Some(owner)
    }
}

impl BrowserProfileCleanupPlan {
    pub fn is_empty(&self) -> bool {
        self.profile_keys.is_empty()
    }
}

pub fn cleanup_plan_for_owner<'a>(
    owner: BrowserProfileOwner,
    scopes: impl IntoIterator<Item = &'a BrowserProfileScope>,
) -> BrowserProfileCleanupPlan {
    let profile_keys = scopes
        .into_iter()
        .filter(|scope| {
            scope.scope_kind == BrowserProfileScopeKind::Task
                && scope.cleanup_on_owner_end
                && scope.is_owned_by(&owner)
        })
        .map(|scope| scope.profile_key.trim())
        .filter(|profile_key| !profile_key.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .map(ToOwned::to_owned)
        .collect();

    BrowserProfileCleanupPlan {
        owner,
        profile_keys,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persistent_profile_is_not_cleaned_by_owner() {
        let owner = BrowserProfileOwner::new("session-1", Some("turn-1"));
        let scopes = vec![BrowserProfileScope::persistent("default")];

        let plan = cleanup_plan_for_owner(owner, &scopes);

        assert!(plan.is_empty());
    }

    #[test]
    fn task_scoped_profiles_are_cleaned_by_matching_owner() {
        let owner = BrowserProfileOwner::new("session-1", Some("turn-1"));
        let other_owner = BrowserProfileOwner::new("session-1", Some("turn-2"));
        let scopes = vec![
            BrowserProfileScope::task_scoped("task-profile-1", owner.clone()),
            BrowserProfileScope::task_scoped("task-profile-1", owner.clone()),
            BrowserProfileScope::task_scoped("task-profile-2", other_owner),
            BrowserProfileScope::persistent("default"),
        ];

        let plan = cleanup_plan_for_owner(owner.clone(), &scopes);

        assert_eq!(plan.owner, owner);
        assert_eq!(plan.profile_keys, vec!["task-profile-1".to_string()]);
    }
}
