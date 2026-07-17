use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::{
    ConversationImportJobReadParams, ConversationImportJobReadResponse,
    ConversationImportSourceScanParams, ConversationImportSourceScanResponse,
    ConversationImportThreadCommitParams, ConversationImportThreadCommitStartResponse,
    ConversationImportThreadPreviewParams, ConversationImportThreadPreviewResponse,
};

mod codex;
mod commit;
mod import_status;
mod job;
mod provenance;

pub(in crate::runtime) use job::ImportJobRecord;

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
    ) -> Result<ConversationImportThreadCommitStartResponse, RuntimeCoreError> {
        job::start_import_job(self, params)
    }

    pub async fn read_conversation_import_job(
        &self,
        params: ConversationImportJobReadParams,
    ) -> Result<ConversationImportJobReadResponse, RuntimeCoreError> {
        job::read_import_job(self, params)
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
