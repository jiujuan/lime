use super::data_error;
use super::value_from_serializable;
use super::values_from_serializable_vec;
use crate::RuntimeCoreError;
use app_server_protocol::KnowledgeCompilePackResponse;
use app_server_protocol::KnowledgeContextResolutionResponse;
use app_server_protocol::KnowledgeImportSourceParams;
use app_server_protocol::KnowledgeImportSourceResponse;
use app_server_protocol::KnowledgeListPacksParams;
use app_server_protocol::KnowledgeListPacksResponse;
use app_server_protocol::KnowledgeReadPackParams;
use app_server_protocol::KnowledgeReadPackResponse;
use app_server_protocol::KnowledgeResolveContextPackParams;
use app_server_protocol::KnowledgeResolveContextParams;
use app_server_protocol::KnowledgeSetDefaultPackParams;
use app_server_protocol::KnowledgeSetDefaultPackResponse;
use app_server_protocol::KnowledgeUpdatePackStatusParams;
use app_server_protocol::KnowledgeUpdatePackStatusResponse;
use app_server_protocol::KnowledgeValidateContextRunParams;
use app_server_protocol::KnowledgeValidateContextRunResponse;

pub(crate) fn list_knowledge_packs(
    params: KnowledgeListPacksParams,
) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
    let response =
        lime_knowledge::list_knowledge_packs(lime_knowledge::KnowledgeListPacksRequest {
            working_dir: params.working_dir,
            include_archived: params.include_archived,
        })
        .map_err(data_error)?;
    Ok(KnowledgeListPacksResponse {
        working_dir: response.working_dir,
        root_path: response.root_path,
        packs: values_from_serializable_vec(response.packs)?,
    })
}

pub(crate) fn read_knowledge_pack(
    params: KnowledgeReadPackParams,
) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
    let pack = lime_knowledge::get_knowledge_pack(lime_knowledge::KnowledgeGetPackRequest {
        working_dir: params.working_dir,
        name: params.name,
    })
    .map_err(data_error)?;

    Ok(KnowledgeReadPackResponse {
        pack: value_from_serializable(pack)?,
    })
}

pub(crate) fn import_knowledge_source(
    params: KnowledgeImportSourceParams,
) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
    let response =
        lime_knowledge::import_knowledge_source(lime_knowledge::KnowledgeImportSourceRequest {
            working_dir: params.working_dir,
            pack_name: params.pack_name,
            description: params.description,
            pack_type: params.pack_type,
            language: params.language,
            source_file_name: params.source_file_name,
            source_text: params.source_text,
        })
        .map_err(data_error)?;

    Ok(KnowledgeImportSourceResponse {
        pack: value_from_serializable(response.pack)?,
        source: value_from_serializable(response.source)?,
    })
}

pub(crate) fn compile_knowledge_pack(
    request: lime_knowledge::KnowledgeCompilePackRequest,
) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
    let response = lime_knowledge::compile_knowledge_pack(request).map_err(data_error)?;

    Ok(KnowledgeCompilePackResponse {
        pack: value_from_serializable(response.pack)?,
        selected_source_count: response.selected_source_count,
        compiled_view: value_from_serializable(response.compiled_view)?,
        run: value_from_serializable(response.run)?,
        warnings: response.warnings,
    })
}

pub(crate) fn set_default_knowledge_pack(
    params: KnowledgeSetDefaultPackParams,
) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
    let response = lime_knowledge::set_default_knowledge_pack(
        lime_knowledge::KnowledgeSetDefaultPackRequest {
            working_dir: params.working_dir,
            name: params.name,
        },
    )
    .map_err(data_error)?;

    Ok(KnowledgeSetDefaultPackResponse {
        default_pack_name: response.default_pack_name,
        default_marker_path: response.default_marker_path,
    })
}

pub(crate) fn update_knowledge_pack_status(
    params: KnowledgeUpdatePackStatusParams,
) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
    let response = lime_knowledge::update_knowledge_pack_status(
        lime_knowledge::KnowledgeUpdatePackStatusRequest {
            working_dir: params.working_dir,
            name: params.name,
            status: params.status,
        },
    )
    .map_err(data_error)?;

    Ok(KnowledgeUpdatePackStatusResponse {
        pack: value_from_serializable(response.pack)?,
        previous_status: response.previous_status,
        cleared_default: response.cleared_default,
    })
}

pub(crate) fn resolve_knowledge_context(
    params: KnowledgeResolveContextParams,
) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
    let response =
        lime_knowledge::resolve_knowledge_context(lime_knowledge::KnowledgeResolveContextRequest {
            working_dir: params.working_dir,
            name: params.name,
            packs: params
                .packs
                .into_iter()
                .map(to_lime_knowledge_context_pack_request)
                .collect(),
            task: params.task,
            max_chars: params.max_chars,
            activation: params.activation,
            write_run: params.write_run,
            run_reason: params.run_reason,
        })
        .map_err(data_error)?;

    Ok(KnowledgeContextResolutionResponse {
        pack_name: response.pack_name,
        status: response.status,
        grounding: response.grounding,
        selected_views: values_from_serializable_vec(response.selected_views)?,
        selected_files: response.selected_files,
        source_anchors: response.source_anchors,
        warnings: values_from_serializable_vec(response.warnings)?,
        missing: response.missing,
        token_estimate: response.token_estimate,
        fenced_context: response.fenced_context,
        run_id: response.run_id,
        run_path: response.run_path,
    })
}

pub(crate) fn validate_knowledge_context_run(
    params: KnowledgeValidateContextRunParams,
) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
    let response = lime_knowledge::validate_knowledge_context_run(
        lime_knowledge::KnowledgeValidateContextRunRequest {
            working_dir: params.working_dir,
            name: params.name,
            run_path: params.run_path,
        },
    )
    .map_err(data_error)?;

    Ok(KnowledgeValidateContextRunResponse {
        valid: response.valid,
        run_id: response.run_id,
        status: response.status,
        errors: response.errors,
        warnings: response.warnings,
    })
}

fn to_lime_knowledge_context_pack_request(
    params: KnowledgeResolveContextPackParams,
) -> lime_knowledge::KnowledgeResolveContextPackRequest {
    lime_knowledge::KnowledgeResolveContextPackRequest {
        name: params.name,
        activation: params.activation,
    }
}
