use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::*;

impl RuntimeCore {
    pub async fn list_knowledge_packs(
        &self,
        params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        self.app_data_source.list_knowledge_packs(params).await
    }

    pub async fn read_knowledge_pack(
        &self,
        params: KnowledgeReadPackParams,
    ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
        self.app_data_source.read_knowledge_pack(params).await
    }

    pub async fn import_knowledge_source(
        &self,
        params: KnowledgeImportSourceParams,
    ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
        self.app_data_source.import_knowledge_source(params).await
    }

    pub async fn compile_knowledge_pack(
        &self,
        params: KnowledgeCompilePackParams,
    ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
        let mut request = Self::to_lime_knowledge_compile_pack_request(params)?;
        if let Some(plan) = lime_knowledge::plan_knowledge_builder_runtime(&request)
            .map_err(RuntimeCoreError::Backend)?
        {
            request.builder_execution = Some(
                self.knowledge_builder_runtime_executor
                    .execute(plan)
                    .await?,
            );
        }
        self.app_data_source.compile_knowledge_pack(request).await
    }

    fn to_lime_knowledge_compile_pack_request(
        params: KnowledgeCompilePackParams,
    ) -> Result<lime_knowledge::KnowledgeCompilePackRequest, RuntimeCoreError> {
        Ok(lime_knowledge::KnowledgeCompilePackRequest {
            working_dir: params.working_dir,
            name: params.name,
            builder_runtime: params
                .builder_runtime
                .map(serde_json::from_value)
                .transpose()
                .map_err(|error| {
                    RuntimeCoreError::Backend(format!(
                        "knowledgePack/compile builderRuntime 参数无效: {error}"
                    ))
                })?,
            builder_execution: None,
        })
    }

    pub async fn set_default_knowledge_pack(
        &self,
        params: KnowledgeSetDefaultPackParams,
    ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
        self.app_data_source
            .set_default_knowledge_pack(params)
            .await
    }

    pub async fn update_knowledge_pack_status(
        &self,
        params: KnowledgeUpdatePackStatusParams,
    ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
        self.app_data_source
            .update_knowledge_pack_status(params)
            .await
    }

    pub async fn resolve_knowledge_context(
        &self,
        params: KnowledgeResolveContextParams,
    ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
        self.app_data_source.resolve_knowledge_context(params).await
    }

    pub async fn validate_knowledge_context_run(
        &self,
        params: KnowledgeValidateContextRunParams,
    ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
        self.app_data_source
            .validate_knowledge_context_run(params)
            .await
    }
}
