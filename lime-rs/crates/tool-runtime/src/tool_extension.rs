use serde::{Deserialize, Serialize};

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
}
