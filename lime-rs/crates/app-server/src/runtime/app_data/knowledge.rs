use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;

#[async_trait]
pub trait KnowledgeAppDataSource: Send + Sync {
    async fn list_knowledge_packs(
        &self,
        _params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        Ok(KnowledgeListPacksResponse::default())
    }

    async fn read_knowledge_pack(
        &self,
        _params: KnowledgeReadPackParams,
    ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
        Err(unavailable("knowledgePack/read"))
    }

    async fn import_knowledge_source(
        &self,
        _params: KnowledgeImportSourceParams,
    ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
        Err(unavailable("knowledgePack/source/import"))
    }

    async fn compile_knowledge_pack(
        &self,
        _request: lime_knowledge::KnowledgeCompilePackRequest,
    ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
        Err(unavailable("knowledgePack/compile"))
    }

    async fn set_default_knowledge_pack(
        &self,
        _params: KnowledgeSetDefaultPackParams,
    ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
        Err(unavailable("knowledgePack/default/set"))
    }

    async fn update_knowledge_pack_status(
        &self,
        _params: KnowledgeUpdatePackStatusParams,
    ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
        Err(unavailable("knowledgePack/status/update"))
    }

    async fn resolve_knowledge_context(
        &self,
        _params: KnowledgeResolveContextParams,
    ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
        Err(unavailable("knowledgeContext/resolve"))
    }

    async fn validate_knowledge_context_run(
        &self,
        _params: KnowledgeValidateContextRunParams,
    ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
        Err(unavailable("knowledgeContextRun/validate"))
    }
}

impl KnowledgeAppDataSource for NoopAppDataSource {}
