//! 记忆文件 @import 解析服务
//!
//! 支持从 Markdown 文档中解析以 `@` 开头的导入行，并递归展开。

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// @import 解析选项
#[derive(Debug, Clone)]
pub struct MemoryImportParseOptions {
    /// 是否启用导入解析
    pub follow_imports: bool,
    /// 最大递归深度（根文件为 0）
    pub max_depth: usize,
}

impl Default for MemoryImportParseOptions {
    fn default() -> Self {
        Self {
            follow_imports: true,
            max_depth: 5,
        }
    }
}

/// @import 解析结果
#[derive(Debug, Clone, Default)]
pub struct MemoryImportParseResult {
    /// 展开后的完整内容
    pub content: String,
    /// 成功导入的文件列表
    pub imported_files: Vec<PathBuf>,
    /// 解析过程中的告警
    pub warnings: Vec<String>,
}

/// 读取并解析记忆文件（支持 @import）
pub fn parse_memory_file(
    entry_path: &Path,
    options: &MemoryImportParseOptions,
) -> Result<MemoryImportParseResult, String> {
    if !entry_path.exists() {
        return Err(format!("文件不存在: {}", entry_path.display()));
    }
    if !entry_path.is_file() {
        return Err(format!("路径不是文件: {}", entry_path.display()));
    }

    let mut result = MemoryImportParseResult::default();
    let mut visited = HashSet::new();
    let normalized_entry = normalize_path(entry_path);
    visited.insert(normalized_entry.clone());

    let content = parse_file_recursive(
        &normalized_entry,
        options,
        0,
        &mut visited,
        &mut result.imported_files,
        &mut result.warnings,
    )?;

    result.content = content;
    Ok(result)
}

fn parse_file_recursive(
    file_path: &Path,
    options: &MemoryImportParseOptions,
    depth: usize,
    visited: &mut HashSet<PathBuf>,
    imported_files: &mut Vec<PathBuf>,
    warnings: &mut Vec<String>,
) -> Result<String, String> {
    let raw = fs::read_to_string(file_path)
        .map_err(|e| format!("读取记忆文件失败 {}: {e}", file_path.display()))?;

    if !options.follow_imports {
        return Ok(raw);
    }

    let mut output = String::new();
    let mut in_code_block = false;

    for line in raw.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            output.push_str(line);
            output.push('\n');
            continue;
        }

        if in_code_block || !trimmed.starts_with('@') || trimmed.starts_with("@@") {
            output.push_str(line);
            output.push('\n');
            continue;
        }

        let import_target = trimmed.trim_start_matches('@').trim();
        if import_target.is_empty() {
            output.push_str(line);
            output.push('\n');
            continue;
        }

        if depth >= options.max_depth {
            warnings.push(format!(
                "导入深度超限（{}），已跳过: {} -> {}",
                options.max_depth,
                file_path.display(),
                import_target
            ));
            output.push_str(&format!(
                "<!-- import skipped: max depth reached ({}) -->\n",
                options.max_depth
            ));
            continue;
        }

        let resolved = resolve_import_path(import_target, file_path.parent());
        let Some(import_path) = resolved else {
            warnings.push(format!(
                "无法解析导入路径: {} -> {}",
                file_path.display(),
                import_target
            ));
            output.push_str(line);
            output.push('\n');
            continue;
        };
        let normalized_import = normalize_path(&import_path);

        if visited.contains(&normalized_import) {
            warnings.push(format!(
                "检测到循环导入，已跳过: {}",
                normalized_import.display()
            ));
            output.push_str(&format!(
                "<!-- import skipped: cyclic {} -->\n",
                normalized_import.display()
            ));
            continue;
        }

        if !normalized_import.exists() || !normalized_import.is_file() {
            warnings.push(format!("导入目标不存在: {}", normalized_import.display()));
            output.push_str(&format!(
                "<!-- import missing: {} -->\n",
                normalized_import.display()
            ));
            continue;
        }

        visited.insert(normalized_import.clone());
        imported_files.push(normalized_import.clone());
        let imported_content = parse_file_recursive(
            &normalized_import,
            options,
            depth + 1,
            visited,
            imported_files,
            warnings,
        )?;
        visited.remove(&normalized_import);

        output.push_str(&format!(
            "<!-- import begin: {} -->\n",
            normalized_import.display()
        ));
        output.push_str(imported_content.trim_end());
        output.push('\n');
        output.push_str(&format!(
            "<!-- import end: {} -->\n",
            normalized_import.display()
        ));
    }

    Ok(output)
}

fn resolve_import_path(import_target: &str, base_dir: Option<&Path>) -> Option<PathBuf> {
    let normalized = import_target.replace("\\ ", " ");

    if normalized.starts_with('/') {
        return Some(PathBuf::from(normalized));
    }

    if normalized.starts_with("~/") {
        let home = dirs::home_dir()?;
        return Some(home.join(normalized.trim_start_matches("~/")));
    }

    let base = base_dir.unwrap_or_else(|| Path::new("."));
    Some(base.join(normalized))
}

fn normalize_path(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn should_parse_nested_imports() {
        let tmp = TempDir::new().expect("create temp dir");
        let root = tmp.path();
        let main = root.join("main.md");
        let a = root.join("a.md");
        let b = root.join("b.md");
        fs::write(&b, "B-Content").expect("write b");
        fs::write(&a, format!("A-Header\n@{}\nA-Footer", b.display())).expect("write a");
        fs::write(&main, format!("Main\n@{}\nDone", a.display())).expect("write main");

        let result = parse_memory_file(&main, &MemoryImportParseOptions::default())
            .expect("parse memory file");

        assert!(result.content.contains("Main"));
        assert!(result.content.contains("A-Header"));
        assert!(result.content.contains("B-Content"));
        assert!(result.imported_files.len() >= 2);
    }

    #[test]
    fn should_handle_cyclic_imports() {
        let tmp = TempDir::new().expect("create temp dir");
        let root = tmp.path();
        let a = root.join("a.md");
        let b = root.join("b.md");
        fs::write(&a, "@./b.md").expect("write a");
        fs::write(&b, "@./a.md").expect("write b");

        let result =
            parse_memory_file(&a, &MemoryImportParseOptions::default()).expect("parse memory file");

        assert!(!result.warnings.is_empty());
        assert!(result
            .warnings
            .iter()
            .any(|w| w.contains("循环导入") || w.contains("cyclic")));
    }

    #[test]
    fn should_stop_at_max_depth() {
        let tmp = TempDir::new().expect("create temp dir");
        let root = tmp.path();
        fs::write(root.join("1.md"), "@./2.md").expect("write 1");
        fs::write(root.join("2.md"), "@./3.md").expect("write 2");
        fs::write(root.join("3.md"), "deep").expect("write 3");

        let options = MemoryImportParseOptions {
            follow_imports: true,
            max_depth: 1,
        };
        let result = parse_memory_file(&root.join("1.md"), &options).expect("parse 1");
        assert!(result.warnings.iter().any(|w| w.contains("导入深度超限")));
    }
}
