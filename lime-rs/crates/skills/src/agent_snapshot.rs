//! Agent turn 可用技能轻量快照。
//!
//! 这里只保留 metadata 和 `SKILL.md` locator，不把技能正文注入普通回合。

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::skill_loader::get_skill_roots;
use crate::skill_summary::{load_skill_summaries_from_directory, LoadedSkillSummary};

const PROJECT_SKILLS_RELATIVE_DIR: &str = ".agents/skills";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSkillMetadata {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub scope: AgentSkillScope,
    pub source: String,
    pub directory: PathBuf,
    pub skill_file_path: PathBuf,
    pub allowed_tools: Vec<String>,
    pub argument_hint: Option<String>,
    pub when_to_use: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentSkillScope {
    Project,
    User,
    App,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentSkillRoot {
    pub path: PathBuf,
    pub scope: AgentSkillScope,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct AgentSkillSnapshot {
    pub roots: Vec<AgentSkillRoot>,
    pub skills: Vec<AgentSkillMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct AgentSkillSnapshotOptions {
    pub roots: Vec<AgentSkillRoot>,
}

pub fn build_agent_skill_snapshot() -> AgentSkillSnapshot {
    build_agent_skill_snapshot_from_roots(default_agent_skill_roots())
}

pub fn build_agent_skill_snapshot_from_workspace(
    working_dir: Option<&Path>,
    project_root: Option<&Path>,
) -> AgentSkillSnapshot {
    build_agent_skill_snapshot_from_roots(agent_skill_roots_for_workspace(
        working_dir,
        project_root,
    ))
}

pub fn build_agent_skill_snapshot_from_roots(
    roots: impl IntoIterator<Item = AgentSkillRoot>,
) -> AgentSkillSnapshot {
    let roots = roots.into_iter().collect::<Vec<_>>();
    let cache_key = snapshot_cache_key(&roots);
    if let Some(cached) = cached_snapshot(&cache_key) {
        return cached;
    }
    let snapshot = build_agent_skill_snapshot_uncached(roots);
    store_cached_snapshot(cache_key, &snapshot);
    snapshot
}

fn build_agent_skill_snapshot_uncached(
    roots: impl IntoIterator<Item = AgentSkillRoot>,
) -> AgentSkillSnapshot {
    let mut seen = HashSet::<(String, PathBuf)>::new();
    let mut snapshot = AgentSkillSnapshot::default();

    for root in roots {
        if !root.path.exists() {
            continue;
        }
        let root_path = normalize_path(&root.path);
        if snapshot
            .roots
            .iter()
            .any(|existing| normalize_path(&existing.path) == root_path)
        {
            continue;
        }

        snapshot.roots.push(AgentSkillRoot {
            path: root_path.clone(),
            scope: root.scope,
        });

        for skill in load_skill_summaries_from_directory(&root_path) {
            let metadata = metadata_from_skill_summary(skill, root.scope);
            let dedupe_key = (metadata.name.clone(), normalize_path(&metadata.directory));
            if seen.insert(dedupe_key) {
                snapshot.skills.push(metadata);
            }
        }
    }

    snapshot
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SnapshotCacheEntry {
    key: String,
    snapshot: AgentSkillSnapshot,
}

fn snapshot_cache() -> &'static Mutex<Option<SnapshotCacheEntry>> {
    static CACHE: OnceLock<Mutex<Option<SnapshotCacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn cached_snapshot(key: &str) -> Option<AgentSkillSnapshot> {
    let guard = snapshot_cache()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let entry = guard.as_ref()?;
    (entry.key == key).then(|| entry.snapshot.clone())
}

fn store_cached_snapshot(key: String, snapshot: &AgentSkillSnapshot) {
    let mut guard = snapshot_cache()
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    *guard = Some(SnapshotCacheEntry {
        key,
        snapshot: snapshot.clone(),
    });
}

fn snapshot_cache_key(roots: &[AgentSkillRoot]) -> String {
    roots
        .iter()
        .map(|root| {
            let normalized = normalize_path(&root.path);
            format!(
                "{}:{}:{}",
                root.scope.as_label(),
                normalized.display(),
                root_signature(&normalized)
            )
        })
        .collect::<Vec<_>>()
        .join("|")
}

fn root_signature(root: &Path) -> String {
    if !root.exists() {
        return "missing".to_string();
    }
    let mut parts = vec![format!("root={}", path_mtime(root).unwrap_or_default())];
    if let Ok(entries) = std::fs::read_dir(root) {
        let mut child_signatures = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .filter_map(|path| {
                let skill_file = path.join("SKILL.md");
                let name = path.file_name()?.to_string_lossy().to_string();
                Some(format!(
                    "{name}:{}",
                    path_mtime(&skill_file).unwrap_or_default()
                ))
            })
            .collect::<Vec<_>>();
        child_signatures.sort();
        parts.extend(child_signatures);
    }
    parts.join(",")
}

fn path_mtime(path: &Path) -> Option<u128> {
    std::fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis())
}

pub fn agent_skill_roots_for_workspace(
    working_dir: Option<&Path>,
    project_root: Option<&Path>,
) -> Vec<AgentSkillRoot> {
    let mut roots = Vec::new();

    if let Some(project_root) = project_root {
        push_unique_root(
            &mut roots,
            project_root.join(PROJECT_SKILLS_RELATIVE_DIR),
            AgentSkillScope::Project,
        );
    }
    if let Some(working_dir) = working_dir {
        push_unique_root(
            &mut roots,
            working_dir.join(PROJECT_SKILLS_RELATIVE_DIR),
            AgentSkillScope::Project,
        );
    }

    for root in default_agent_skill_roots() {
        push_unique_root(&mut roots, root.path, root.scope);
    }

    roots
}

pub fn default_agent_skill_roots() -> Vec<AgentSkillRoot> {
    get_skill_roots()
        .into_iter()
        .enumerate()
        .map(|(index, path)| AgentSkillRoot {
            path,
            scope: match index {
                0 => AgentSkillScope::Project,
                1 => AgentSkillScope::User,
                2 => AgentSkillScope::App,
                _ => AgentSkillScope::Other,
            },
        })
        .collect()
}

impl AgentSkillScope {
    pub fn as_label(self) -> &'static str {
        match self {
            AgentSkillScope::Project => "project",
            AgentSkillScope::User => "user",
            AgentSkillScope::App => "app",
            AgentSkillScope::Other => "other",
        }
    }
}

fn metadata_from_skill_summary(
    skill: LoadedSkillSummary,
    scope: AgentSkillScope,
) -> AgentSkillMetadata {
    let directory = normalize_path(&skill.local_directory_path);
    AgentSkillMetadata {
        name: skill.skill_name,
        display_name: skill.display_name,
        description: normalize_inline_text(&skill.description),
        scope,
        source: scope.as_label().to_string(),
        skill_file_path: directory.join("SKILL.md"),
        directory,
        allowed_tools: skill.allowed_tools.unwrap_or_default(),
        argument_hint: skill.argument_hint.and_then(normalize_optional_text),
        when_to_use: skill.when_to_use.and_then(normalize_optional_text),
    }
}

fn push_unique_root(roots: &mut Vec<AgentSkillRoot>, path: PathBuf, scope: AgentSkillScope) {
    let normalized = normalize_path(&path);
    if roots
        .iter()
        .any(|root| normalize_path(&root.path) == normalized)
    {
        return;
    }
    roots.push(AgentSkillRoot {
        path: normalized,
        scope,
    });
}

fn normalize_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn normalize_optional_text(value: String) -> Option<String> {
    let normalized = normalize_inline_text(&value);
    (!normalized.is_empty()).then_some(normalized)
}

fn normalize_inline_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn snapshot_loads_metadata_without_body_and_preserves_root_order() {
        let project_root = TempDir::new().expect("project root");
        let user_root = TempDir::new().expect("user root");
        write_skill(
            project_root.path(),
            "research",
            "Research",
            "Search and cite sources.",
            Some("Use for source-backed research."),
        );
        write_skill(
            user_root.path(),
            "summary",
            "Summary",
            "Summarize text.",
            None,
        );

        let snapshot = build_agent_skill_snapshot_from_roots([
            AgentSkillRoot {
                path: project_root.path().to_path_buf(),
                scope: AgentSkillScope::Project,
            },
            AgentSkillRoot {
                path: user_root.path().to_path_buf(),
                scope: AgentSkillScope::User,
            },
        ]);

        assert_eq!(snapshot.roots.len(), 2);
        assert_eq!(snapshot.skills.len(), 2);
        assert_eq!(snapshot.skills[0].name, "research");
        assert_eq!(snapshot.skills[0].display_name, "Research");
        assert_eq!(snapshot.skills[0].scope, AgentSkillScope::Project);
        assert_eq!(
            snapshot.skills[0].when_to_use.as_deref(),
            Some("Use for source-backed research.")
        );
        assert!(snapshot.skills[0]
            .skill_file_path
            .ends_with("research/SKILL.md"));
    }

    #[test]
    fn snapshot_deduplicates_same_root_and_directory() {
        let root = TempDir::new().expect("root");
        write_skill(root.path(), "analysis", "Analysis", "Analyze inputs.", None);

        let snapshot = build_agent_skill_snapshot_from_roots([
            AgentSkillRoot {
                path: root.path().to_path_buf(),
                scope: AgentSkillScope::Project,
            },
            AgentSkillRoot {
                path: root.path().to_path_buf(),
                scope: AgentSkillScope::User,
            },
        ]);

        assert_eq!(snapshot.roots.len(), 1);
        assert_eq!(snapshot.skills.len(), 1);
        assert_eq!(snapshot.skills[0].scope, AgentSkillScope::Project);
    }

    #[test]
    fn workspace_roots_prefer_project_before_defaults() {
        let workspace = TempDir::new().expect("workspace");
        let working = workspace.path().join("nested");
        std::fs::create_dir_all(&working).expect("working dir");

        let roots = agent_skill_roots_for_workspace(Some(&working), Some(workspace.path()));

        assert!(roots[0].path.ends_with(".agents/skills"));
        assert_eq!(roots[0].scope, AgentSkillScope::Project);
        assert!(roots
            .iter()
            .any(|root| root.path == working.join(".agents/skills")));
    }

    #[test]
    fn snapshot_cache_invalidates_when_root_contents_change() {
        let root = TempDir::new().expect("root");
        write_skill(root.path(), "writer", "Writer", "Write clearly.", None);
        let roots = [AgentSkillRoot {
            path: root.path().to_path_buf(),
            scope: AgentSkillScope::Project,
        }];

        let first = build_agent_skill_snapshot_from_roots(roots.clone());
        write_skill(root.path(), "summary", "Summary", "Summarize text.", None);
        let second = build_agent_skill_snapshot_from_roots(roots);

        assert_eq!(first.skills.len(), 1);
        assert_eq!(second.skills.len(), 2);
        assert!(second.skills.iter().any(|skill| skill.name == "summary"));
    }

    fn write_skill(
        root: &Path,
        name: &str,
        display_name: &str,
        description: &str,
        when_to_use: Option<&str>,
    ) {
        let skill_dir = root.join(name);
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        let when_to_use = when_to_use
            .map(|value| format!("when-to-use: {value}\n"))
            .unwrap_or_default();
        std::fs::write(
            skill_dir.join("SKILL.md"),
            format!(
                "---\nname: {display_name}\ndescription: {description}\n{when_to_use}---\n\n# {display_name}\n\nFull body should not be rendered by snapshot."
            ),
        )
        .expect("skill file");
    }
}
