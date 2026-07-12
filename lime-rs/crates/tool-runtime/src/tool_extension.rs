use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeExtensionConfig {
    pub name: String,
    pub description: String,
    pub available_tools: Vec<String>,
    pub deferred_loading: bool,
    pub always_expose_tools: Vec<String>,
    pub allowed_caller: Option<String>,
}

impl RuntimeExtensionConfig {
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        available_tools: Vec<String>,
        deferred_loading: bool,
        always_expose_tools: Vec<String>,
        allowed_caller: Option<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
        }
    }

    pub fn is_tool_exposed_by_default(&self, tool_name: &str) -> bool {
        !self.deferred_loading
            || self
                .always_expose_tools
                .iter()
                .any(|tool| tool == tool_name)
    }

    pub fn is_tool_available(&self, tool_name: &str) -> bool {
        self.available_tools.is_empty() || self.available_tools.iter().any(|tool| tool == tool_name)
    }

    pub fn deferred_loading(&self) -> bool {
        self.deferred_loading
    }

    pub fn allowed_caller(&self) -> Option<&str> {
        self.allowed_caller.as_deref()
    }

    pub fn is_caller_allowed(&self, caller: &str) -> bool {
        self.allowed_caller()
            .is_none_or(|required| required == caller)
    }

    pub fn has_tools(&self) -> bool {
        !self.available_tools.is_empty()
    }

    pub fn from_tool_surfaces(
        name: impl Into<String>,
        description: impl Into<String>,
        tools: &[RuntimeExtensionToolSurface],
    ) -> Self {
        let mut available_tools = tools
            .iter()
            .map(|tool| tool.name.clone())
            .collect::<Vec<_>>();
        available_tools.sort();
        available_tools.dedup();

        let mut always_expose_tools = tools
            .iter()
            .filter(|tool| {
                tool.always_visible.unwrap_or(false) || !tool.deferred_loading.unwrap_or(false)
            })
            .map(|tool| tool.name.clone())
            .collect::<Vec<_>>();
        always_expose_tools.sort();
        always_expose_tools.dedup();

        let deferred_loading = tools
            .iter()
            .any(|tool| tool.deferred_loading.unwrap_or(false));
        let allowed_caller = collapse_extension_allowed_caller(tools);

        Self {
            name: name.into(),
            description: description.into(),
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeExtensionToolSurface {
    pub name: String,
    pub deferred_loading: Option<bool>,
    pub always_visible: Option<bool>,
    pub allowed_callers: Option<Vec<String>>,
}

impl RuntimeExtensionToolSurface {
    pub fn new(
        name: impl Into<String>,
        deferred_loading: Option<bool>,
        always_visible: Option<bool>,
        allowed_callers: Option<Vec<String>>,
    ) -> Self {
        Self {
            name: name.into(),
            deferred_loading,
            always_visible,
            allowed_callers,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeExtensionRegistration {
    pub display_name: Option<String>,
    pub config: RuntimeExtensionConfig,
}

impl RuntimeExtensionRegistration {
    pub fn new(config: RuntimeExtensionConfig, display_name: Option<String>) -> Self {
        Self {
            display_name,
            config,
        }
    }

    pub fn name(&self) -> &str {
        &self.config.name
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeExtensionSyncPlan {
    pub registrations: Vec<RuntimeExtensionRegistration>,
    pub stale_names: Vec<String>,
}

impl RuntimeExtensionSyncPlan {
    pub fn from_registrations(
        previous_names: impl IntoIterator<Item = String>,
        registrations: impl IntoIterator<Item = RuntimeExtensionRegistration>,
    ) -> Self {
        let mut registration_by_name = BTreeMap::new();
        for registration in registrations {
            if !registration.config.has_tools() {
                continue;
            }
            registration_by_name.insert(registration.config.name.clone(), registration);
        }

        let active_names = registration_by_name
            .keys()
            .cloned()
            .collect::<BTreeSet<_>>();
        let stale_names = previous_names
            .into_iter()
            .filter(|name| !active_names.contains(name))
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();

        Self {
            registrations: registration_by_name.into_values().collect(),
            stale_names,
        }
    }

    pub fn active_names(&self) -> HashSet<String> {
        self.registrations
            .iter()
            .map(|registration| registration.config.name.clone())
            .collect()
    }
}

fn collapse_extension_allowed_caller(tools: &[RuntimeExtensionToolSurface]) -> Option<String> {
    let mut collapsed: Option<String> = None;

    for tool in tools {
        let allowed = tool.allowed_callers.as_ref()?;
        if allowed.len() != 1 {
            return None;
        }
        let caller = allowed[0].trim();
        if caller.is_empty() {
            return None;
        }
        match collapsed.as_deref() {
            Some(existing) if existing != caller => return None,
            Some(_) => {}
            None => collapsed = Some(caller.to_string()),
        }
    }

    collapsed
}

#[cfg(test)]
mod tests {
    use super::{
        RuntimeExtensionConfig, RuntimeExtensionRegistration, RuntimeExtensionSyncPlan,
        RuntimeExtensionToolSurface,
    };

    fn surface(
        name: &str,
        deferred_loading: Option<bool>,
        always_visible: Option<bool>,
        allowed_callers: Option<Vec<&str>>,
    ) -> RuntimeExtensionToolSurface {
        RuntimeExtensionToolSurface::new(
            name,
            deferred_loading,
            always_visible,
            allowed_callers.map(|items| items.into_iter().map(str::to_string).collect()),
        )
    }

    #[test]
    fn runtime_extension_config_collapses_single_allowed_caller() {
        let config = RuntimeExtensionConfig::from_tool_surfaces(
            "mcp__docs",
            "docs tools",
            &[
                surface(
                    "search_docs",
                    Some(true),
                    Some(false),
                    Some(vec!["assistant"]),
                ),
                surface(
                    "read_docs",
                    Some(false),
                    Some(true),
                    Some(vec!["assistant"]),
                ),
            ],
        );

        assert!(config.deferred_loading);
        assert_eq!(config.allowed_caller.as_deref(), Some("assistant"));
        assert_eq!(config.always_expose_tools, vec!["read_docs".to_string()]);
    }

    #[test]
    fn runtime_extension_config_dedups_tools_and_drops_mixed_callers() {
        let config = RuntimeExtensionConfig::from_tool_surfaces(
            "mcp__docs",
            "docs tools",
            &[
                surface(
                    "search_docs",
                    Some(true),
                    Some(true),
                    Some(vec!["assistant"]),
                ),
                surface(
                    "search_docs",
                    Some(true),
                    Some(true),
                    Some(vec!["code_execution"]),
                ),
                surface(
                    "read_docs",
                    Some(false),
                    Some(false),
                    Some(vec!["assistant"]),
                ),
            ],
        );

        assert_eq!(config.allowed_caller, None);
        assert_eq!(
            config.available_tools,
            vec!["read_docs".to_string(), "search_docs".to_string()]
        );
        assert_eq!(
            config.always_expose_tools,
            vec!["read_docs".to_string(), "search_docs".to_string()]
        );
    }

    #[test]
    fn runtime_extension_sync_plan_filters_empty_and_reports_stale_names() {
        let active = RuntimeExtensionRegistration::new(
            RuntimeExtensionConfig::new(
                "mcp__docs",
                "docs tools",
                vec!["mcp__docs__search".to_string()],
                false,
                vec!["mcp__docs__search".to_string()],
                Some("assistant".to_string()),
            ),
            Some("docs".to_string()),
        );
        let empty = RuntimeExtensionRegistration::new(
            RuntimeExtensionConfig::new("mcp__empty", "empty", Vec::new(), false, Vec::new(), None),
            Some("empty".to_string()),
        );

        let plan = RuntimeExtensionSyncPlan::from_registrations(
            vec!["mcp__old".to_string(), "mcp__docs".to_string()],
            vec![empty, active],
        );

        assert_eq!(plan.registrations.len(), 1);
        assert_eq!(plan.registrations[0].name(), "mcp__docs");
        assert_eq!(plan.stale_names, vec!["mcp__old".to_string()]);
        assert!(plan.active_names().contains("mcp__docs"));
        assert!(!plan.active_names().contains("mcp__empty"));
    }

    #[test]
    fn runtime_extension_sync_plan_dedups_by_runtime_name() {
        let first = RuntimeExtensionRegistration::new(
            RuntimeExtensionConfig::new(
                "mcp__docs",
                "old docs tools",
                vec!["mcp__docs__search".to_string()],
                false,
                Vec::new(),
                None,
            ),
            Some("docs-old".to_string()),
        );
        let last = RuntimeExtensionRegistration::new(
            RuntimeExtensionConfig::new(
                "mcp__docs",
                "new docs tools",
                vec!["mcp__docs__read".to_string()],
                false,
                Vec::new(),
                None,
            ),
            Some("docs".to_string()),
        );

        let plan = RuntimeExtensionSyncPlan::from_registrations(Vec::new(), vec![first, last]);

        assert_eq!(plan.registrations.len(), 1);
        assert_eq!(plan.registrations[0].display_name.as_deref(), Some("docs"));
        assert_eq!(
            plan.registrations[0].config.available_tools,
            vec!["mcp__docs__read".to_string()]
        );
    }
}
