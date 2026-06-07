//! Runtime evidence 路径解析工具。
//!
//! 保持 workspace-relative artifact path 的平台无关解析，避免上层散落拼接。

use std::path::{Path, PathBuf};

pub(crate) fn resolve_workspace_path(workspace_root: &Path, path: &str) -> PathBuf {
    let candidate = Path::new(path);
    if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        workspace_root.join(path.replace('/', std::path::MAIN_SEPARATOR_STR))
    }
}
