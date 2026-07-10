//! Search Tools Module
//!
//! This module provides search tools including:
//! - GlobTool: Find files using glob patterns
//! - GrepTool: Search file contents using regex patterns
//!
//! Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8

pub(crate) mod glob;
pub(crate) mod grep;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::SystemTime;

// Tool implementation adapters are crate-private staging only.
pub(crate) use glob::GlobTool;
pub(crate) use grep::GrepTool;

/// Maximum number of search results to return by default
pub const DEFAULT_MAX_RESULTS: usize = 100;

/// Maximum number of context lines for grep
pub const DEFAULT_MAX_CONTEXT_LINES: usize = 5;

/// Maximum total output size in bytes
pub const MAX_OUTPUT_SIZE: usize = 100_000;

/// A single search result entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// Path to the matched file
    pub path: PathBuf,

    /// Line number (1-indexed) where match was found (for grep)
    pub line_number: Option<usize>,

    /// The matched line content (for grep)
    pub line_content: Option<String>,

    /// Context lines before the match
    pub context_before: Vec<String>,

    /// Context lines after the match
    pub context_after: Vec<String>,

    /// File modification time (for glob)
    pub mtime: Option<SystemTime>,

    /// File size in bytes (for glob)
    pub size: Option<u64>,

    /// Match count (for count mode)
    pub match_count: Option<usize>,
}

impl SearchResult {
    /// Create a new SearchResult for a file match (glob)
    pub fn file_match(path: PathBuf) -> Self {
        Self {
            path,
            line_number: None,
            line_content: None,
            context_before: Vec::new(),
            context_after: Vec::new(),
            mtime: None,
            size: None,
            match_count: None,
        }
    }

    /// Create a new SearchResult for a content match (grep)
    pub fn content_match(path: PathBuf, line_number: usize, line_content: String) -> Self {
        Self {
            path,
            line_number: Some(line_number),
            line_content: Some(line_content),
            context_before: Vec::new(),
            context_after: Vec::new(),
            mtime: None,
            size: None,
            match_count: None,
        }
    }

    /// Create a new SearchResult for count mode
    pub fn count_match(path: PathBuf, count: usize) -> Self {
        Self {
            path,
            line_number: None,
            line_content: None,
            context_before: Vec::new(),
            context_after: Vec::new(),
            mtime: None,
            size: None,
            match_count: Some(count),
        }
    }

    /// Set file metadata
    pub fn with_metadata(mut self, mtime: SystemTime, size: u64) -> Self {
        self.mtime = Some(mtime);
        self.size = Some(size);
        self
    }

    /// Set context lines
    pub fn with_context(mut self, before: Vec<String>, after: Vec<String>) -> Self {
        self.context_before = before;
        self.context_after = after;
        self
    }
}

/// Format search results for output
pub fn format_search_results(results: &[SearchResult], truncated: bool) -> String {
    let mut output = String::new();

    for result in results {
        if let Some(line_number) = result.line_number {
            // Grep-style output
            output.push_str(&format!(
                "{}:{}:{}\n",
                result.path.display(),
                line_number,
                result.line_content.as_deref().unwrap_or("")
            ));
        } else if let Some(count) = result.match_count {
            // Count mode output
            output.push_str(&format!("{}:{}\n", result.path.display(), count));
        } else {
            // Glob-style output (just the path)
            output.push_str(&format!("{}\n", result.path.display()));
        }
    }

    if truncated {
        output.push_str(&format!(
            "\n[Results truncated. Showing {} of more results.]\n",
            results.len()
        ));
    }

    output
}

/// Truncate results to fit within size limit
pub fn truncate_results(
    results: Vec<SearchResult>,
    max_results: usize,
) -> (Vec<SearchResult>, bool) {
    if results.len() > max_results {
        (results.into_iter().take(max_results).collect(), true)
    } else {
        (results, false)
    }
}
