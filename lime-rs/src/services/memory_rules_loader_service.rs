//! 记忆规则加载服务
//!
//! 负责从 `.agents/rules/**/*.md` 加载规则，并支持基于 frontmatter `paths` 的条件匹配。

use glob::Pattern;
use std::fs;
use std::path::{Path, PathBuf};

/// 规则文档
#[derive(Debug, Clone)]
pub struct LoadedMemoryRule {
    /// 规则文件路径
    pub path: PathBuf,
    /// 标题（优先第一个一级标题，否则文件名）
    pub title: String,
    /// 规则正文（已去除 frontmatter）
    pub content: String,
    /// frontmatter 中的 paths 条件
    pub path_patterns: Vec<String>,
    /// 是否命中当前 active_path
    pub matched: bool,
}

/// 从规则目录递归加载规则
///
/// - `rule_dir`: 规则目录（通常是 `.agents/rules`）
/// - `active_path`: 当前正在处理的相对路径（用于 paths 匹配）
pub fn load_rules(rule_dir: &Path, active_path: Option<&str>) -> Vec<LoadedMemoryRule> {
    let mut rule_files = Vec::new();
    collect_markdown_files(rule_dir, &mut rule_files);
    rule_files.sort();

    rule_files
        .into_iter()
        .filter_map(|path| parse_rule_file(&path, active_path))
        .collect()
}

fn collect_markdown_files(dir: &Path, output: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_markdown_files(&path, output);
            continue;
        }

        if !path.is_file() {
            continue;
        }

        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("md"))
            .unwrap_or(false)
        {
            output.push(path);
        }
    }
}

fn parse_rule_file(path: &Path, active_path: Option<&str>) -> Option<LoadedMemoryRule> {
    let raw = fs::read_to_string(path).ok()?;
    let (path_patterns, content) = strip_frontmatter_and_extract_paths(&raw);
    let title = extract_title(path, &content);

    let normalized_active = active_path.map(normalize_glob_path);
    let matched = if path_patterns.is_empty() {
        true
    } else if let Some(active) = normalized_active.as_deref() {
        matches_any_pattern(active, &path_patterns)
    } else {
        false
    };

    if !matched {
        return None;
    }

    let trimmed_content = content.trim().to_string();
    if trimmed_content.is_empty() {
        return None;
    }

    Some(LoadedMemoryRule {
        path: path.to_path_buf(),
        title,
        content: trimmed_content,
        path_patterns,
        matched: true,
    })
}

fn strip_frontmatter_and_extract_paths(raw: &str) -> (Vec<String>, String) {
    if !raw.starts_with("---\n") && !raw.starts_with("---\r\n") {
        return (Vec::new(), raw.to_string());
    }

    let mut lines = raw.lines();
    let Some(first) = lines.next() else {
        return (Vec::new(), String::new());
    };
    if first.trim() != "---" {
        return (Vec::new(), raw.to_string());
    }

    let mut frontmatter_lines = Vec::new();
    let mut body_lines = Vec::new();
    let mut in_frontmatter = true;

    for line in lines {
        if in_frontmatter && line.trim() == "---" {
            in_frontmatter = false;
            continue;
        }

        if in_frontmatter {
            frontmatter_lines.push(line.to_string());
        } else {
            body_lines.push(line.to_string());
        }
    }

    if in_frontmatter {
        // 未闭合 frontmatter，按普通 markdown 处理
        return (Vec::new(), raw.to_string());
    }

    let patterns = extract_paths_from_frontmatter(&frontmatter_lines);
    (patterns, body_lines.join("\n"))
}

fn extract_paths_from_frontmatter(lines: &[String]) -> Vec<String> {
    let mut patterns = Vec::new();
    let mut in_paths_block = false;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if !in_paths_block {
            if trimmed == "paths:" {
                in_paths_block = true;
            }
            continue;
        }

        if trimmed.starts_with('-') {
            let value = trimmed.trim_start_matches('-').trim();
            if !value.is_empty() {
                patterns.push(value.trim_matches('"').trim_matches('\'').to_string());
            }
            continue;
        }

        // paths 块结束
        break;
    }

    patterns
}

fn extract_title(path: &Path, content: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(title) = trimmed.strip_prefix("# ") {
            let title = title.trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }

    path.file_stem()
        .and_then(|v| v.to_str())
        .unwrap_or("rule")
        .to_string()
}

fn normalize_glob_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn matches_any_pattern(active_path: &str, patterns: &[String]) -> bool {
    patterns.iter().any(|pattern| {
        Pattern::new(pattern)
            .map(|p| p.matches(active_path))
            .unwrap_or(false)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn should_load_unconditional_rules() {
        let tmp = TempDir::new().expect("create temp dir");
        let rules_dir = tmp.path().join(".agents/rules");
        fs::create_dir_all(&rules_dir).expect("create rules dir");
        fs::write(rules_dir.join("general.md"), "# 通用规则\n- 保持简洁").expect("write rule");

        let rules = load_rules(&rules_dir, None);
        assert_eq!(rules.len(), 1);
        assert!(rules[0].matched);
        assert!(rules[0].content.contains("保持简洁"));
    }

    #[test]
    fn should_match_conditional_rule_by_paths() {
        let tmp = TempDir::new().expect("create temp dir");
        let rules_dir = tmp.path().join(".agents/rules");
        fs::create_dir_all(&rules_dir).expect("create rules dir");
        fs::write(
            rules_dir.join("api.md"),
            r#"---
paths:
  - "src/api/**/*.ts"
---
# API 规则
- 必须做输入校验
"#,
        )
        .expect("write rule");

        let matched = load_rules(&rules_dir, Some("src/api/user/index.ts"));
        assert_eq!(matched.len(), 1);
        assert!(matched[0].matched);
        assert!(matched[0].content.contains("输入校验"));

        let not_matched = load_rules(&rules_dir, Some("src/ui/index.tsx"));
        assert_eq!(not_matched.len(), 0);
    }
}
