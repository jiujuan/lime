use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGitStatus {
    pub root_path: String,
    pub repository_root: Option<String>,
    pub has_git_repository: bool,
    pub current_branch: Option<String>,
    pub branches: Vec<String>,
    pub uncommitted_file_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGitWorktree {
    pub worktree_path: String,
    pub branch: String,
    pub status: ProjectGitStatus,
}

pub fn read_status(root_path: &str) -> Result<ProjectGitStatus, String> {
    let root = required_root_path(root_path)?;
    let repository_root = match git_output(&root, &["rev-parse", "--show-toplevel"]) {
        Ok(output) => output,
        Err(_) => {
            return Ok(ProjectGitStatus {
                root_path: root_path.to_string(),
                repository_root: None,
                has_git_repository: false,
                current_branch: None,
                branches: Vec::new(),
                uncommitted_file_count: 0,
            });
        }
    };

    let repository_root = repository_root.trim().to_string();
    let repository_path = PathBuf::from(&repository_root);
    let current_branch = read_current_branch(&root)?;
    let branches = read_branches(&repository_path)?;
    let uncommitted_file_count = read_uncommitted_file_count(&root)?;

    Ok(ProjectGitStatus {
        root_path: root_path.to_string(),
        repository_root: Some(repository_root),
        has_git_repository: true,
        current_branch,
        branches,
        uncommitted_file_count,
    })
}

pub fn checkout_branch(root_path: &str, branch: &str) -> Result<ProjectGitStatus, String> {
    let root = required_root_path(root_path)?;
    validate_branch_name(branch)?;
    git_output(&root, &["switch", branch])?;
    read_status(root_path)
}

pub fn create_branch(root_path: &str, branch: &str) -> Result<ProjectGitStatus, String> {
    let root = required_root_path(root_path)?;
    validate_branch_name(branch)?;
    git_output(&root, &["switch", "-c", branch])?;
    read_status(root_path)
}

pub fn create_worktree(
    root_path: &str,
    name: Option<&str>,
    base_branch: Option<&str>,
) -> Result<ProjectGitWorktree, String> {
    let status = read_status(root_path)?;
    if !status.has_git_repository {
        return Err("当前项目不是 Git 仓库".to_string());
    }

    let repository_root = status
        .repository_root
        .as_deref()
        .ok_or_else(|| "无法读取 Git 仓库根目录".to_string())?;
    let repository_path = PathBuf::from(repository_root);
    let parent = repository_path
        .parent()
        .ok_or_else(|| "无法解析 Git 仓库父目录".to_string())?;
    let repository_name = repository_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project");
    let slug = resolve_worktree_slug(name);
    let branch = base_branch
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .or(status.current_branch.as_deref())
        .unwrap_or("HEAD")
        .to_string();
    if branch != "HEAD" {
        validate_branch_name(&branch)?;
    }
    let worktree_path = parent.join(format!("{repository_name}-{slug}"));

    if worktree_path.exists() {
        return Err(format!(
            "工作树目录已存在: {}",
            worktree_path.to_string_lossy()
        ));
    }

    git_worktree_add(&repository_path, &branch, &worktree_path)?;
    let worktree_path_string = worktree_path.to_string_lossy().to_string();
    let status = read_status(&worktree_path_string)?;
    Ok(ProjectGitWorktree {
        worktree_path: worktree_path_string,
        branch,
        status,
    })
}

fn required_root_path(root_path: &str) -> Result<PathBuf, String> {
    let trimmed = root_path.trim();
    if trimmed.is_empty() {
        return Err("项目路径不能为空".to_string());
    }
    Ok(PathBuf::from(trimmed))
}

fn read_current_branch(root: &Path) -> Result<Option<String>, String> {
    let branch = git_output(root, &["branch", "--show-current"])?;
    let branch = branch.trim();
    if !branch.is_empty() {
        return Ok(Some(branch.to_string()));
    }

    let commit = git_output(root, &["rev-parse", "--short", "HEAD"])?;
    let commit = commit.trim();
    Ok((!commit.is_empty()).then(|| commit.to_string()))
}

fn read_branches(root: &Path) -> Result<Vec<String>, String> {
    let output = git_output(
        root,
        &[
            "for-each-ref",
            "--sort=refname",
            "--format=%(refname:short)",
            "refs/heads",
        ],
    )?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .map(ToString::to_string)
        .collect())
}

fn read_uncommitted_file_count(root: &Path) -> Result<u32, String> {
    let output = git_output(root, &["status", "--porcelain", "--untracked-files=all"])?;
    Ok(output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as u32)
}

fn git_output(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|error| format!("无法执行 git: {error}"))?;
    output_to_string(output)
}

fn git_worktree_add(root: &Path, branch: &str, path: &Path) -> Result<(), String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .arg("worktree")
        .arg("add")
        .arg("--detach")
        .arg(path)
        .arg(branch)
        .output()
        .map_err(|error| format!("无法执行 git: {error}"))?;
    output_to_string(output).map(|_| ())
}

fn output_to_string(output: Output) -> Result<String, String> {
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("git 命令失败: {}", output.status))
    } else {
        Err(stderr)
    }
}

fn validate_branch_name(branch: &str) -> Result<(), String> {
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("分支名不能为空".to_string());
    }
    if branch.len() > 128 {
        return Err("分支名过长".to_string());
    }
    if branch.starts_with('-') || branch.starts_with('/') || branch.ends_with('/') {
        return Err("分支名格式无效".to_string());
    }
    if branch.ends_with(".lock") || branch.contains("..") || branch.contains("@{") {
        return Err("分支名格式无效".to_string());
    }
    if branch.chars().any(|ch| {
        ch.is_control()
            || ch.is_whitespace()
            || matches!(ch, '~' | '^' | ':' | '?' | '*' | '[' | '\\')
    }) {
        return Err("分支名格式无效".to_string());
    }
    if branch
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err("分支名格式无效".to_string());
    }
    Ok(())
}

fn resolve_worktree_slug(name: Option<&str>) -> String {
    let fallback = || {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        format!("worktree-{millis}")
    };
    let Some(name) = name.map(str::trim).filter(|value| !value.is_empty()) else {
        return fallback();
    };
    let slug = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches(['-', '.', '_'])
        .to_string();
    if slug.is_empty() {
        fallback()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn git_available() -> bool {
        Command::new("git").arg("--version").output().is_ok()
    }

    fn run_git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .arg("-C")
            .arg(root)
            .args(args)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_repo() -> Option<(TempDir, PathBuf)> {
        if !git_available() {
            return None;
        }
        let temp = TempDir::new().expect("temp dir");
        let repo = temp.path().join("repo");
        fs::create_dir_all(&repo).expect("create repo");
        run_git(&repo, &["init"]);
        run_git(&repo, &["config", "user.email", "test@example.com"]);
        run_git(&repo, &["config", "user.name", "Test User"]);
        fs::write(repo.join("README.md"), "hello").expect("write readme");
        run_git(&repo, &["add", "README.md"]);
        run_git(&repo, &["commit", "-m", "init"]);
        run_git(&repo, &["branch", "-M", "main"]);
        Some((temp, repo))
    }

    #[test]
    fn status_returns_local_mode_for_plain_directory() {
        let temp = TempDir::new().expect("temp dir");
        let status = read_status(&temp.path().to_string_lossy()).expect("status");
        assert!(!status.has_git_repository);
        assert!(status.current_branch.is_none());
        assert!(status.branches.is_empty());
    }

    #[test]
    fn status_reads_branch_and_dirty_count() {
        let Some((_temp, repo)) = init_repo() else {
            return;
        };
        fs::write(repo.join("note.txt"), "dirty").expect("write dirty");

        let status = read_status(&repo.to_string_lossy()).expect("status");

        assert!(status.has_git_repository);
        assert_eq!(status.current_branch.as_deref(), Some("main"));
        assert!(status.branches.iter().any(|branch| branch == "main"));
        assert_eq!(status.uncommitted_file_count, 1);
    }

    #[test]
    fn branch_create_and_checkout_refresh_status() {
        let Some((_temp, repo)) = init_repo() else {
            return;
        };

        let created =
            create_branch(&repo.to_string_lossy(), "feature/demo").expect("create branch");
        assert_eq!(created.current_branch.as_deref(), Some("feature/demo"));

        let checked_out = checkout_branch(&repo.to_string_lossy(), "main").expect("checkout");
        assert_eq!(checked_out.current_branch.as_deref(), Some("main"));
    }

    #[test]
    fn branch_validation_rejects_injection_like_names() {
        assert!(validate_branch_name("-bad").is_err());
        assert!(validate_branch_name("bad name").is_err());
        assert!(validate_branch_name("bad..name").is_err());
        assert!(validate_branch_name("bad~name").is_err());
    }

    #[test]
    fn worktree_create_returns_new_worktree_status() {
        let Some((_temp, repo)) = init_repo() else {
            return;
        };

        let worktree = create_worktree(&repo.to_string_lossy(), Some("agent-demo"), Some("main"))
            .expect("worktree");

        assert!(PathBuf::from(&worktree.worktree_path).exists());
        assert_eq!(worktree.branch, "main");
        assert!(worktree.status.has_git_repository);
        assert!(worktree.status.current_branch.is_some());
    }
}
