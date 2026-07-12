use serde::{Deserialize, Serialize};

/// Agent 身份提示配置的 current DTO。
///
/// Agent 运行时删除前，lime-agent 只能在初始化 adapter 边界把它转换为
/// legacy 身份类型；业务侧不要直接依赖 Agent 身份类型。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentIdentity {
    pub name: String,
    pub creator: Option<String>,
    pub description: Option<String>,
    pub language: Option<String>,
    pub custom_prompt: Option<String>,
}

impl AgentIdentity {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            creator: None,
            description: None,
            language: None,
            custom_prompt: None,
        }
    }

    pub fn with_creator(mut self, creator: impl Into<String>) -> Self {
        self.creator = Some(creator.into());
        self
    }

    pub fn with_description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    pub fn with_language(mut self, language: impl Into<String>) -> Self {
        self.language = Some(language.into());
        self
    }

    pub fn with_custom_prompt(mut self, custom_prompt: impl Into<String>) -> Self {
        self.custom_prompt = Some(custom_prompt.into());
        self
    }
}

impl Default for AgentIdentity {
    fn default() -> Self {
        Self::new("Lime AI")
    }
}

#[cfg(test)]
mod tests {
    use super::AgentIdentity;

    #[test]
    fn agent_identity_builder_preserves_prompt_fields() {
        let identity = AgentIdentity::new("Lime AI")
            .with_creator("Lime")
            .with_language("Chinese")
            .with_description("runtime")
            .with_custom_prompt("prompt");

        assert_eq!(identity.name, "Lime AI");
        assert_eq!(identity.creator.as_deref(), Some("Lime"));
        assert_eq!(identity.language.as_deref(), Some("Chinese"));
        assert_eq!(identity.description.as_deref(), Some("runtime"));
        assert_eq!(identity.custom_prompt.as_deref(), Some("prompt"));
    }
}
