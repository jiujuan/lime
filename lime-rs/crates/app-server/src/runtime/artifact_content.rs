use super::ArtifactContentProvider;
use super::ArtifactContentRequest;
use std::fs;
use std::io::Read;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;

pub const DEFAULT_ARTIFACT_CONTENT_MAX_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Default)]
pub struct InlineArtifactContentProvider;

impl ArtifactContentProvider for InlineArtifactContentProvider {
    fn read_content(&self, request: &ArtifactContentRequest) -> Option<String> {
        request.artifact.content.clone()
    }
}

#[derive(Debug, Clone)]
pub struct FilesystemArtifactContentProvider {
    root: PathBuf,
    max_bytes: u64,
}

impl FilesystemArtifactContentProvider {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            max_bytes: DEFAULT_ARTIFACT_CONTENT_MAX_BYTES,
        }
    }

    pub fn with_max_bytes(mut self, max_bytes: u64) -> Self {
        self.max_bytes = max_bytes;
        self
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn max_bytes(&self) -> u64 {
        self.max_bytes
    }
}

impl ArtifactContentProvider for FilesystemArtifactContentProvider {
    fn read_content(&self, request: &ArtifactContentRequest) -> Option<String> {
        request
            .artifact
            .path
            .as_deref()
            .and_then(|path| read_limited_relative_utf8_file(&self.root, path, self.max_bytes))
            .or_else(|| request.artifact.content.clone())
    }
}

fn read_limited_relative_utf8_file(
    root: &Path,
    relative_path: &str,
    max_bytes: u64,
) -> Option<String> {
    if max_bytes == 0 {
        return None;
    }
    let relative = Path::new(relative_path);
    if relative.is_absolute() || !is_safe_relative_path(relative) {
        return None;
    }

    let root = root.canonicalize().ok()?;
    let path = root.join(relative);
    let canonical_path = path.canonicalize().ok()?;
    if !canonical_path.starts_with(&root) {
        return None;
    }

    let metadata = fs::metadata(&canonical_path).ok()?;
    if !metadata.is_file() || metadata.len() > max_bytes {
        return None;
    }

    let mut file = fs::File::open(canonical_path).ok()?;
    let capacity = usize::try_from(metadata.len()).ok()?;
    let mut buffer = Vec::with_capacity(capacity);
    file.by_ref()
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut buffer)
        .ok()?;
    if u64::try_from(buffer.len()).ok()? > max_bytes {
        return None;
    }

    String::from_utf8(buffer).ok()
}

fn is_safe_relative_path(path: &Path) -> bool {
    path.components()
        .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}
