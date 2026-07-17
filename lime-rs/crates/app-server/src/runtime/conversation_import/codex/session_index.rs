use app_server_protocol::{
    ConversationImportSourceClient, ConversationImportThreadStatus, ImportedThreadSummary,
};
use serde::Deserialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Deserialize)]
struct SessionIndexLine {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    thread_name: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    path: Option<String>,
}

pub(super) fn scan(source_root: &Path) -> Vec<ImportedThreadSummary> {
    let path = source_root.join("session_index.jsonl");
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return Vec::new(),
    };
    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<SessionIndexLine>(&line).ok())
        .filter_map(|line| {
            let id = super::normalize_filter(line.id.as_deref())?;
            Some(ImportedThreadSummary {
                source_client: ConversationImportSourceClient::Codex,
                source_thread_id: id,
                title: super::normalize_filter(line.title.as_deref())
                    .or_else(|| super::normalize_filter(line.thread_name.as_deref())),
                created_at: line.created_at,
                updated_at: line.updated_at,
                cwd: super::normalize_filter(line.cwd.as_deref()),
                source: Some("session_index".to_string()),
                model_provider: None,
                archived: false,
                source_path: super::normalize_filter(line.path.as_deref()),
                import_job_id: None,
                import_status: ConversationImportThreadStatus::NotImported,
                metadata: None,
            })
        })
        .collect()
}
