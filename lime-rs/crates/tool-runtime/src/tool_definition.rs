use serde::{Deserialize, Serialize};

/// Controls where a bound runtime tool is exposed to the model.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeToolExposure {
    #[default]
    Direct,
    Deferred,
    DirectModelOnly,
    Hidden,
}

impl RuntimeToolExposure {
    pub fn is_direct(self) -> bool {
        matches!(self, Self::Direct | Self::DirectModelOnly)
    }
}

/// Runtime tool definition projected for inventory and policy surfaces.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

impl RuntimeToolDefinition {
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        input_schema: serde_json::Value,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_schema,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_tool_exposure_distinguishes_direct_model_surfaces() {
        assert!(RuntimeToolExposure::Direct.is_direct());
        assert!(RuntimeToolExposure::DirectModelOnly.is_direct());
        assert!(!RuntimeToolExposure::Deferred.is_direct());
        assert!(!RuntimeToolExposure::Hidden.is_direct());
    }
}
