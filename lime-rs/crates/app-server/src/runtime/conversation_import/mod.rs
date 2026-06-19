use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::{
    ConversationImportSourceClient, ConversationImportSourceScanParams,
    ConversationImportSourceScanResponse, ConversationImportSourceStatus,
    ConversationImportSourceSummary, ConversationImportThreadCommitParams,
    ConversationImportThreadCommitResponse, ConversationImportThreadPreviewParams,
    ConversationImportThreadPreviewResponse, ConversationImportThreadRuntimeEventsReadParams,
    ConversationImportThreadRuntimeEventsReadResponse,
};

mod codex;
mod commit;
mod commit_events;
mod import_status;
mod provenance;
mod runtime_event_detail;

impl RuntimeCore {
    pub async fn scan_conversation_import_source(
        &self,
        params: ConversationImportSourceScanParams,
    ) -> Result<ConversationImportSourceScanResponse, RuntimeCoreError> {
        let mut response = scan_conversation_import_source(params)?;
        import_status::apply_scan_import_status(self, &mut response);
        Ok(response)
    }

    pub async fn preview_conversation_import_thread(
        &self,
        params: ConversationImportThreadPreviewParams,
    ) -> Result<ConversationImportThreadPreviewResponse, RuntimeCoreError> {
        let mut response = preview_conversation_import_thread(params)?;
        import_status::apply_preview_import_status(self, &mut response);
        Ok(response)
    }

    pub async fn commit_conversation_import_thread(
        &self,
        params: ConversationImportThreadCommitParams,
    ) -> Result<ConversationImportThreadCommitResponse, RuntimeCoreError> {
        commit::commit_conversation_import_thread(self, params)
    }

    pub async fn read_conversation_import_runtime_events(
        &self,
        params: ConversationImportThreadRuntimeEventsReadParams,
    ) -> Result<ConversationImportThreadRuntimeEventsReadResponse, RuntimeCoreError> {
        runtime_event_detail::read_conversation_import_runtime_events(self, params).await
    }
}

fn scan_conversation_import_source(
    params: ConversationImportSourceScanParams,
) -> Result<ConversationImportSourceScanResponse, RuntimeCoreError> {
    match params
        .source_client
        .unwrap_or(ConversationImportSourceClient::Codex)
    {
        ConversationImportSourceClient::Codex => codex::scan_source(params),
        ConversationImportSourceClient::ClaudeCode => Ok(unsupported_source(
            ConversationImportSourceClient::ClaudeCode,
            params.source_root,
            "Claude Code conversation import is not implemented in this milestone.",
        )),
    }
}

fn preview_conversation_import_thread(
    params: ConversationImportThreadPreviewParams,
) -> Result<ConversationImportThreadPreviewResponse, RuntimeCoreError> {
    match params
        .source_client
        .unwrap_or(ConversationImportSourceClient::Codex)
    {
        ConversationImportSourceClient::Codex => codex::preview_thread(params),
        ConversationImportSourceClient::ClaudeCode => Err(RuntimeCoreError::Backend(
            "Claude Code conversation preview is not implemented in this milestone.".to_string(),
        )),
    }
}

fn unsupported_source(
    source_client: ConversationImportSourceClient,
    source_root: Option<String>,
    message: &str,
) -> ConversationImportSourceScanResponse {
    ConversationImportSourceScanResponse {
        source: ConversationImportSourceSummary {
            source_client,
            status: ConversationImportSourceStatus::Unsupported,
            source_root,
            readable: false,
            thread_count: 0,
            source_home_exists: false,
            state_db_readable: false,
            rollout_file_count: 0,
            indexed_at: Some(codex::now_timestamp()),
            state_path: None,
            message: Some(message.to_string()),
        },
        threads: Vec::new(),
        next_cursor: None,
    }
}

#[cfg(test)]
mod tests;
