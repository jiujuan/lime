use super::*;

fn backend(temp: &tempfile::TempDir) -> LocalMemoryBackend {
    LocalMemoryBackend::new(temp.path().join("data"))
}

fn global_root() -> MemoryStoreRootParams {
    MemoryStoreRootParams {
        scope: MemoryStoreScope::Global,
        workspace_root: None,
    }
}

#[tokio::test]
async fn list_initializes_stable_layout() {
    let temp = tempfile::tempdir().expect("tempdir");
    let backend = backend(&temp);

    let response = backend
        .list(MemoryStoreListParams {
            root: global_root(),
            ..Default::default()
        })
        .await
        .expect("list");

    let paths = response
        .entries
        .iter()
        .map(|entry| entry.path.as_str())
        .collect::<Vec<_>>();
    assert!(paths.contains(&MEMORY_FILE));
    assert!(paths.contains(&SUMMARY_FILE));
    assert!(paths.contains(&"extensions"));
    assert!(paths.contains(&"rollout_summaries"));
    assert!(response
        .entries
        .iter()
        .all(|entry| !entry.path.starts_with('/')));
}

#[tokio::test]
async fn read_rejects_traversal_and_hidden_path() {
    let temp = tempfile::tempdir().expect("tempdir");
    let backend = backend(&temp);

    let traversal = backend
        .read(MemoryStoreReadParams {
            root: global_root(),
            path: "../secret.md".to_string(),
            ..Default::default()
        })
        .await;
    assert!(traversal.is_err());

    let hidden = backend
        .read(MemoryStoreReadParams {
            root: global_root(),
            path: ".hidden/secret.md".to_string(),
            ..Default::default()
        })
        .await;
    assert!(hidden.is_err());
}

#[tokio::test]
async fn add_note_only_writes_ad_hoc_note() {
    let temp = tempfile::tempdir().expect("tempdir");
    let backend = backend(&temp);
    let response = backend
        .add_note(MemoryStoreAddNoteParams {
            root: global_root(),
            title: Some("Remember Context".to_string()),
            slug: Some("Remember Context".to_string()),
            content: "Prefer file-backed memory.".to_string(),
        })
        .await
        .expect("add note");

    assert!(response.path.starts_with("extensions/ad_hoc/notes/"));
    assert!(response.path.ends_with(".md"));
    let read = backend
        .read(MemoryStoreReadParams {
            root: global_root(),
            path: response.path,
            ..Default::default()
        })
        .await
        .expect("read note");
    assert!(read.content.contains("Prefer file-backed memory."));
    assert!(!read.path.starts_with('/'));
}

#[tokio::test]
async fn search_skips_non_utf8_files_and_returns_citations() {
    let temp = tempfile::tempdir().expect("tempdir");
    let backend = backend(&temp);
    backend
        .list(MemoryStoreListParams {
            root: global_root(),
            ..Default::default()
        })
        .await
        .expect("init");
    let root = temp.path().join("data").join(MEMORY_ROOT_DIR);
    fs::write(root.join(MEMORY_FILE), "Alpha memory\nBeta detail\n").expect("write memory");
    fs::write(root.join("binary.bin"), [0xff, 0xfe, 0xfd]).expect("write binary");

    let response = backend
        .search(MemoryStoreSearchParams {
            root: global_root(),
            queries: vec!["beta".to_string()],
            ..Default::default()
        })
        .await
        .expect("search");

    assert_eq!(response.hits.len(), 1);
    assert_eq!(response.hits[0].path, MEMORY_FILE);
    assert_eq!(response.hits[0].match_line_number, 2);
    assert_eq!(response.hits[0].citation.start_line_number, 2);
}

#[tokio::test]
async fn health_initializes_layout_and_reports_store_stats() {
    let temp = tempfile::tempdir().expect("tempdir");
    let backend = backend(&temp);
    let root = temp.path().join("data").join(MEMORY_ROOT_DIR);

    let response = backend
        .health(global_root())
        .await
        .expect("memory store health");

    assert_eq!(response.root_scope, MemoryStoreScope::Global);
    assert_eq!(response.root_path, root.to_string_lossy());
    assert!(response.initialized);
    assert!(response.summary_exists);
    assert!(response.memory_exists);
    assert_eq!(response.notes_count, 0);
    assert!(root.join(SUMMARY_FILE).is_file());
    assert!(root.join(MEMORY_FILE).is_file());
    assert!(root.join(NOTES_DIR).is_dir());
}

#[tokio::test]
async fn reset_clears_store_contents_preserves_layout_and_soul_boundary() {
    let temp = tempfile::tempdir().expect("tempdir");
    let backend = backend(&temp);
    let outside_file = temp.path().join("data").join("memory.soul.json");
    fs::create_dir_all(outside_file.parent().expect("outside parent")).expect("outside parent");
    fs::write(&outside_file, "soul config").expect("outside soul");
    let note = backend
        .add_note(MemoryStoreAddNoteParams {
            root: global_root(),
            title: Some("Reset note".to_string()),
            slug: Some("reset-note".to_string()),
            content: "Remove this note only from the file store.".to_string(),
        })
        .await
        .expect("add note");
    let root = temp.path().join("data").join(MEMORY_ROOT_DIR);
    fs::write(root.join(SUMMARY_FILE), "summary content").expect("summary");
    fs::write(root.join(INDEX_DIR).join("scratch.json"), "{}").expect("index");

    let response = backend
        .reset(MemoryStoreResetParams {
            root: global_root(),
        })
        .await
        .expect("reset");

    assert_eq!(response.root_scope, MemoryStoreScope::Global);
    assert_eq!(response.root_path, root.to_string_lossy());
    assert!(response.removed_files >= 4);
    assert!(response.removed_directories >= 4);
    assert!(response.preserved_soul);
    assert!(outside_file.is_file());
    assert!(root.join(SUMMARY_FILE).is_file());
    assert!(root.join(MEMORY_FILE).is_file());
    assert!(root.join(NOTES_DIR).is_dir());
    assert!(!root.join(note.path).exists());
    assert_eq!(
        fs::read_to_string(root.join(SUMMARY_FILE)).expect("empty summary"),
        ""
    );
}

#[tokio::test]
async fn list_and_search_skip_symlinks() {
    let temp = tempfile::tempdir().expect("tempdir");
    let backend = backend(&temp);
    backend
        .list(MemoryStoreListParams {
            root: global_root(),
            ..Default::default()
        })
        .await
        .expect("init");
    let root = temp.path().join("data").join(MEMORY_ROOT_DIR);
    let target = root.join("target.md");
    fs::write(&target, "target memory").expect("write target");
    let link = root.join("link.md");
    if !create_symlink(&target, &link) {
        return;
    }

    let list = backend
        .list(MemoryStoreListParams {
            root: global_root(),
            ..Default::default()
        })
        .await
        .expect("list");
    assert!(list.entries.iter().any(|entry| entry.path == "target.md"));
    assert!(!list.entries.iter().any(|entry| entry.path == "link.md"));

    let search = backend
        .search(MemoryStoreSearchParams {
            root: global_root(),
            queries: vec!["target".to_string()],
            ..Default::default()
        })
        .await
        .expect("search");
    assert!(search.hits.iter().any(|hit| hit.path == "target.md"));
    assert!(!search.hits.iter().any(|hit| hit.path == "link.md"));
}

#[cfg(unix)]
fn create_symlink(target: &Path, link: &Path) -> bool {
    std::os::unix::fs::symlink(target, link).is_ok()
}

#[cfg(windows)]
fn create_symlink(target: &Path, link: &Path) -> bool {
    std::os::windows::fs::symlink_file(target, link).is_ok()
}
