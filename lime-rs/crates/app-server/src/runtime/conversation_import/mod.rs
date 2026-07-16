use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::{
    ConversationImportSourceScanParams, ConversationImportSourceScanResponse,
    ConversationImportThreadCommitParams,
    ConversationImportThreadCommitResponse, ConversationImportThreadPreviewParams,
    ConversationImportThreadPreviewResponse,
};

mod codex;
mod commit;
mod import_status;
mod provenance;

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
}

fn scan_conversation_import_source(
    params: ConversationImportSourceScanParams,
) -> Result<ConversationImportSourceScanResponse, RuntimeCoreError> {
    codex::scan_source(params)
}

fn preview_conversation_import_thread(
    params: ConversationImportThreadPreviewParams,
) -> Result<ConversationImportThreadPreviewResponse, RuntimeCoreError> {
    codex::preview_thread(params)
}

#[cfg(test)]
mod tests;
