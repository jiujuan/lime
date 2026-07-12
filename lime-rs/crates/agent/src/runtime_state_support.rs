//! Agent runtime 状态支持模块
//!
//! 提供可复用的会话配置构建与 Lime Skills 注册。

#[cfg(test)]
use agent_runtime::session_config::SessionConfigBuilder;
use lime_core::app_paths;
use lime_skills::{
    is_registered_skill, load_skills_from_directory, register_project_skill_directory,
    register_skill_directory,
};
use std::path::{Path, PathBuf};

/// 重新加载 Lime Skills
pub fn reload_skills() {
    load_skills();
}

pub fn register_project_skill_from_directory(
    directory: &str,
    skill_dir: &Path,
) -> Result<String, String> {
    register_project_skill_directory(directory, skill_dir)
}

pub fn is_skill_registered(skill_name: &str) -> bool {
    is_registered_skill(skill_name)
}

/// 加载 Lime Skills 到 `lime-skills` current registry。
fn load_skills() {
    let roots = match resolve_skill_root_sources() {
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
        .flat_map(|(skills_dir, source)| register_skills_from_dir(skills_dir, *source))
        .count();

    if skill_count == 0 {
        tracing::info!("[AgentRuntime] Lime Skills 根目录为空，无 Skills 可加载");
    } else {
        tracing::info!(
            "[AgentRuntime] 成功加载 {} 个 Skills 到 current registry",
            skill_count
        );
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SkillRootSource {
    User,
    Project,
}

fn resolve_skill_root_sources() -> Result<Vec<(PathBuf, SkillRootSource)>, String> {
    let project_roots = app_paths::resolve_lime_project_skill_roots();
    app_paths::resolve_lime_skill_roots()
        .map(|roots| assign_skill_root_sources(roots, &project_roots))
}

fn assign_skill_root_sources(
    roots: Vec<PathBuf>,
    project_roots: &[PathBuf],
) -> Vec<(PathBuf, SkillRootSource)> {
    roots
        .into_iter()
        .map(|root| {
            let source = if project_roots
                .iter()
                .any(|project_root| project_root == &root)
            {
                SkillRootSource::Project
            } else {
                SkillRootSource::User
            };
            (root, source)
        })
        .collect()
}

fn register_skills_from_dir(skills_dir: &Path, source: SkillRootSource) -> Vec<String> {
    let skills = load_skills_from_directory(skills_dir);
    let skill_count = skills.len();

    if skill_count == 0 {
        return Vec::new();
    }

    let mut registered_names = Vec::with_capacity(skill_count);
    for skill in skills {
        let skill_name = skill.skill_name.clone();
        match register_skill_directory(&skill_name, &skill.local_directory_path) {
            Ok(registered) => {
                tracing::debug!("[AgentRuntime] 已注册 Skill: {}", registered);
                registered_names.push(registered);
            }
            Err(error) => {
                tracing::warn!(
                    skill = %skill_name,
                    "[AgentRuntime] Skill 注册失败: {}",
                    error
                );
            }
        }

        if source == SkillRootSource::Project {
            match register_project_skill_directory(&skill_name, &skill.local_directory_path) {
                Ok(registered) => {
                    tracing::debug!("[AgentRuntime] 已注册 project Skill: {}", registered);
                    registered_names.push(registered);
                }
                Err(error) => {
                    tracing::warn!(
                        skill = %skill_name,
                        "[AgentRuntime] project Skill 注册失败: {}",
                        error
                    );
                }
            }
        }
    }
    registered_names
}

#[cfg(test)]
mod tests {
    use super::{
        assign_skill_root_sources, is_skill_registered, register_project_skill_from_directory,
        SkillRootSource,
    };
    use lime_skills::parse_allowed_tools;
    use std::path::Path;
    use tempfile::TempDir;

    #[test]
    fn assign_skill_root_sources_should_mark_project_root() {
        let project_root = Path::new("/tmp/project/.agents/skills").to_path_buf();
        let user_root = Path::new("/tmp/home/.agents/skills").to_path_buf();
        let app_root = Path::new("/tmp/app/skills").to_path_buf();

        let roots = assign_skill_root_sources(
            vec![project_root.clone(), user_root.clone(), app_root.clone()],
            std::slice::from_ref(&project_root),
        );

        assert_eq!(
            roots,
            vec![
                (project_root, SkillRootSource::Project),
                (user_root, SkillRootSource::User),
                (app_root, SkillRootSource::User),
            ]
        );
    }

    #[test]
    fn assign_skill_root_sources_should_mark_cross_provider_project_roots() {
        let project_agents_root = Path::new("/tmp/project/.agents/skills").to_path_buf();
        let project_claude_root = Path::new("/tmp/project/.claude/skills").to_path_buf();
        let user_claude_root = Path::new("/tmp/home/.claude/skills").to_path_buf();

        let roots = assign_skill_root_sources(
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
                (project_agents_root, SkillRootSource::Project),
                (project_claude_root, SkillRootSource::Project),
                (user_claude_root, SkillRootSource::User),
            ]
        );
    }

    #[test]
    fn register_project_skill_from_directory_registers_project_namespace() {
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
            register_project_skill_from_directory("runtime-enable-fixture", &skill_dir)
                .expect("register skill");

        assert_eq!(skill_name, "project:runtime-enable-fixture");
        assert!(is_skill_registered("project:runtime-enable-fixture"));
    }

    #[test]
    fn agent_allowed_tools_parser_should_accept_agent_skills_standard_spacing() {
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
