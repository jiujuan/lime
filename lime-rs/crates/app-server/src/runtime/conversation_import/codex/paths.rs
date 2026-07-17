use std::fs;
use std::path::{Path, PathBuf};

const SESSIONS_SUBDIR: &str = "sessions";
const ARCHIVED_SESSIONS_SUBDIR: &str = "archived_sessions";
const SENSITIVE_SOURCE_FILE_NAMES: &[&str] = &[
    "auth.json",
    "config.json",
    "config.toml",
    "credentials.json",
    "credential.json",
    "secrets.json",
    "secret.json",
    "tokens.json",
    "token.json",
];

pub(super) fn resolve_user_supplied_rollout_path(
    source_root: &Path,
    source_path: &str,
) -> Option<PathBuf> {
    let source_path = super::normalize_filter(Some(source_path))?;
    let path = PathBuf::from(source_path);
    let path = if path.is_absolute() {
        path
    } else {
        source_root.join(path)
    };
    existing_allowed_rollout_path(source_root, &path)
}

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
    existing_allowed_rollout_path(source_root, &path)
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

pub(super) fn count_rollout_files(source_root: &Path) -> usize {
    count_rollout_files_in_subdir(source_root, SESSIONS_SUBDIR)
        + count_rollout_files_in_subdir(source_root, ARCHIVED_SESSIONS_SUBDIR)
}

pub(super) fn discover_rollout_paths(source_root: &Path) -> Vec<(PathBuf, bool)> {
    let mut paths = Vec::new();
    collect_rollout_paths_in_subdir(source_root, SESSIONS_SUBDIR, false, &mut paths);
    collect_rollout_paths_in_subdir(source_root, ARCHIVED_SESSIONS_SUBDIR, true, &mut paths);
    paths
}

pub(super) fn rollout_thread_id(path: &Path) -> Option<String> {
    plain_rollout_file_name(path).and_then(|name| {
        name.strip_suffix(".jsonl")
            .and_then(|stem| stem.strip_prefix("rollout-"))
            .map(ToString::to_string)
    })
}

fn count_rollout_files_in_subdir(source_root: &Path, subdir: &str) -> usize {
    let root = source_root.join(subdir);
    if !root.is_dir() {
        return 0;
    }

    let mut count = 0;
    let mut stack = vec![root];
    while let Some(dir) = stack.pop() {
        let Ok(read_dir) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in read_dir.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push(path);
            } else if file_type.is_file() && plain_rollout_file_name(&path).is_some() {
                count += 1;
            }
        }
    }
    count
}

fn collect_rollout_paths_in_subdir(
    source_root: &Path,
    subdir: &str,
    archived: bool,
    paths: &mut Vec<(PathBuf, bool)>,
) {
    let root = source_root.join(subdir);
    if !root.is_dir() {
        return;
    }

    let mut stack = vec![root];
    while let Some(dir) = stack.pop() {
        let Ok(read_dir) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in read_dir.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push(path);
            } else if file_type.is_file()
                && plain_rollout_file_name(&path).is_some()
                && existing_allowed_rollout_path(source_root, &path).is_some()
            {
                paths.push((path, archived));
            }
        }
    }
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
                return existing_allowed_rollout_path(source_root, &path);
            }
        }
    }
    None
}

fn existing_allowed_rollout_path(source_root: &Path, path: &Path) -> Option<PathBuf> {
    let path = existing_rollout_path(path)?;
    is_allowed_rollout_path(source_root, &path).then_some(path)
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

fn is_allowed_rollout_path(source_root: &Path, path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    let lower_name = file_name.to_ascii_lowercase();
    if SENSITIVE_SOURCE_FILE_NAMES.contains(&lower_name.as_str()) {
        return false;
    }
    if plain_rollout_file_name(path).is_none() {
        return false;
    }

    let Ok(canonical_root) = source_root.canonicalize() else {
        return false;
    };
    let Ok(canonical_path) = path.canonicalize() else {
        return false;
    };
    canonical_path.starts_with(canonical_root)
}
