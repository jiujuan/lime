//! 层级化 AGENT.md 指令发现机制
//!
//! 从文件系统发现并加载多层级的 AGENT.md 指令文件，
//! 按优先级从低到高：全局 -> 项目根 -> 当前目录

use lime_core::app_paths;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// 支持的指令文件名列表（按优先级排序）
const INSTRUCTION_FILENAMES: &[&str] = &["AGENT.md", ".agent.md", "agent.md"];

// 保留旧常量供测试使用（第一优先级文件名）
#[cfg(test)]
const INSTRUCTION_FILENAME: &str = "AGENT.md";

/// 指令来源，按优先级从低到高
#[derive(Debug, Clone, PartialEq)]
pub enum InstructionSource {
    /// 应用级用户指令文件（统一收口到 app_paths::resolve_user_memory_path）
    Global,
    /// 项目根目录/AGENT.md
    Project,
    /// 当前工作目录/AGENT.md（当不同于项目根时）
    Directory,
}

/// 单层指令
#[derive(Debug, Clone)]
pub struct InstructionLayer {
    pub source: InstructionSource,
    pub content: String,
    pub path: PathBuf,
}

/// 在指定目录查找第一个存在的指令文件
fn find_instruction_file(dir: &Path) -> Option<PathBuf> {
    for filename in INSTRUCTION_FILENAMES {
        let path = dir.join(filename);
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn find_global_instruction_file() -> Option<PathBuf> {
    app_paths::resolve_user_memory_path()
        .ok()
        .filter(|path| path.is_file())
}

/// 从文件系统发现并加载层级化指令
/// 返回按优先级排序的指令列表（低优先级在前）
pub fn discover_instructions(working_dir: &Path) -> Vec<InstructionLayer> {
    let mut layers = Vec::new();

    // 1. 全局: 统一用户指令文件
    if let Some(global_path) = find_global_instruction_file() {
        if let Some(layer) = load_layer(&global_path, InstructionSource::Global) {
            layers.push(layer);
        }
    }

    // 2. 项目根: 从 working_dir 向上查找 .git 确定项目根
    let project_root = find_project_root(working_dir);
    if let Some(ref root) = project_root {
        if let Some(path) = find_instruction_file(root) {
            if let Some(layer) = load_layer(&path, InstructionSource::Project) {
                layers.push(layer);
            }
        }
    }

    // 3. 目录级: working_dir 下查找指令文件（仅当不同于项目根时）
    let is_same_as_root = project_root
        .as_deref()
        .map_or(false, |root| root == working_dir);
    if !is_same_as_root {
        if let Some(path) = find_instruction_file(working_dir) {
            if let Some(layer) = load_layer(&path, InstructionSource::Directory) {
                layers.push(layer);
            }
        }
    }

    layers
}

/// 合并多层指令为最终文本
pub fn merge_instructions(layers: &[InstructionLayer]) -> String {
    if layers.is_empty() {
        return String::new();
    }

    layers
        .iter()
        .map(|layer| {
            let label = match layer.source {
                InstructionSource::Global => "全局指令",
                InstructionSource::Project => "项目指令",
                InstructionSource::Directory => "目录指令",
            };
            format!(
                "<!-- {} ({}) -->\n{}",
                label,
                layer.path.display(),
                layer.content
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// 从 path 向上查找包含 .git 的目录作为项目根
fn find_project_root(path: &Path) -> Option<PathBuf> {
    let mut current = if path.is_file() {
        path.parent()?.to_path_buf()
    } else {
        path.to_path_buf()
    };
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

/// 尝试加载单个指令文件（含 @include 展开）
fn load_layer(path: &Path, source: InstructionSource) -> Option<InstructionLayer> {
    let content = std::fs::read_to_string(path).ok()?;
    let base_dir = path.parent().unwrap_or(Path::new("."));
    let mut visited = HashSet::new();
    visited.insert(path.to_path_buf());
    let expanded = process_includes(&content, base_dir, &mut visited);
    let expanded = expanded.trim().to_string();
    if expanded.is_empty() {
        return None;
    }
    Some(InstructionLayer {
        source,
        content: expanded,
        path: path.to_path_buf(),
    })
}

// ---------------------------------------------------------------------------
// @include 指令处理
// ---------------------------------------------------------------------------

/// 处理 @include 指令，递归展开引用的文件
fn process_includes(content: &str, base_dir: &Path, visited: &mut HashSet<PathBuf>) -> String {
    let mut result = String::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(path_str) = trimmed.strip_prefix('@') {
            // 跳过空路径
            if path_str.is_empty() {
                result.push_str(line);
                result.push('\n');
                continue;
            }
            // 解析路径（支持 @./path、@~/path、@/absolute/path）
            let include_path = resolve_include_path(path_str.trim(), base_dir);
            if let Some(ref path) = include_path {
                if visited.contains(path) {
                    result.push_str(&format!("<!-- 循环引用已跳过: {} -->\n", path.display()));
                    continue;
                }
                if is_binary_file(path) {
                    result.push_str(&format!("<!-- 二进制文件已跳过: {} -->\n", path.display()));
                    continue;
                }
                if let Ok(included_content) = std::fs::read_to_string(path) {
                    visited.insert(path.clone());
                    let expanded = process_includes(
                        &included_content,
                        path.parent().unwrap_or(base_dir),
                        visited,
                    );
                    result.push_str(&expanded);
                    if !expanded.ends_with('\n') {
                        result.push('\n');
                    }
                } else {
                    result.push_str(&format!("<!-- 无法读取: {} -->\n", path.display()));
                }
            } else {
                // 不是有效的 include 路径，保留原文
                result.push_str(line);
                result.push('\n');
            }
        } else {
            result.push_str(line);
            result.push('\n');
        }
    }
    result
}

/// 解析 include 路径
fn resolve_include_path(path_str: &str, base_dir: &Path) -> Option<PathBuf> {
    let unescaped = path_str.replace("\\ ", " ");
    if unescaped.starts_with("./") || unescaped.starts_with("../") {
        Some(base_dir.join(&unescaped))
    } else if unescaped.starts_with('~') {
        dirs::home_dir().map(|home| home.join(&unescaped[2..]))
    } else if unescaped.starts_with('/') {
        Some(PathBuf::from(&unescaped))
    } else {
        // 相对路径
        Some(base_dir.join(&unescaped))
    }
}

/// 判断是否为二进制文件（按扩展名）
fn is_binary_file(path: &Path) -> bool {
    const BINARY_EXTENSIONS: &[&str] = &[
        "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "woff", "woff2", "ttf", "eot", "zip",
        "tar", "gz", "bz2", "xz", "7z", "exe", "dll", "so", "dylib", "pdf", "doc", "docx", "xls",
        "xlsx", "mp3", "mp4", "avi", "mov", "wav", "wasm", "o", "a", "lib",
    ];
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| BINARY_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// 缓存
// ---------------------------------------------------------------------------

struct CachedInstruction {
    layers: Vec<InstructionLayer>,
    cached_at: Instant,
}

// InstructionLayer 没有实现 Clone，手动实现缓存的 clone
impl CachedInstruction {
    fn clone_layers(&self) -> Vec<InstructionLayer> {
        self.layers.clone()
    }
}

static CACHE: std::sync::LazyLock<RwLock<std::collections::HashMap<PathBuf, CachedInstruction>>> =
    std::sync::LazyLock::new(|| RwLock::new(std::collections::HashMap::new()));

/// 带缓存的指令发现（TTL 默认 60 秒）
pub fn discover_instructions_cached(working_dir: &Path, ttl: Duration) -> Vec<InstructionLayer> {
    let key = working_dir.to_path_buf();

    // 检查缓存
    if let Ok(cache) = CACHE.read() {
        if let Some(cached) = cache.get(&key) {
            if cached.cached_at.elapsed() < ttl {
                return cached.clone_layers();
            }
        }
    }

    // 缓存未命中或过期，重新发现
    let layers = discover_instructions(working_dir);

    if let Ok(mut cache) = CACHE.write() {
        cache.insert(
            key,
            CachedInstruction {
                layers: layers.clone(),
                cached_at: Instant::now(),
            },
        );
    }

    layers
}

/// 清除指令缓存
pub fn clear_instruction_cache() {
    if let Ok(mut cache) = CACHE.write() {
        cache.clear();
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_discover_no_files() {
        let tmp = TempDir::new().unwrap();
        let layers = discover_instructions(tmp.path());
        // 没有 AGENT.md，也没有 .git，不应发现任何指令
        // （全局指令取决于用户环境，这里只验证不会 panic）
        assert!(layers
            .iter()
            .all(|l| l.source != InstructionSource::Project
                && l.source != InstructionSource::Directory));
    }

    #[test]
    fn test_discover_project_root() {
        let tmp = TempDir::new().unwrap();
        // 模拟项目根
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(
            tmp.path().join(INSTRUCTION_FILENAME),
            "# Project Instructions",
        )
        .unwrap();

        let layers = discover_instructions(tmp.path());
        let project_layers: Vec<_> = layers
            .iter()
            .filter(|l| l.source == InstructionSource::Project)
            .collect();
        assert_eq!(project_layers.len(), 1);
        assert_eq!(project_layers[0].content, "# Project Instructions");
    }

    #[test]
    fn test_discover_directory_layer() {
        let tmp = TempDir::new().unwrap();
        // 项目根在 tmp
        fs::create_dir(tmp.path().join(".git")).unwrap();
        // 子目录有自己的 AGENT.md
        let subdir = tmp.path().join("src");
        fs::create_dir(&subdir).unwrap();
        fs::write(subdir.join(INSTRUCTION_FILENAME), "# Dir Instructions").unwrap();

        let layers = discover_instructions(&subdir);
        let dir_layers: Vec<_> = layers
            .iter()
            .filter(|l| l.source == InstructionSource::Directory)
            .collect();
        assert_eq!(dir_layers.len(), 1);
        assert_eq!(dir_layers[0].content, "# Dir Instructions");
    }

    #[test]
    fn test_discover_no_duplicate_when_at_project_root() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(tmp.path().join(INSTRUCTION_FILENAME), "# Root").unwrap();

        let layers = discover_instructions(tmp.path());
        // working_dir == project_root 时不应出现 Directory 层
        let dir_layers: Vec<_> = layers
            .iter()
            .filter(|l| l.source == InstructionSource::Directory)
            .collect();
        assert_eq!(dir_layers.len(), 0);
    }

    #[test]
    fn test_discover_empty_file_skipped() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(tmp.path().join(INSTRUCTION_FILENAME), "   \n  ").unwrap();

        let layers = discover_instructions(tmp.path());
        let project_layers: Vec<_> = layers
            .iter()
            .filter(|l| l.source == InstructionSource::Project)
            .collect();
        assert_eq!(project_layers.len(), 0);
    }

    #[test]
    fn test_merge_instructions() {
        let layers = vec![
            InstructionLayer {
                source: InstructionSource::Global,
                content: "global rule".to_string(),
                path: PathBuf::from("/appdata/lime/AGENTS.md"),
            },
            InstructionLayer {
                source: InstructionSource::Project,
                content: "project rule".to_string(),
                path: PathBuf::from("/project/AGENT.md"),
            },
        ];
        let merged = merge_instructions(&layers);
        assert!(merged.contains("全局指令"));
        assert!(merged.contains("global rule"));
        assert!(merged.contains("项目指令"));
        assert!(merged.contains("project rule"));
        // 全局在前，项目在后
        assert!(merged.find("global rule").unwrap() < merged.find("project rule").unwrap());
    }

    #[test]
    fn test_merge_empty() {
        assert_eq!(merge_instructions(&[]), "");
    }

    #[test]
    fn test_priority_order() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(tmp.path().join(INSTRUCTION_FILENAME), "project").unwrap();
        let subdir = tmp.path().join("sub");
        fs::create_dir(&subdir).unwrap();
        fs::write(subdir.join(INSTRUCTION_FILENAME), "directory").unwrap();

        let layers = discover_instructions(&subdir);
        let non_global: Vec<_> = layers
            .iter()
            .filter(|l| l.source != InstructionSource::Global)
            .collect();
        assert_eq!(non_global.len(), 2);
        assert_eq!(non_global[0].source, InstructionSource::Project);
        assert_eq!(non_global[1].source, InstructionSource::Directory);
    }

    // --- 新增测试 ---

    #[test]
    fn test_multi_filename_support() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        // 使用 .agent.md（第二优先级）
        fs::write(tmp.path().join(".agent.md"), "dotfile agent").unwrap();

        let layers = discover_instructions(tmp.path());
        let project: Vec<_> = layers
            .iter()
            .filter(|l| l.source == InstructionSource::Project)
            .collect();
        assert_eq!(project.len(), 1);
        assert!(project[0].content.contains("dotfile agent"));
    }

    #[test]
    fn test_multi_filename_priority() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        // 同时存在 AGENT.md 和 .agent.md，应优先使用 AGENT.md
        fs::write(tmp.path().join("AGENT.md"), "primary agent").unwrap();
        fs::write(tmp.path().join(".agent.md"), "secondary agent").unwrap();

        let layers = discover_instructions(tmp.path());
        let project: Vec<_> = layers
            .iter()
            .filter(|l| l.source == InstructionSource::Project)
            .collect();
        assert_eq!(project.len(), 1);
        assert!(project[0].content.contains("primary agent"));
    }

    #[test]
    fn test_project_discovery_ignores_legacy_lime_subdir_files() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        let legacy_dir = tmp.path().join(".lime");
        fs::create_dir(&legacy_dir).unwrap();
        fs::write(legacy_dir.join("AGENT.md"), "legacy nested agent").unwrap();

        let layers = discover_instructions(tmp.path());
        let project: Vec<_> = layers
            .iter()
            .filter(|l| l.source == InstructionSource::Project)
            .collect();
        assert!(project.is_empty());
    }

    #[test]
    fn test_include_directive() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(tmp.path().join("extra.md"), "included content").unwrap();
        fs::write(tmp.path().join("AGENT.md"), "main\n@./extra.md\nend").unwrap();

        let layers = discover_instructions(tmp.path());
        let project: Vec<_> = layers
            .iter()
            .filter(|l| l.source == InstructionSource::Project)
            .collect();
        assert_eq!(project.len(), 1);
        assert!(project[0].content.contains("included content"));
    }

    #[test]
    fn test_include_circular_reference() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(tmp.path().join("a.md"), "@./b.md").unwrap();
        fs::write(tmp.path().join("b.md"), "@./a.md").unwrap();
        fs::write(tmp.path().join("AGENT.md"), "@./a.md").unwrap();

        let layers = discover_instructions(tmp.path());
        // 不应该无限循环
        assert!(!layers.is_empty());
    }

    #[test]
    fn test_binary_file_skip() {
        assert!(is_binary_file(Path::new("image.png")));
        assert!(is_binary_file(Path::new("archive.zip")));
        assert!(!is_binary_file(Path::new("readme.md")));
        assert!(!is_binary_file(Path::new("code.rs")));
    }

    #[test]
    fn test_cached_discovery() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        fs::write(tmp.path().join("AGENT.md"), "cached test").unwrap();

        let layers1 = discover_instructions_cached(tmp.path(), Duration::from_secs(60));
        let layers2 = discover_instructions_cached(tmp.path(), Duration::from_secs(60));
        assert_eq!(layers1.len(), layers2.len());

        // 清除缓存
        clear_instruction_cache();
    }
}
