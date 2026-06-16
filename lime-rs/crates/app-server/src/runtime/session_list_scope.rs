use app_server_protocol::AgentSessionCwdFilter;
use app_server_protocol::AgentSessionListParams;
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionListScope {
    cwd_filters: Vec<String>,
    workspace_id_filters: Vec<String>,
}

impl SessionListScope {
    pub fn from_params(params: &AgentSessionListParams) -> Self {
        Self {
            cwd_filters: normalize_cwd_filter(params.cwd.as_ref()),
            workspace_id_filters: normalize_id_filter(params.workspace_id.as_deref()),
        }
    }

    pub fn cwd_filters(&self) -> &[String] {
        &self.cwd_filters
    }

    pub fn workspace_id_filters(&self) -> &[String] {
        &self.workspace_id_filters
    }

    pub fn matches_cwd(&self, cwd: Option<&str>) -> bool {
        if self.cwd_filters.is_empty() {
            return true;
        }
        let Some(cwd) = normalize_cwd(cwd) else {
            return false;
        };
        self.cwd_filters.iter().any(|candidate| candidate == &cwd)
    }

    pub fn matches_workspace(&self, workspace_id: Option<&str>) -> bool {
        if self.workspace_id_filters.is_empty() {
            return true;
        }
        let Some(workspace_id) = normalize_id(workspace_id) else {
            return false;
        };
        self.workspace_id_filters
            .iter()
            .any(|candidate| candidate == &workspace_id)
    }

    pub fn matches_session(&self, workspace_id: Option<&str>, cwd: Option<&str>) -> bool {
        self.matches_workspace(workspace_id) && self.matches_cwd(cwd)
    }
}

fn normalize_cwd_filter(filter: Option<&AgentSessionCwdFilter>) -> Vec<String> {
    match filter {
        Some(AgentSessionCwdFilter::One(value)) => normalize_cwd_values([value.as_str()]),
        Some(AgentSessionCwdFilter::Many(values)) => normalize_cwd_values(values),
        None => Vec::new(),
    }
}

pub fn normalize_cwd_values(values: impl IntoIterator<Item = impl AsRef<str>>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    values
        .into_iter()
        .filter_map(|value| normalize_cwd(Some(value.as_ref())))
        .filter(|value| seen.insert(value.clone()))
        .collect()
}

fn normalize_id_filter(value: Option<&str>) -> Vec<String> {
    normalize_id(value).into_iter().collect()
}

fn normalize_id(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.to_string())
}

pub fn normalize_cwd(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    let trimmed = value.trim_end_matches(['/', '\\']);
    Some(if trimmed.is_empty() {
        value.to_string()
    } else {
        trimmed.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scope_normalizes_and_dedupes_cwd_filters() {
        let scope = SessionListScope::from_params(&AgentSessionListParams {
            cwd: Some(AgentSessionCwdFilter::Many(vec![
                " /repo/lime/ ".to_string(),
                "/repo/lime".to_string(),
                "".to_string(),
                "/repo/app".to_string(),
            ])),
            ..AgentSessionListParams::default()
        });

        assert_eq!(scope.cwd_filters(), ["/repo/lime", "/repo/app"]);
        assert!(scope.matches_cwd(Some("/repo/lime/")));
        assert!(scope.matches_cwd(Some("/repo/app")));
        assert!(!scope.matches_cwd(Some("/repo/other")));
        assert!(!scope.matches_cwd(None));
    }

    #[test]
    fn empty_scope_matches_all() {
        let scope = SessionListScope::from_params(&AgentSessionListParams::default());

        assert!(scope.matches_cwd(None));
        assert!(scope.matches_cwd(Some("/repo/lime")));
        assert!(scope.matches_workspace(None));
        assert!(scope.matches_workspace(Some("workspace-main")));
    }

    #[test]
    fn scope_matches_workspace_id_when_cwd_is_not_available() {
        let scope = SessionListScope::from_params(&AgentSessionListParams {
            workspace_id: Some(" workspace-main ".to_string()),
            ..AgentSessionListParams::default()
        });

        assert!(scope.matches_session(Some("workspace-main"), None));
        assert!(!scope.matches_session(Some("workspace-other"), None));
        assert!(!scope.matches_session(None, None));
    }
}
