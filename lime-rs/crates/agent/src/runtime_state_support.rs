//! Agent runtime 状态支持模块
//!
//! 提供可复用的会话配置构建、项目上下文 Prompt 构建、
//! Lime Skills 加载与 Agent 身份配置。

#[cfg(test)]
use agent_runtime::session_config::SessionConfigBuilder;
use aster::agents::AgentIdentity;
use aster::skills::{
    global_registry, load_skill_from_file, load_skills_from_directory, SkillSource,
};
use aster::tools::ToolRegistrationConfig;
use lime_core::app_paths;
use std::path::{Path, PathBuf};

/// 重新加载 Lime Skills
pub fn reload_lime_skills() {
    load_lime_skills();
}

pub fn register_lime_project_skill_from_directory(
    directory: &str,
    skill_dir: &Path,
) -> Result<String, String> {
    let directory = directory.trim();
    if directory.is_empty() {
        return Err("workspace skill directory is required".to_string());
    }

    let skill_file = skill_dir.join("SKILL.md");
    let skill_name = format!("project:{directory}");
    let skill = load_skill_from_file(&skill_name, &skill_file, SkillSource::Project)?;
    let registry = global_registry();
    let mut registry_guard = registry.write().map_err(|error| error.to_string())?;
    registry_guard.register(skill);
    Ok(skill_name)
}

pub fn is_lime_skill_registered(skill_name: &str) -> bool {
    let skill_name = skill_name.trim();
    if skill_name.is_empty() {
        return false;
    }
    let registry = global_registry();
    registry
        .read()
        .map(|registry_guard| registry_guard.find(skill_name).is_some())
        .unwrap_or(false)
}

/// 创建 Lime 专属的 Agent 身份配置
pub(crate) fn create_lime_identity() -> AgentIdentity {
    AgentIdentity::new("Lime AI")
        .with_language("Chinese")
        .with_description("Lime 桌面端中的 AI 运行时，负责按会话上下文完成用户请求。")
        .with_custom_prompt(LIME_IDENTITY_PROMPT.to_string())
}

/// 创建 Lime 的工具注册配置
///
/// 启用 Ask/LSP 回调，确保 ask/lsp 工具在 Agent 初始化时可用。
pub(crate) fn create_lime_tool_config() -> ToolRegistrationConfig {
    ToolRegistrationConfig::new()
        .with_ask_callback(crate::ask_bridge::create_ask_callback())
        .with_lsp_callback(crate::lsp_bridge::create_lsp_callback())
}

/// 加载 Lime Skills 到 aster-rust 的 global_registry
fn load_lime_skills() {
    let roots = match resolve_lime_skill_root_sources() {
        Ok(roots) => roots,
        Err(error) => {
            tracing::warn!(
                "[AgentRuntime] 解析 Lime Skills 根目录失败，跳过加载: {}",
                error
            );
            return;
        }
    };

    let skill_count = roots
        .iter()
        .flat_map(|(skills_dir, source)| register_lime_skills_from_dir(skills_dir, *source))
        .count();

    if skill_count == 0 {
        tracing::info!("[AgentRuntime] Lime Skills 根目录为空，无 Skills 可加载");
    } else {
        tracing::info!(
            "[AgentRuntime] 成功加载 {} 个 Lime Skills 到 global_registry",
            skill_count
        );
    }
}

fn resolve_lime_skill_root_sources() -> Result<Vec<(PathBuf, SkillSource)>, String> {
    let project_roots = app_paths::resolve_lime_project_skill_roots();
    app_paths::resolve_lime_skill_roots()
        .map(|roots| assign_lime_skill_root_sources(roots, &project_roots))
}

fn assign_lime_skill_root_sources(
    roots: Vec<PathBuf>,
    project_roots: &[PathBuf],
) -> Vec<(PathBuf, SkillSource)> {
    roots
        .into_iter()
        .map(|root| {
            let source = if project_roots
                .iter()
                .any(|project_root| project_root == &root)
            {
                SkillSource::Project
            } else {
                SkillSource::User
            };
            (root, source)
        })
        .collect()
}

fn register_lime_skills_from_dir(skills_dir: &Path, source: SkillSource) -> Vec<String> {
    let skills = load_skills_from_directory(skills_dir, source);
    let skill_count = skills.len();

    if skill_count == 0 {
        return Vec::new();
    }

    let mut registered_names = Vec::with_capacity(skill_count);
    let registry = global_registry();
    if let Ok(mut registry_guard) = registry.write() {
        for skill in skills {
            let skill_name = skill.skill_name.clone();
            registry_guard.register(skill);
            tracing::debug!("[AgentRuntime] 已注册 Skill: {}", skill_name);
            registered_names.push(skill_name);
        }
    } else {
        tracing::error!("[AgentRuntime] 无法获取 global_registry 写锁，Skills 加载失败");
    }
    registered_names
}

#[cfg(test)]
mod tests {
    use super::{
        assign_lime_skill_root_sources, is_lime_skill_registered,
        register_lime_project_skill_from_directory,
    };
    use aster::skills::{parse_allowed_tools, SkillSource};
    use std::path::Path;
    use tempfile::TempDir;

    #[test]
    fn assign_lime_skill_root_sources_should_mark_project_root() {
        let project_root = Path::new("/tmp/project/.agents/skills").to_path_buf();
        let user_root = Path::new("/tmp/home/.agents/skills").to_path_buf();
        let app_root = Path::new("/tmp/app/skills").to_path_buf();

        let roots = assign_lime_skill_root_sources(
            vec![project_root.clone(), user_root.clone(), app_root.clone()],
            std::slice::from_ref(&project_root),
        );

        assert_eq!(
            roots,
            vec![
                (project_root, SkillSource::Project),
                (user_root, SkillSource::User),
                (app_root, SkillSource::User),
            ]
        );
    }

    #[test]
    fn assign_lime_skill_root_sources_should_mark_cross_provider_project_roots() {
        let project_agents_root = Path::new("/tmp/project/.agents/skills").to_path_buf();
        let project_claude_root = Path::new("/tmp/project/.claude/skills").to_path_buf();
        let user_claude_root = Path::new("/tmp/home/.claude/skills").to_path_buf();

        let roots = assign_lime_skill_root_sources(
            vec![
                project_agents_root.clone(),
                project_claude_root.clone(),
                user_claude_root.clone(),
            ],
            &[project_agents_root.clone(), project_claude_root.clone()],
        );

        assert_eq!(
            roots,
            vec![
                (project_agents_root, SkillSource::Project),
                (project_claude_root, SkillSource::Project),
                (user_claude_root, SkillSource::User),
            ]
        );
    }

    #[test]
    fn register_lime_project_skill_from_directory_registers_project_namespace() {
        let workspace = TempDir::new().expect("workspace");
        let skill_dir = workspace
            .path()
            .join(".agents")
            .join("skills")
            .join("runtime-enable-fixture");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Runtime Enable Fixture\ndescription: Test skill.\n---\n\n# Fixture\n",
        )
        .expect("skill file");

        let skill_name =
            register_lime_project_skill_from_directory("runtime-enable-fixture", &skill_dir)
                .expect("register skill");

        assert_eq!(skill_name, "project:runtime-enable-fixture");
        assert!(is_lime_skill_registered("project:runtime-enable-fixture"));
    }

    #[test]
    fn aster_allowed_tools_parser_should_accept_agent_skills_standard_spacing() {
        assert_eq!(
            parse_allowed_tools(Some("Bash(git:*) Bash(jq:*) Read")),
            Some(vec![
                "Bash(git:*)".to_string(),
                "Bash(jq:*)".to_string(),
                "Read".to_string(),
            ])
        );
    }

    #[test]
    fn session_config_builder_should_preserve_schedule_id() {
        let config = super::SessionConfigBuilder::new("session-1")
            .thread_id("thread-1")
            .turn_id("turn-1")
            .schedule_id("schedule-1")
            .build();

        assert_eq!(config.id, "session-1");
        assert_eq!(config.thread_id.as_deref(), Some("thread-1"));
        assert_eq!(config.turn_id.as_deref(), Some("turn-1"));
        assert_eq!(config.schedule_id.as_deref(), Some("schedule-1"));
    }
}

/// Lime 专属的 Agent 身份提示词。
///
/// 这里只保留稳定产品身份和硬边界；用户可感知的交互口吻由 App Server
/// `memory.soul` 会话上下文控制，避免默认身份覆盖用户选择的 Soul 风格。
const LIME_IDENTITY_PROMPT: &str = r#"你是 Lime 桌面端中的 AI 助手。

## 关于 Lime

Lime 帮助用户通过桌面端对话、项目资料、工具调用和工作区完成任务。

## 语言规范

1. **始终使用中文回复**：除非用户明确要求使用其他语言
2. **代码注释使用中文**：生成代码时，注释应使用中文
3. **技术术语保持原文**：API、JSON、HTTP、Token 等专业术语保持英文

## 交互口吻

- 交互口吻、问候、自我介绍、工具进展和失败恢复由当前会话的 `memory.soul` 上下文控制
- 不要使用本默认身份覆盖 `memory.soul` 选择的风格
- 如果当前会话没有 `memory.soul` 上下文，保持清晰、准确、可执行

## Team 协作原则

- 只有在任务存在多个相互独立的子问题、并行评审/验证、或用户明确要求多代理时，才进入 team 模式
- 简单问题不要创建子代理；先判断当前阻塞步骤是否真的适合委派
- 先区分关键路径与 sidecar 任务：如果下一步立即依赖结果，优先主线程自己做；只有不会阻塞下一步的独立子任务才适合并发委派
- 多个子代理并发时，必须明确分工，避免让不同子代理修改同一片文件或重复劳动
- 子代理默认不应继续创建新的子代理，避免团队深度失控
- 需要显式建立或清理 team 上下文时，优先使用 TeamCreate / TeamDelete；进入 team 后再通过 Agent / SendMessage / ListPeers 维持协作主路径
- 优先复用已有子代理上下文，通过 SendMessage 继续推进强相关任务，而不是反复创建新子代理
- 只有当主线程确实被结果阻塞时，才围绕已有 team workspace 状态等待结果，不要反复机械轮询
- 已删除的 `SubAgentTask` 工具名不应重新挂回 team runtime 主路径
"#;
