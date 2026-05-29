//! 文件改动摘要
//!
//! 在工具执行层（同时握有新旧内容处）计算行级 diff，产出跨模型一致的
//! 结构化 `file_change` 摘要：改动类型、增删行数、精简 unified diff。
//!
//! 设计参考：
//! - codex `tui/src/diff_model.rs` 的 `FileChange::{Add,Delete,Update}`；
//! - warp `agent/action_result` 的 `lines_added/lines_removed + diff` 字段。
//!
//! 这里只负责"算"，不负责渲染。前端按 metadata 中的 `file_change` 直接呈现。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 单个 unified diff 行的类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffLineKind {
    /// 上下文行（未改动）
    Context,
    /// 新增行
    Add,
    /// 删除行
    Remove,
}

/// 文件改动类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileChangeKind {
    /// 新建文件
    Add,
    /// 修改文件
    Update,
    /// 删除文件
    Delete,
}

/// 单行 diff
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub value: String,
}

/// 文件改动摘要 —— 跨模型一致的工具结果 metadata 载荷
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileChangeSummary {
    /// 文件路径（展示用，通常是 resolve 后的绝对路径）
    pub path: String,
    /// 改动类型
    pub kind: FileChangeKind,
    /// 新增行数
    pub lines_added: usize,
    /// 删除行数
    pub lines_removed: usize,
    /// 精简后的逐行 diff（大文件会被截断）
    pub diff: Vec<DiffLine>,
    /// diff 是否因体积过大被截断
    #[serde(default)]
    pub truncated: bool,
}

/// 单个 diff 最多保留的行数，超过则截断（仅保留统计）。
const MAX_DIFF_LINES: usize = 400;

fn split_lines(content: &str) -> Vec<&str> {
    if content.is_empty() {
        return Vec::new();
    }
    // 归一化 CRLF，再按 \n 切；不保留行尾换行符
    content.split('\n').collect()
}

/// 计算两段文本的行级 diff（LCS），返回逐行结果。
///
/// 与前端 `utils/canvasWorkbenchDiff.ts` 的算法一致，保证前后端 diff 行为对齐。
pub fn compute_line_diff(previous: &str, current: &str) -> Vec<DiffLine> {
    let previous_normalized = previous.replace("\r\n", "\n");
    let current_normalized = current.replace("\r\n", "\n");
    let prev_lines = split_lines(&previous_normalized);
    let cur_lines = split_lines(&current_normalized);
    let row_count = prev_lines.len();
    let col_count = cur_lines.len();

    // lcs[i][j] = prev[i..] 与 cur[j..] 的最长公共子序列长度
    let mut lcs = vec![vec![0usize; col_count + 1]; row_count + 1];
    for row in (0..row_count).rev() {
        for col in (0..col_count).rev() {
            if prev_lines[row] == cur_lines[col] {
                lcs[row][col] = lcs[row + 1][col + 1] + 1;
            } else {
                lcs[row][col] = lcs[row + 1][col].max(lcs[row][col + 1]);
            }
        }
    }

    let mut diff = Vec::new();
    let mut row = 0usize;
    let mut col = 0usize;

    while row < row_count && col < col_count {
        if prev_lines[row] == cur_lines[col] {
            diff.push(DiffLine {
                kind: DiffLineKind::Context,
                value: prev_lines[row].to_string(),
            });
            row += 1;
            col += 1;
        } else if lcs[row + 1][col] >= lcs[row][col + 1] {
            diff.push(DiffLine {
                kind: DiffLineKind::Remove,
                value: prev_lines[row].to_string(),
            });
            row += 1;
        } else {
            diff.push(DiffLine {
                kind: DiffLineKind::Add,
                value: cur_lines[col].to_string(),
            });
            col += 1;
        }
    }

    while row < row_count {
        diff.push(DiffLine {
            kind: DiffLineKind::Remove,
            value: prev_lines[row].to_string(),
        });
        row += 1;
    }

    while col < col_count {
        diff.push(DiffLine {
            kind: DiffLineKind::Add,
            value: cur_lines[col].to_string(),
        });
        col += 1;
    }

    diff
}

fn count_added_removed(diff: &[DiffLine]) -> (usize, usize) {
    let added = diff
        .iter()
        .filter(|line| line.kind == DiffLineKind::Add)
        .count();
    let removed = diff
        .iter()
        .filter(|line| line.kind == DiffLineKind::Remove)
        .count();
    (added, removed)
}

/// 由新旧内容构建文件改动摘要。
///
/// - `previous` 为 `None` 表示文件此前不存在（新建）。
/// - `previous == current` 时仍按 update 处理（增删均为 0）。
pub fn build_summary(
    path: impl Into<String>,
    previous: Option<&str>,
    current: &str,
) -> FileChangeSummary {
    let path = path.into();
    match previous {
        None => {
            let diff = compute_line_diff("", current);
            let (lines_added, _) = count_added_removed(&diff);
            finalize(path, FileChangeKind::Add, diff, lines_added, 0)
        }
        Some(prev) => {
            let diff = compute_line_diff(prev, current);
            let (lines_added, lines_removed) = count_added_removed(&diff);
            finalize(
                path,
                FileChangeKind::Update,
                diff,
                lines_added,
                lines_removed,
            )
        }
    }
}

/// 文件删除场景的摘要。
pub fn build_delete_summary(path: impl Into<String>, previous: &str) -> FileChangeSummary {
    let diff = compute_line_diff(previous, "");
    let (_, lines_removed) = count_added_removed(&diff);
    finalize(path.into(), FileChangeKind::Delete, diff, 0, lines_removed)
}

fn finalize(
    path: String,
    kind: FileChangeKind,
    diff: Vec<DiffLine>,
    lines_added: usize,
    lines_removed: usize,
) -> FileChangeSummary {
    let truncated = diff.len() > MAX_DIFF_LINES;
    let diff = if truncated {
        diff.into_iter().take(MAX_DIFF_LINES).collect()
    } else {
        diff
    };
    FileChangeSummary {
        path,
        kind,
        lines_added,
        lines_removed,
        diff,
        truncated,
    }
}

impl FileChangeSummary {
    /// 序列化为工具结果 metadata 里的 `file_change` 值。
    pub fn to_metadata_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_file_counts_all_lines_as_added() {
        let summary = build_summary("/tmp/a.txt", None, "line1\nline2\nline3");
        assert_eq!(summary.kind, FileChangeKind::Add);
        assert_eq!(summary.lines_added, 3);
        assert_eq!(summary.lines_removed, 0);
        assert!(!summary.truncated);
    }

    #[test]
    fn test_empty_new_file_has_no_lines() {
        let summary = build_summary("/tmp/empty.txt", None, "");
        assert_eq!(summary.kind, FileChangeKind::Add);
        assert_eq!(summary.lines_added, 0);
        assert_eq!(summary.lines_removed, 0);
    }

    #[test]
    fn test_update_counts_added_and_removed() {
        let previous = "alpha\nbeta\ngamma";
        let current = "alpha\nBETA\ngamma\ndelta";
        let summary = build_summary("/tmp/b.txt", Some(previous), current);
        assert_eq!(summary.kind, FileChangeKind::Update);
        // beta -> BETA 是一删一增，delta 是一增
        assert_eq!(summary.lines_added, 2);
        assert_eq!(summary.lines_removed, 1);
    }

    #[test]
    fn test_identical_update_is_noop() {
        let summary = build_summary("/tmp/c.txt", Some("same\ncontent"), "same\ncontent");
        assert_eq!(summary.kind, FileChangeKind::Update);
        assert_eq!(summary.lines_added, 0);
        assert_eq!(summary.lines_removed, 0);
        assert!(summary.diff.iter().all(|l| l.kind == DiffLineKind::Context));
    }

    #[test]
    fn test_crlf_normalized() {
        let summary = build_summary("/tmp/d.txt", Some("a\r\nb"), "a\r\nb\r\nc");
        assert_eq!(summary.lines_added, 1);
        assert_eq!(summary.lines_removed, 0);
    }

    #[test]
    fn test_delete_counts_all_as_removed() {
        let summary = build_delete_summary("/tmp/e.txt", "x\ny\nz");
        assert_eq!(summary.kind, FileChangeKind::Delete);
        assert_eq!(summary.lines_added, 0);
        assert_eq!(summary.lines_removed, 3);
    }

    #[test]
    fn test_large_diff_truncated() {
        let current: String = (0..(MAX_DIFF_LINES + 50))
            .map(|i| format!("line{i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let summary = build_summary("/tmp/big.txt", None, &current);
        assert!(summary.truncated);
        assert_eq!(summary.diff.len(), MAX_DIFF_LINES);
        // 统计仍基于完整 diff
        assert_eq!(summary.lines_added, MAX_DIFF_LINES + 50);
    }

    #[test]
    fn test_metadata_value_roundtrip() {
        let summary = build_summary("/tmp/f.txt", None, "hello");
        let value = summary.to_metadata_value();
        assert_eq!(value["kind"], "add");
        assert_eq!(value["path"], "/tmp/f.txt");
        assert_eq!(value["lines_added"], 1);
        let restored: FileChangeSummary = serde_json::from_value(value).unwrap();
        assert_eq!(restored, summary);
    }
}
