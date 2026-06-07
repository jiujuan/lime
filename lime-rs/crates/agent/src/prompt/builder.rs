//! System Prompt 构建器
//!
//! 组装完整的模块化系统提示词

use super::instruction_discovery::{discover_instructions, merge_instructions};
use super::templates::*;
use chrono::Utc;
use std::path::{Path, PathBuf};

/// System Prompt 构建选项
#[derive(Debug, Clone, Default)]
pub struct SystemPromptOptions {
    /// 是否包含核心身份
    pub include_identity: bool,
    /// 是否包含工具指南
    pub include_tool_guidelines: bool,
    /// 是否包含代码指南
    pub include_coding_guidelines: bool,
    /// 是否包含任务管理指南
    pub include_task_management: bool,
    /// 是否包含 Git 指南
    pub include_git_guidelines: bool,
    /// 是否包含输出风格指南
    pub include_output_style: bool,
    /// 工作目录
    pub working_dir: Option<String>,
    /// 自定义指令
    pub custom_instructions: Option<String>,
}

impl SystemPromptOptions {
    /// 创建默认选项（包含所有指南）
    pub fn default_all() -> Self {
        Self {
            include_identity: true,
            include_tool_guidelines: true,
            include_coding_guidelines: true,
            include_task_management: true,
            include_git_guidelines: true,
            include_output_style: true,
            working_dir: None,
            custom_instructions: None,
        }
    }
}

/// System Prompt 构建器
pub struct SystemPromptBuilder {
    options: SystemPromptOptions,
    /// 启用指令发现的工作目录
    instruction_discovery_dir: Option<PathBuf>,
    /// Skill 描述（注入到 system prompt）
    skill_prompt: Option<String>,
}

impl Default for SystemPromptBuilder {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemPromptBuilder {
    /// 创建新的构建器
    pub fn new() -> Self {
        Self {
            options: SystemPromptOptions::default_all(),
            instruction_discovery_dir: None,
            skill_prompt: None,
        }
    }

    /// 使用自定义选项创建构建器
    pub fn with_options(options: SystemPromptOptions) -> Self {
        Self {
            options,
            instruction_discovery_dir: None,
            skill_prompt: None,
        }
    }

    /// 设置工作目录
    pub fn working_dir(mut self, dir: impl AsRef<Path>) -> Self {
        self.options.working_dir = Some(dir.as_ref().to_string_lossy().to_string());
        self
    }

    /// 添加自定义指令
    pub fn custom_instructions(mut self, instructions: impl Into<String>) -> Self {
        self.options.custom_instructions = Some(instructions.into());
        self
    }

    /// 启用层级化指令发现（从 AGENT.md 文件加载）
    pub fn with_instruction_discovery(mut self, working_dir: impl AsRef<Path>) -> Self {
        self.instruction_discovery_dir = Some(working_dir.as_ref().to_path_buf());
        self
    }

    /// 设置 Skills 描述文本（注入到 system prompt）
    pub fn with_skill_prompt(mut self, skill_prompt: String) -> Self {
        if !skill_prompt.is_empty() {
            self.skill_prompt = Some(skill_prompt);
        }
        self
    }

    /// 构建完整的 System Prompt
    pub fn build(&self) -> String {
        let mut parts: Vec<&str> = Vec::new();

        // 1. 核心身份
        if self.options.include_identity {
            parts.push(CORE_IDENTITY);
        }

        // 2. 工具使用指南
        if self.options.include_tool_guidelines {
            parts.push(TOOL_GUIDELINES);
        }

        // 3. 代码编写指南
        if self.options.include_coding_guidelines {
            parts.push(CODING_GUIDELINES);
        }

        // 4. 任务管理指南
        if self.options.include_task_management {
            parts.push(TASK_MANAGEMENT);
        }

        // 5. Git 操作指南
        if self.options.include_git_guidelines {
            parts.push(GIT_GUIDELINES);
        }

        // 6. 输出风格指南
        if self.options.include_output_style {
            parts.push(OUTPUT_STYLE);
        }

        let mut prompt = parts.join("\n\n");

        // 添加环境信息
        let env_info = self.build_environment_info();
        if !env_info.is_empty() {
            prompt.push_str("\n\n");
            prompt.push_str(&env_info);
        }

        // 添加层级化指令（优先级低于 custom_instructions）
        if let Some(ref dir) = self.instruction_discovery_dir {
            let layers = discover_instructions(dir);
            let merged = merge_instructions(&layers);
            if !merged.is_empty() {
                prompt.push_str("\n\n# 项目指令\n\n");
                prompt.push_str(&merged);
            }
        }

        // Skill 描述
        if let Some(ref skill_prompt) = self.skill_prompt {
            prompt.push_str("\n\n");
            prompt.push_str(skill_prompt);
        }

        // 添加自定义指令（最高优先级）
        if let Some(ref custom) = self.options.custom_instructions {
            prompt.push_str("\n\n# 附加指令\n\n");
            prompt.push_str(custom);
        }

        prompt
    }

    /// 构建环境信息部分
    fn build_environment_info(&self) -> String {
        let mut info = String::from("# 环境信息\n\n");

        // 当前日期时间
        let now = Utc::now();
        info.push_str(&format!("- 当前日期: {}\n", now.format("%Y-%m-%d")));

        // 操作系统
        info.push_str(&format!("- 操作系统: {}\n", std::env::consts::OS));

        // 工作目录
        if let Some(ref dir) = self.options.working_dir {
            info.push_str(&format!("- 工作目录: {}\n", dir));
        }

        info
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_build_default_prompt() {
        let prompt = SystemPromptBuilder::new().build();
        assert!(prompt.contains("Lime Agent"));
        assert!(prompt.contains("工具使用策略"));
        assert!(prompt.contains("代码编写指南"));
    }

    #[test]
    fn test_build_with_custom_instructions() {
        let prompt = SystemPromptBuilder::new()
            .custom_instructions("这是自定义指令")
            .build();
        assert!(prompt.contains("这是自定义指令"));
    }

    #[test]
    fn test_build_with_working_dir() {
        let prompt = SystemPromptBuilder::new().working_dir("/tmp/test").build();
        assert!(prompt.contains("/tmp/test"));
    }

    #[test]
    fn test_build_with_instruction_discovery() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(
            tmp.path().join("AGENT.md"),
            "# 测试项目指令\n使用 Rust 编写",
        )
        .unwrap();

        let prompt = SystemPromptBuilder::new()
            .with_instruction_discovery(tmp.path())
            .build();
        assert!(prompt.contains("测试项目指令"));
        assert!(prompt.contains("使用 Rust 编写"));
    }

    #[test]
    fn test_instruction_discovery_before_custom() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(tmp.path().join("AGENT.md"), "DISCOVERED").unwrap();

        let prompt = SystemPromptBuilder::new()
            .with_instruction_discovery(tmp.path())
            .custom_instructions("CUSTOM")
            .build();

        let disc_pos = prompt.find("DISCOVERED").unwrap();
        let custom_pos = prompt.find("CUSTOM").unwrap();
        assert!(disc_pos < custom_pos, "发现的指令应在自定义指令之前");
    }

    #[test]
    fn test_no_instruction_discovery_by_default() {
        let prompt = SystemPromptBuilder::new().build();
        assert!(!prompt.contains("项目指令"));
    }
}
