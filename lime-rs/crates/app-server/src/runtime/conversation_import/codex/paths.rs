use std::fs;
use std::path::{Path, PathBuf};

const SESSIONS_SUBDIR: &str = "sessions";
const ARCHIVED_SESSIONS_SUBDIR: &str = "archived_sessions";

pub(super) fn resolve_existing_source_path(
    source_root: &Path,
    source_path: Option<&str>,
) -> Option<PathBuf> {
    let source_path = super::normalize_filter(source_path)?;
    let path = PathBuf::from(source_path);
    let path = if path.is_absolute() {
        path
    } else {
        source_root.join(path)
    };
    existing_rollout_path(&path)
}

pub(super) fn find_rollout_path_by_thread_id(
    source_root: &Path,
    thread_id: &str,
    archived: bool,
) -> Option<PathBuf> {
    let subdir = if archived {
        ARCHIVED_SESSIONS_SUBDIR
    } else {
        SESSIONS_SUBDIR
    };
    find_rollout_path_in_subdir(source_root, subdir, thread_id)
}

fn find_rollout_path_in_subdir(
    source_root: &Path,
    subdir: &str,
    thread_id: &str,
) -> Option<PathBuf> {
    let root = source_root.join(subdir);
    if !root.is_dir() {
        return None;
    }

    let mut stack = vec![root];
    while let Some(dir) = stack.pop() {
        let read_dir = fs::read_dir(&dir).ok()?;
        for entry in read_dir.filter_map(Result::ok) {
            let path = entry.path();
            let file_type = entry.file_type().ok()?;
            if file_type.is_dir() {
                stack.push(path);
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            let Some(file_name) = plain_rollout_file_name(&path) else {
                continue;
            };
            if rollout_file_name_matches_thread(file_name.as_str(), thread_id) {
                return existing_rollout_path(&path);
            }
        }
    }
    None
}

fn existing_rollout_path(path: &Path) -> Option<PathBuf> {
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    let compressed = compressed_rollout_path(path);
    compressed.is_file().then_some(compressed)
}

fn compressed_rollout_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".zst");
    PathBuf::from(value)
}

fn plain_rollout_file_name(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    if let Some(plain) = name.strip_suffix(".zst") {
        return is_rollout_jsonl_name(plain).then(|| plain.to_string());
    }
    is_rollout_jsonl_name(name).then(|| name.to_string())
}

fn is_rollout_jsonl_name(name: &str) -> bool {
    name.starts_with("rollout-") && name.ends_with(".jsonl")
}

fn rollout_file_name_matches_thread(name: &str, thread_id: &str) -> bool {
    name.strip_suffix(".jsonl")
        .is_some_and(|stem| stem.ends_with(thread_id))
}
