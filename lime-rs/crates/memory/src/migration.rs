//! 数据迁移逻辑
//!
//! 从旧的文件系统记忆（~/.lime/memory/<session_id>/）迁移到新的 SQLite 统一记忆表

use crate::models::{UnifiedMemory, MemoryCategory, MemorySource};
use crate::migrations::v1_unified_memory::migrate as migrate_v1;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

/// 迁移结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationResult {
    /// 迁移的条目总数
    pub total_migrated: usize,
    /// 按会话数
    pub session_count: usize,
    /// 成功迁移数
    pub success_count: usize,
    /// 失败数
    pub failed_count: usize,
    /// 错误信息
    pub errors: Vec<String>,
}

/// 从旧文件系统迁移到 SQLite
pub fn migrate_file_memory_to_sqlite(
    db: &Connection,
) -> std::result::Result<MigrationResult, String> {
    info!("[记忆迁移] 开始从文件系统迁移到 SQLite");

    // 1. 确保数据库表已创建
    migrate_v1(db).map_err(|e| format!("数据库迁移失败: {}", e))?;

    let memory_dir = std::env::var("HOME")
        .map(|home| {
            let mut path = PathBuf::from(home);
            path.push(".lime");
            path.push("memory");
            path
        })
        .unwrap_or_else(|_| {
            let mut path = PathBuf::from(".");
            path.push(".lime");
            path.push("memory");
            path
        });

    if !memory_dir.exists() {
        info!("[记忆迁移] 记忆目录不存在，跳过迁移");
        return Ok(MigrationResult {
            total_migrated: 0,
            session_count: 0,
            success_count: 0,
            failed_count: 0,
            errors: Vec::new(),
        });
    }

    let mut result = MigrationResult {
        total_migrated: 0,
        session_count: 0,
        success_count: 0,
        failed_count: 0,
        errors: Vec::new(),
    };

    // 2. 读取所有会话目录
    let session_dirs = fs::read_dir(&memory_dir)
        .map_err(|e| format!("读取记忆目录失败: {}", e))?;

    // 3. 遍历每个会话目录
    for session_entry in session_dirs.flatten() {
        let session_path = session_entry.path();
        if !session_path.is_dir() {
            continue;
        }

        let session_id = session_entry
            .file_name()
            .to_string_lossy()
            .to_string();

        info!("[记忆迁移] 处理会话: {}", session_id);
        result.session_count += 1;

        // 读取会话目录下的记忆文件
        let files = match fs::read_dir(&session_path) {
            Ok(files) => files,
            Err(err) => {
                warn!("[记忆迁移] 读取会话目录失败: {} - {}", session_id, err);
                result.errors.push(format!("会话 {} 读取失败", session_id));
                continue;
            }
        };

        // 解析并迁移每个文件
        for file_entry in files.flatten() {
            let file_path = file_entry.path();
            if !file_path.is_file() {
                continue;
            }

            let file_name = file_entry.file_name().to_string_lossy().to_string();

            // 只处理支持的 4 种文件类型
            match file_name.as_str() {
                "task_plan.md" | "findings.md" | "progress.md" | "error_log.json" => {
                    if let Err(e) = migrate_single_file(db, &session_id, &file_path, &file_name, &mut result) {
                        warn!("[记忆迁移] 迁移文件失败: {} - {}", file_path.display(), e);
                        result.errors.push(format!("{}: {}", file_name, e));
                        result.failed_count += 1;
                    }
                }
                _ => {
                    // 忽略其他文件
                    continue;
                }
            }
        }
    }

    info!(
        "[记忆迁移] 迁移完成：总 {} 条，会话 {} 个，成功 {} 条，失败 {} 条",
        result.total_migrated,
        result.session_count,
        result.success_count,
        result.failed_count
    );

    Ok(result)
}

/// 迁移单个记忆文件
fn migrate_single_file(
    db: &Connection,
    session_id: &str,
    file_path: &Path,
    file_name: &str,
    result: &mut MigrationResult,
) -> std::result::Result<(), String> {
    let content = fs::read_to_string(file_path).map_err(|e| {
        format!("读取文件失败: {}", e)
    })?;

    if content.trim().is_empty() {
        return Ok(());
    }

    // 根据文件类型解析并创建记忆条目
    let memories = parse_memory_file(session_id, file_name, &content)?;

    // 批量插入数据库
    for memory in memories {
        insert_unified_memory(db, &memory)?;
        result.total_migrated += 1;
        result.success_count += 1;
    }

    Ok(())
}

/// 解析记忆文件
fn parse_memory_file(
    session_id: &str,
    file_name: &str,
    content: &str,
) -> std::result::Result<Vec<UnifiedMemory>, String> {
    match file_name {
        "task_plan.md" => parse_markdown_entries(session_id, content, "task_plan", MemoryCategory::Activity),
        "findings.md" => parse_markdown_entries(session_id, content, "findings", MemoryCategory::Experience),
        "progress.md" => parse_markdown_entries(session_id, content, "progress", MemoryCategory::Experience),
        "error_log.json" => parse_error_entries(session_id, content),
        _ => Ok(Vec::new()),
    }
}

/// 解析 Markdown 文件（task_plan.md, findings.md, progress.md）
fn parse_markdown_entries(
    session_id: &str,
    content: &str,
    file_type: &str,
    default_category: MemoryCategory,
) -> std::result::Result<Vec<UnifiedMemory>, String> {
    let mut entries = Vec::new();
    let mut current_title: Option<String> = None;
    let mut section_lines: Vec<String> = Vec::new();
    let mut index = 0usize;

    for line in content.lines() {
        if let Some(title) = line.strip_prefix("## ") {
            if let Some(previous_title) = current_title.take() {
                // 使用 default_category 的克隆，避免移动
                let cat = default_category.clone();
                if let Some(entry) = build_markdown_entry(
                    session_id,
                    file_type,
                    index,
                    &previous_title,
                    &section_lines,
                    cat,
                ) {
                    entries.push(entry);
                    index += 1;
                }
            }

            current_title = Some(title.trim().to_string());
            section_lines.clear();
            continue;
        }

        if current_title.is_some() {
            section_lines.push(line.to_string());
        }
    }

    // 处理最后一个章节
    if let Some(previous_title) = current_title {
        let cat = default_category.clone();
        if let Some(entry) = build_markdown_entry(
            session_id,
            file_type,
            index,
            &previous_title,
            &section_lines,
            cat,
        ) {
            entries.push(entry);
        }
    }

    Ok(entries)
}

/// 构建 Markdown 记忆条目
fn build_markdown_entry(
    session_id: &str,
    _file_type: &str,
    _index: usize,
    title: &str,
    lines: &[String],
    default_category: MemoryCategory,
) -> Option<UnifiedMemory> {
    if title.trim().is_empty() {
        return None;
    }

    let (tags, _updated_at) = parse_metadata(lines);
    let summary = summarize_lines(lines);
    let category = infer_category_from_tags(&tags, default_category);
    let content = lines.join("\n");

    let mut memory = UnifiedMemory::new_conversation(
        session_id.to_string(),
        category,
        title.trim().to_string(),
        content,
        summary,
    );

    memory.tags = tags;
    memory.metadata.source = MemorySource::AutoExtracted;
    memory.metadata.confidence = 0.4;

    Some(memory)
}

/// 解析元数据（标签和更新时间）
fn parse_metadata(lines: &[String]) -> (Vec<String>, i64) {
    for line in lines {
        let line = line.trim();
        if !line.starts_with("**优先级**:") && !line.starts_with("**标签**:") {
            continue;
        }

        let tags = line
            .split("**标签**:")
            .nth(1)
            .and_then(|part| part.split('|').next())
            .map(|part| {
                part.split(',')
                    .map(|tag| tag.trim().to_string())
                    .filter(|tag| !tag.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let updated_at = line
            .split("**更新时间**:")
            .nth(1)
            .map(str::trim)
            .and_then(parse_timestamp_to_millis)
            .unwrap_or(0);

        return (tags, updated_at);
    }

    (Vec::new(), 0)
}

/// 解析 error_log.json 文件
fn parse_error_entries(session_id: &str, content: &str) -> std::result::Result<Vec<UnifiedMemory>, String> {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct ErrorEntryRecord {
        #[serde(default)]
        id: String,
        #[serde(default)]
        error_description: String,
        #[serde(default)]
        attempted_solutions: Vec<String>,
        #[serde(default)]
        last_failure_at: i64,
        #[serde(default)]
        resolved: bool,
        #[serde(default)]
        resolution: Option<String>,
    }

    let records: Vec<ErrorEntryRecord> = serde_json::from_str(content).map_err(|e| {
        format!("JSON 解析失败: {}", e)
    })?;

    let mut entries = Vec::new();

    for record in records {
        let resolved = record.resolved;
        let tags = vec![
            "error".to_string(),
            if resolved {
                "resolved".to_string()
            } else {
                "unresolved".to_string()
            },
        ];

        let summary = record
            .resolution
            .clone()
            .or_else(|| record.attempted_solutions.last().cloned())
            .unwrap_or_else(|| "暂无解决方案记录".to_string());

        let category = if resolved {
            MemoryCategory::Experience
        } else {
            MemoryCategory::Context
        };

        let title_prefix = if resolved { "已解决错误" } else { "错误" };
        let title = if record.error_description.trim().is_empty() {
            title_prefix.to_string()
        } else {
            format!("{}：{}", title_prefix, truncate_text(&record.error_description, 32))
        };

        let mut memory = UnifiedMemory::new_conversation(
            session_id.to_string(),
            category,
            title,
            format!("错误描述：{}\n\n尝试的解决方案：{}",
                record.error_description,
                record.attempted_solutions.join("\n- ")
            ),
            truncate_text(&summary, 140),
        );

        memory.tags = tags;
        memory.metadata.source = MemorySource::AutoExtracted;
        memory.metadata.confidence = 0.4;
        memory.created_at = record.last_failure_at;
        memory.updated_at = record.last_failure_at;

        entries.push(memory);
    }

    Ok(entries)
}

/// 从标签推断分类
fn infer_category_from_tags(tags: &[String], default_category: MemoryCategory) -> MemoryCategory {
    for tag in tags {
        match tag.to_lowercase().as_str() {
            "identity" | "身份" => return MemoryCategory::Identity,
            "context" | "情境" | "上下文" => return MemoryCategory::Context,
            "preference" | "偏好" => return MemoryCategory::Preference,
            "experience" | "经验" => return MemoryCategory::Experience,
            "activity" | "活动" => return MemoryCategory::Activity,
            _ => {}
        }
    }

    default_category
}

/// 概括文本内容（前 3 行）
fn summarize_lines(lines: &[String]) -> String {
    let summary = lines
        .iter()
        .map(|line| line.trim())
        .filter(|line| {
            !line.is_empty()
                && !line.starts_with("**优先级**:")
                && *line != "---"
                && *line != "----"
        })
        .take(3)
        .collect::<Vec<_>>()
        .join(" ");

    if summary.is_empty() {
        "暂无摘要".to_string()
    } else {
        truncate_text(&summary, 140)
    }
}

/// 截断文本
fn truncate_text(input: &str, max_chars: usize) -> String {
    let mut chars = input.chars();
    let prefix: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{}…", prefix)
    } else {
        prefix
    }
}

/// 解析时间戳为毫秒
fn parse_timestamp_to_millis(value: &str) -> Option<i64> {
    if let Ok(v) = value.parse::<i64>() {
        if v > 1_000_000_000_000 {
            return Some(v);
        }
        return Some(v * 1000);
    }

    None
}

/// 插入统一记忆到数据库
fn insert_unified_memory(db: &Connection, memory: &UnifiedMemory) -> std::result::Result<(), String> {
    let tags_json = serde_json::to_string(&memory.tags).map_err(|e| {
        format!("序列化标签失败: {}", e)
    })?;

    let embedding_blob = memory.metadata.embedding.as_ref().map(|emb| {
        let bytes: Vec<u8> = emb
            .iter()
            .flat_map(|f| f.to_le_bytes())
            .collect();
        bytes
    });

    let sql = String::from("INSERT INTO unified_memory (
            id, session_id, memory_type, category, title, content, summary, tags,
            confidence, importance, access_count, last_accessed_at, source, embedding,
            created_at, updated_at, archived
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)");

    let params: rusqlite::params![
        &memory.id,
        &memory.session_id,
        &serde_json::to_string(&memory.memory_type).unwrap_or_default(),
        &serde_json::to_string(&memory.category).unwrap_or_default(),
        &memory.title,
        &memory.content,
        &memory.summary,
        tags_json,
        memory.metadata.confidence,
        memory.metadata.importance as i64,
        memory.metadata.access_count as i64,
        memory.metadata.last_accessed_at,
        serde_json::to_string(&memory.metadata.source).unwrap_or_default(),
        embedding_blob,
        memory.created_at,
        memory.updated_at,
        memory.archived,
    ];

    let result = db.execute(&sql, params.as_slice());

    if let Err(e) = result {
        return Err(format!("插入记忆失败: {}", e));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_metadata_with_tags() {
        let lines = vec![
            "**优先级**: 5".to_string(),
            "**标签**: work, important, #project".to_string(),
            "**更新时间**: 1704067200000".to_string(),
            "内容行1".to_string(),
        ];

        let (tags, updated_at) = parse_metadata(&lines);

        assert_eq!(tags.len(), 3);
        assert!(tags.contains(&"work".to_string()));
        assert!(tags.contains(&"important".to_string()));
        assert!(tags.contains(&"#project".to_string()));
        assert_eq!(updated_at, 1704067200000);
    }

    #[test]
    fn test_summarize_lines() {
        let lines = vec![
            "**优先级**: 5".to_string(),
            "第一行内容".to_string(),
            "第二行内容".to_string(),
            "第三行内容".to_string(),
            "第四行内容".to_string(),
        ];

        let summary = summarize_lines(&lines);

        assert!(summary.contains("第一行内容"));
        assert!(summary.contains("第二行内容"));
        assert!(summary.contains("第三行内容"));
        assert!(!summary.contains("第四行内容"));
    }

    #[test]
    fn test_truncate_text() {
        let text = "这是一段很长的文本内容，需要被截断处理";
        let result = truncate_text(text, 10);
        assert_eq!(result, "这是一段很长的文本…");

        let short_text = "短文本";
        let result2 = truncate_text(short_text, 20);
        assert_eq!(result2, "短文本");
    }

    #[test]
    fn test_parse_timestamp() {
        // 秒级时间戳
        assert_eq!(parse_timestamp_to_millis("1704067200000"), Some(1704067200000));
        // 秒级时间戳
        assert_eq!(parse_timestamp_to_millis("1704067200"), Some(1704067200000));
        // 无效格式
        assert_eq!(parse_timestamp_to_millis("invalid"), None);
    }
}
