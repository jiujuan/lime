//! File Tools Module
//!
//! This module provides the vendored Aster read tool kept for the temporary
//! reply loop. File mutation is owned by Lime `apply_patch`.
//!
//! Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10

pub(crate) mod read;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use std::sync::RwLock;

pub(crate) use read::ReadTool;

/// Record of a file read operation
///
/// Tracks when a file was read and its content hash at that time.
///
/// Requirements: 4.5
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileReadRecord {
    /// Path to the file that was read
    pub path: PathBuf,

    /// Timestamp when the file was read
    pub read_at: SystemTime,

    /// Hash of the file content when read (for change detection)
    pub content_hash: String,

    /// File modification time when read
    pub mtime: Option<SystemTime>,

    /// File size when read
    pub size: u64,

    /// Number of lines in the file (for text files)
    pub line_count: Option<usize>,
}

impl FileReadRecord {
    /// Create a new FileReadRecord
    pub fn new(path: PathBuf, content_hash: String, size: u64) -> Self {
        Self {
            path,
            read_at: SystemTime::now(),
            content_hash,
            mtime: None,
            size,
            line_count: None,
        }
    }

    /// Set the modification time
    pub fn with_mtime(mut self, mtime: SystemTime) -> Self {
        self.mtime = Some(mtime);
        self
    }

    /// Set the line count
    pub fn with_line_count(mut self, line_count: usize) -> Self {
        self.line_count = Some(line_count);
        self
    }

    /// Check if the file has been modified since it was read
    pub fn is_modified(&self, current_mtime: SystemTime) -> bool {
        match self.mtime {
            Some(recorded_mtime) => current_mtime != recorded_mtime,
            None => false, // Can't determine, assume not modified
        }
    }
}

/// File read history tracker
///
/// Maintains a history of file read operations for validation.
/// Kept while the vendored ReadTool remains in the temporary reply loop.
///
/// Requirements: 4.5
#[derive(Debug, Default)]
pub struct FileReadHistory {
    /// Map of file paths to their read records
    records: HashMap<PathBuf, FileReadRecord>,
}

impl FileReadHistory {
    /// Create a new empty FileReadHistory
    pub fn new() -> Self {
        Self {
            records: HashMap::new(),
        }
    }

    /// Record a file read operation
    pub fn record_read(&mut self, record: FileReadRecord) {
        let path = record.path.clone();
        self.records.insert(path, record);
    }

    /// Check if a file has been read
    pub fn has_read(&self, path: &PathBuf) -> bool {
        self.records.contains_key(path)
    }

    /// Get the read record for a file
    pub fn get_record(&self, path: &PathBuf) -> Option<&FileReadRecord> {
        self.records.get(path)
    }

    /// Remove a read record (e.g., after successful write)
    pub fn remove_record(&mut self, path: &PathBuf) -> Option<FileReadRecord> {
        self.records.remove(path)
    }

    /// Clear all read records
    pub fn clear(&mut self) {
        self.records.clear();
    }

    /// Get the number of tracked files
    pub fn len(&self) -> usize {
        self.records.len()
    }

    /// Check if the history is empty
    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }

    /// Get all tracked file paths
    pub fn tracked_files(&self) -> Vec<&PathBuf> {
        self.records.keys().collect()
    }

    /// Check if a file has been modified since it was read
    ///
    /// Returns:
    /// - Some(true) if the file has been modified
    /// - Some(false) if the file has not been modified
    /// - None if the file has not been read or mtime is not available
    pub fn is_file_modified(&self, path: &PathBuf, current_mtime: SystemTime) -> Option<bool> {
        self.records
            .get(path)
            .map(|record| record.is_modified(current_mtime))
    }
}

/// Shared file read history for use across tools
pub(crate) type SharedFileReadHistory = Arc<RwLock<FileReadHistory>>;

/// Create a new shared file read history
pub(crate) fn create_shared_history() -> SharedFileReadHistory {
    Arc::new(RwLock::new(FileReadHistory::new()))
}

/// Compute a hash of file content for change detection
pub fn compute_content_hash(content: &[u8]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
