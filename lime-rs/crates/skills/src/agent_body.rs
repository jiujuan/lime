//! Agent Skill 正文读取。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::agent_snapshot::{AgentSkillMetadata, AgentSkillScope};

const MAX_REFERENCE_FILES: usize = 3;
const MAX_REFERENCE_FILE_BYTES: u64 = 16 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSkillBodyLocator {
    pub name: String,
    pub scope: AgentSkillScope,
    pub directory: PathBuf,
    pub skill_file_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSkillBody {
    pub locator: AgentSkillBodyLocator,
    pub markdown_content: String,
    pub references: Vec<AgentSkillReferenceBody>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSkillReferenceBody {
    pub relative_path: String,
    pub content: String,
}

pub fn agent_skill_body_locator_from_metadata(
    metadata: &AgentSkillMetadata,
) -> AgentSkillBodyLocator {
    AgentSkillBodyLocator {
        name: metadata.name.clone(),
        scope: metadata.scope,
        directory: metadata.directory.clone(),
        skill_file_path: metadata.skill_file_path.clone(),
    }
}

pub fn read_agent_skill_body(locator: &AgentSkillBodyLocator) -> Result<AgentSkillBody, String> {
    ensure_skill_file_path(&locator.skill_file_path)?;
    let markdown_content = std::fs::read_to_string(&locator.skill_file_path).map_err(|error| {
        format!(
            "读取 Agent Skill 文件失败: path={}, error={error}",
            locator.skill_file_path.display()
        )
    })?;

    Ok(AgentSkillBody {
        locator: locator.clone(),
        references: read_referenced_files(locator, &markdown_content)?,
        markdown_content,
    })
}

fn read_referenced_files(
    locator: &AgentSkillBodyLocator,
    markdown_content: &str,
) -> Result<Vec<AgentSkillReferenceBody>, String> {
    let Some(skill_dir) = locator.skill_file_path.parent() else {
        return Ok(Vec::new());
    };
    let canonical_skill_dir = skill_dir.canonicalize().map_err(|error| {
        format!(
            "解析 Agent Skill 目录失败: path={}, error={error}",
            skill_dir.display()
        )
    })?;

    let mut references = Vec::new();
    for relative_path in referenced_relative_paths(markdown_content) {
        if references.len() >= MAX_REFERENCE_FILES {
            break;
        }
        let path = skill_dir.join(&relative_path);
        let canonical_path = match path.canonicalize() {
            Ok(path) => path,
            Err(_) => continue,
        };
        if !canonical_path.starts_with(&canonical_skill_dir) || !canonical_path.is_file() {
            continue;
        }
        let metadata = std::fs::metadata(&canonical_path).map_err(|error| {
            format!(
                "读取 Agent Skill reference metadata 失败: path={}, error={error}",
                canonical_path.display()
            )
        })?;
        if metadata.len() > MAX_REFERENCE_FILE_BYTES {
            continue;
        }
        let content = std::fs::read_to_string(&canonical_path).map_err(|error| {
            format!(
                "读取 Agent Skill reference 失败: path={}, error={error}",
                canonical_path.display()
            )
        })?;
        references.push(AgentSkillReferenceBody {
            relative_path,
            content,
        });
    }
    Ok(references)
}

fn referenced_relative_paths(markdown_content: &str) -> Vec<String> {
    let mut paths = Vec::new();
    for token in markdown_content
        .split(|ch: char| {
            ch.is_whitespace() || matches!(ch, '"' | '\'' | '`' | '(' | ')' | '[' | ']')
        })
        .map(|token| {
            token.trim_matches(|ch: char| matches!(ch, ',' | '.' | ';' | ':' | '，' | '。'))
        })
    {
        let Some(index) = token.find("references/") else {
            continue;
        };
        let candidate = &token[index..];
        if candidate.contains("..") || candidate.starts_with('/') || candidate.starts_with('\\') {
            continue;
        }
        if candidate
            .chars()
            .any(|ch| ch.is_control() || matches!(ch, '<' | '>' | '|'))
        {
            continue;
        }
        if !paths.iter().any(|existing| existing == candidate) {
            paths.push(candidate.to_string());
        }
    }
    paths
}

fn ensure_skill_file_path(path: &Path) -> Result<(), String> {
    if path.file_name().and_then(|name| name.to_str()) != Some("SKILL.md") {
        return Err(format!(
            "Agent Skill locator 必须指向 SKILL.md: {}",
            path.display()
        ));
    }
    if !path.is_file() {
        return Err(format!("Agent Skill 文件不存在: {}", path.display()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_agent_skill_body_reads_full_skill_markdown() {
        let root = TempDir::new().expect("root");
        let skill_dir = root.path().join("writer");
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Writer\n---\n\n# Writer\n\nFull body",
        )
        .expect("skill");

        let body = read_agent_skill_body(&AgentSkillBodyLocator {
            name: "writer".to_string(),
            scope: AgentSkillScope::Project,
            directory: skill_dir.clone(),
            skill_file_path: skill_dir.join("SKILL.md"),
        })
        .expect("body");

        assert!(body.markdown_content.contains("# Writer"));
        assert!(body.markdown_content.contains("Full body"));
        assert!(body.references.is_empty());
    }

    #[test]
    fn read_agent_skill_body_loads_explicit_reference_files() {
        let root = TempDir::new().expect("root");
        let skill_dir = root.path().join("writer");
        std::fs::create_dir_all(skill_dir.join("references")).expect("references dir");
        std::fs::write(
            skill_dir.join("references/style.md"),
            "# Style\n\nUse concise paragraphs.",
        )
        .expect("reference");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Writer\n---\n\nRead references/style.md before writing.",
        )
        .expect("skill");

        let body = read_agent_skill_body(&AgentSkillBodyLocator {
            name: "writer".to_string(),
            scope: AgentSkillScope::Project,
            directory: skill_dir.clone(),
            skill_file_path: skill_dir.join("SKILL.md"),
        })
        .expect("body");

        assert_eq!(body.references.len(), 1);
        assert_eq!(body.references[0].relative_path, "references/style.md");
        assert!(body.references[0]
            .content
            .contains("Use concise paragraphs."));
    }

    #[test]
    fn read_agent_skill_body_rejects_non_skill_file() {
        let root = TempDir::new().expect("root");
        let file = root.path().join("README.md");
        std::fs::write(&file, "not a skill").expect("file");

        let error = read_agent_skill_body(&AgentSkillBodyLocator {
            name: "writer".to_string(),
            scope: AgentSkillScope::Project,
            directory: root.path().to_path_buf(),
            skill_file_path: file,
        })
        .expect_err("should reject non SKILL.md");

        assert!(error.contains("SKILL.md"));
    }
}
