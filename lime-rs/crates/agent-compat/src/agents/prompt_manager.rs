//! 提示词管理器
//!
//! 管理 Agent 的系统提示词，支持分层组合：
//! 1. Identity（身份层）- 应用层可完全控制
//! 2. Capabilities（能力层）- 框架提供的 Extensions 等能力描述
//! 3. Context（上下文层）- 运行时注入的 hints 和额外指令

use chrono::Utc;
use serde::Serialize;

use super::identity::AgentIdentity;
use crate::agents::extension::ExtensionInfo;
use crate::{
    config::{AsterMode, Config},
    conversation::unicode_tags::sanitize_tags,
    session_context::current_turn_context,
};
use std::path::Path;

const MAX_EXTENSIONS: usize = 5;
const MAX_TOOLS: usize = 50;
const PLAN_COLLABORATION_INSTRUCTION: &str = r#"You are now in Plan mode for this turn. Plan mode is a collaboration mode, not the update_plan checklist tool. Stay in Plan mode until the current turn ends; user wording such as "continue", "implement", or "do it" means plan that execution, not perform it.

Mode rules:
- Do not implement code changes, write files, apply patches, run migrations, run codegen, or perform other mutating actions.
- You may do non-mutating exploration that improves the plan, such as reading files, searching the repo, inspecting schemas/configs, or running checks that do not change repo-tracked files.
- Resolve discoverable repo facts through non-mutating exploration before asking the user.
- Use request_user_input for material product or implementation decisions that cannot be discovered from the repo.
- Do not use update_plan in Plan mode; update_plan is only a checklist/progress tool for non-plan collaboration modes.

When the plan is decision-complete, output exactly one <proposed_plan> block so the client can render it as a plan item. The opening and closing tags must each be on their own line, and the plan content must start on the line after <proposed_plan>. Use Markdown inside the block. Do not ask "should I proceed?" after the block.

Required shape:
<proposed_plan>
plan content
</proposed_plan>"#;

fn current_turn_is_plan_mode() -> bool {
    current_turn_context()
        .as_ref()
        .and_then(|context| context.collaboration_mode.as_deref())
        .is_some_and(|mode| matches!(mode.trim(), "plan" | "planning"))
}

fn append_plan_collaboration_instruction(mut prompt: String) -> String {
    if current_turn_is_plan_mode() {
        prompt.push_str("\n\n# Plan Mode Instructions:\n\n");
        prompt.push_str(PLAN_COLLABORATION_INSTRUCTION);
    }
    prompt
}

pub struct PromptManager {
    /// 完全覆盖系统提示词（向后兼容）
    system_prompt_override: Option<String>,
    /// 额外指令（追加到末尾）
    system_prompt_extras: Vec<String>,
    /// 当前时间戳
    current_date_timestamp: String,
    /// Agent 身份配置（新增）
    identity: AgentIdentity,
    /// Session 级别的系统提示词
    session_prompt: Option<String>,
}

impl Default for PromptManager {
    fn default() -> Self {
        PromptManager::new()
    }
}

/// 能力提示词上下文
#[derive(Serialize)]
struct SystemPromptContext {
    extensions: Vec<ExtensionInfo>,
    current_date_time: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    extension_tool_limits: Option<(usize, usize)>,
    aster_mode: AsterMode,
    is_autonomous: bool,
    enable_subagents: bool,
    max_extensions: usize,
    max_tools: usize,
    code_execution_mode: bool,
}

fn render_identity_prompt(identity: &AgentIdentity) -> String {
    if let Some(custom) = &identity.custom_prompt {
        return sanitize_tags(custom);
    }

    let mut lines = vec![format!(
        "You are a general-purpose AI agent called {}.",
        identity.name
    )];

    if let Some(description) = identity.description.as_deref() {
        lines.push(format!("Description: {}", description));
    }
    if let Some(creator) = identity.creator.as_deref() {
        lines.push(format!("Creator: {}", creator));
    }
    if let Some(language) = identity.language.as_deref() {
        lines.push(format!("Language preference: {}", language));
    }

    lines.join("\n")
}

fn render_capabilities_prompt(context: &SystemPromptContext) -> String {
    let mut sections = Vec::new();

    if !context.extensions.is_empty() {
        let mut extensions = String::from("# Extensions");
        for extension in &context.extensions {
            extensions.push_str("\n\n## ");
            extensions.push_str(&extension.name);
            if extension.has_resources {
                extensions.push_str("\nResources may be available.");
            }
            if !extension.instructions.trim().is_empty() {
                extensions.push_str("\n");
                extensions.push_str(extension.instructions.trim());
            }
        }
        sections.push(extensions);
    }

    if let Some((extension_count, tool_count)) = context.extension_tool_limits {
        sections.push(format!(
            "# Extension Limits\n\n{} extensions and {} tools are visible; keep tool use focused.",
            extension_count, tool_count
        ));
    }

    if context.enable_subagents {
        sections.push("# Subagents\n\nSubagents are available for delegated work.".to_string());
    }

    if context.code_execution_mode {
        sections.push("# Code Execution\n\nCode execution mode is enabled.".to_string());
    }

    sections.join("\n\n")
}

pub struct SystemPromptBuilder<'a, M> {
    manager: &'a M,

    extensions_info: Vec<ExtensionInfo>,
    frontend_instructions: Option<String>,
    additional_instructions: Vec<String>,
    extension_tool_count: Option<(usize, usize)>,
    subagents_enabled: bool,
    hints: Option<String>,
    code_execution_mode: bool,
    session_prompt: Option<String>,
    session_prompt_override: bool,
    include_capabilities_layer: bool,
}

impl<'a> SystemPromptBuilder<'a, PromptManager> {
    pub fn with_extension(mut self, extension: ExtensionInfo) -> Self {
        self.extensions_info.push(extension);
        self
    }

    pub fn with_extensions(mut self, extensions: impl Iterator<Item = ExtensionInfo>) -> Self {
        for extension in extensions {
            self.extensions_info.push(extension);
        }
        self
    }

    pub fn with_frontend_instructions(mut self, frontend_instructions: Option<String>) -> Self {
        self.frontend_instructions = frontend_instructions;
        self
    }

    pub fn with_additional_instruction(mut self, instruction: Option<String>) -> Self {
        if let Some(instruction) = instruction {
            self.additional_instructions.push(instruction);
        }
        self
    }

    pub fn with_extension_and_tool_counts(
        mut self,
        extension_count: usize,
        tool_count: usize,
    ) -> Self {
        self.extension_tool_count = Some((extension_count, tool_count));
        self
    }

    pub fn with_code_execution_mode(mut self, enabled: bool) -> Self {
        self.code_execution_mode = enabled;
        self
    }

    pub fn with_hints(self, _working_dir: &Path) -> Self {
        self
    }

    pub fn with_enable_subagents(mut self, subagents_enabled: bool) -> Self {
        self.subagents_enabled = subagents_enabled;
        self
    }

    /// 设置 session 级别的系统提示词
    pub fn with_session_prompt(mut self, prompt: Option<String>) -> Self {
        self.session_prompt = prompt;
        self
    }

    /// 将 session prompt 作为本回合完整系统提示词使用。
    pub fn with_session_prompt_override(mut self, enabled: bool) -> Self {
        self.session_prompt_override = enabled;
        self
    }

    pub fn with_capabilities_layer(mut self, enabled: bool) -> Self {
        self.include_capabilities_layer = enabled;
        self
    }

    pub fn build(self) -> String {
        let mut extensions_info = self.extensions_info;

        // Add frontend instructions to extensions_info to simplify json rendering
        if let Some(frontend_instructions) = self.frontend_instructions {
            extensions_info.push(ExtensionInfo::new(
                "frontend",
                &frontend_instructions,
                false,
            ));
        }
        // Stable tool ordering is important for multi session prompt caching.
        extensions_info.sort_by(|a, b| a.name.cmp(&b.name));

        let sanitized_extensions_info: Vec<ExtensionInfo> = extensions_info
            .into_iter()
            .map(|mut ext_info| {
                ext_info.instructions = sanitize_tags(&ext_info.instructions);
                ext_info
            })
            .collect();

        let config = Config::global();
        let aster_mode = config.get_aster_mode().unwrap_or(AsterMode::Auto);

        let extension_tool_limits = self
            .extension_tool_count
            .filter(|(extensions, tools)| *extensions > MAX_EXTENSIONS || *tools > MAX_TOOLS);

        let capabilities_context = SystemPromptContext {
            extensions: sanitized_extensions_info,
            current_date_time: self.manager.current_date_timestamp.clone(),
            extension_tool_limits,
            aster_mode,
            is_autonomous: aster_mode == AsterMode::Auto,
            enable_subagents: self.subagents_enabled,
            max_extensions: MAX_EXTENSIONS,
            max_tools: MAX_TOOLS,
            code_execution_mode: self.code_execution_mode,
        };

        if self.session_prompt_override {
            let override_prompt = self.session_prompt.as_deref().unwrap_or("");
            let prompt = sanitize_tags(override_prompt);
            return append_plan_collaboration_instruction(prompt);
        }

        // 构建提示词：全局 override 优先，否则使用分层结构。
        let base_prompt = if let Some(override_prompt) = &self.manager.system_prompt_override {
            // 向后兼容：完全覆盖模式
            sanitize_tags(override_prompt)
        } else {
            // 新的分层模式：Identity + Session Context + Capabilities
            Self::build_layered_prompt_with_session(
                &self.manager.identity,
                &self.session_prompt,
                &capabilities_context,
                self.include_capabilities_layer,
            )
        };

        let mut system_prompt_extras = self.manager.system_prompt_extras.clone();
        system_prompt_extras.extend(self.additional_instructions);

        // Add hints if provided
        if let Some(hints) = self.hints {
            system_prompt_extras.push(hints);
        }

        if aster_mode == AsterMode::Chat {
            system_prompt_extras.push(
                "Right now you are in the chat only mode, no access to any tool use and system."
                    .to_string(),
            );
        }

        if current_turn_is_plan_mode() {
            system_prompt_extras.push(PLAN_COLLABORATION_INSTRUCTION.to_string());
        }

        let sanitized_system_prompt_extras: Vec<String> = system_prompt_extras
            .into_iter()
            .map(|extra| sanitize_tags(&extra))
            .collect();

        if sanitized_system_prompt_extras.is_empty() {
            base_prompt
        } else {
            format!(
                "{}\n\n# Additional Instructions:\n\n{}",
                base_prompt,
                sanitized_system_prompt_extras.join("\n\n")
            )
        }
    }

    /// 构建分层提示词：Identity + Capabilities（静态方法）
    fn build_layered_prompt_static(
        identity: &AgentIdentity,
        capabilities_context: &SystemPromptContext,
    ) -> String {
        // 1. 构建身份层
        let identity_prompt = if let Some(custom) = &identity.custom_prompt {
            // 使用完全自定义的身份提示词
            sanitize_tags(custom)
        } else {
            render_identity_prompt(identity)
        };

        // 2. 构建能力层
        let capabilities_prompt = render_capabilities_prompt(capabilities_context);

        // 3. 组合
        if capabilities_prompt.is_empty() {
            identity_prompt
        } else {
            format!("{}\n\n{}", identity_prompt, capabilities_prompt)
        }
    }

    /// 构建分层提示词（包含 session_prompt）：Identity + Session Context + Capabilities
    fn build_layered_prompt_with_session(
        identity: &AgentIdentity,
        session_prompt: &Option<String>,
        capabilities_context: &SystemPromptContext,
        include_capabilities_layer: bool,
    ) -> String {
        // 1. 构建身份层
        let identity_prompt = if let Some(custom) = &identity.custom_prompt {
            sanitize_tags(custom)
        } else {
            render_identity_prompt(identity)
        };

        // 2. Session Context 层（如果有）
        let session_section = if let Some(prompt) = session_prompt {
            let sanitized = sanitize_tags(prompt);
            format!("\n\n## Session Context\n\n{}", sanitized)
        } else {
            String::new()
        };

        // 3. 构建能力层
        let capabilities_prompt = if include_capabilities_layer {
            render_capabilities_prompt(capabilities_context)
        } else {
            String::new()
        };

        // 4. 组合：Identity + Session Context + Capabilities
        if capabilities_prompt.is_empty() {
            format!("{}{}", identity_prompt, session_section)
        } else {
            format!(
                "{}{}\n\n{}",
                identity_prompt, session_section, capabilities_prompt
            )
        }
    }
}

impl PromptManager {
    pub fn new() -> Self {
        PromptManager {
            system_prompt_override: None,
            system_prompt_extras: Vec::new(),
            current_date_timestamp: Utc::now().format("%Y-%m-%d %H:00").to_string(),
            identity: AgentIdentity::default(),
            session_prompt: None,
        }
    }

    /// 创建带自定义身份的 PromptManager
    pub fn with_identity(identity: AgentIdentity) -> Self {
        PromptManager {
            system_prompt_override: None,
            system_prompt_extras: Vec::new(),
            current_date_timestamp: Utc::now().format("%Y-%m-%d %H:00").to_string(),
            identity,
            session_prompt: None,
        }
    }

    /// 设置 Agent 身份
    pub fn set_identity(&mut self, identity: AgentIdentity) {
        self.identity = identity;
    }

    /// 获取当前身份配置
    pub fn identity(&self) -> &AgentIdentity {
        &self.identity
    }

    /// 设置 session 级别的系统提示词
    pub fn set_session_prompt(&mut self, prompt: Option<String>) {
        self.session_prompt = prompt;
    }

    /// 获取当前 session 提示词
    pub fn session_prompt(&self) -> Option<&String> {
        self.session_prompt.as_ref()
    }

    /// 清除 session 提示词
    pub fn clear_session_prompt(&mut self) {
        self.session_prompt = None;
    }

    /// Add an additional instruction to the system prompt
    pub fn add_system_prompt_extra(&mut self, instruction: String) {
        self.system_prompt_extras.push(instruction);
    }

    /// Override the system prompt with custom text (向后兼容)
    pub fn set_system_prompt_override(&mut self, template: String) {
        self.system_prompt_override = Some(template);
    }

    pub fn builder<'a>(&'a self) -> SystemPromptBuilder<'a, Self> {
        SystemPromptBuilder {
            manager: self,

            extensions_info: vec![],
            frontend_instructions: None,
            additional_instructions: vec![],
            extension_tool_count: None,
            subagents_enabled: false,
            hints: None,
            code_execution_mode: false,
            session_prompt: None,
            session_prompt_override: false,
            include_capabilities_layer: true,
        }
    }

    pub async fn get_recipe_prompt(&self) -> String {
        "Recipe execution is only available when the current runtime explicitly configures recipe components.".to_string()
    }
}
