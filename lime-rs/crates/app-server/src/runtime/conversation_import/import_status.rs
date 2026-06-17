use crate::runtime::RuntimeCore;
use app_server_protocol::{
    AgentSession, BusinessObjectRef, ConversationImportSourceClient,
    ConversationImportSourceScanResponse, ConversationImportThreadPreviewResponse,
    ConversationImportThreadStatus, ImportedThreadSummary,
};
use serde_json::Value;

pub(super) const IMPORTED_CONVERSATION_KIND: &str = "conversation.import";

pub(super) fn apply_scan_import_status(
    core: &RuntimeCore,
    response: &mut ConversationImportSourceScanResponse,
) {
    for thread in &mut response.threads {
        apply_thread_import_status(core, thread);
    }
}

pub(super) fn apply_preview_import_status(
    core: &RuntimeCore,
    response: &mut ConversationImportThreadPreviewResponse,
) {
    apply_thread_import_status(core, &mut response.thread);
    if response.thread.import_status == ConversationImportThreadStatus::Imported {
        response.summary.dry_run.will_create_session = false;
        response.summary.dry_run.will_append_to_existing_session = true;
    }
}

pub(super) fn apply_thread_import_status(core: &RuntimeCore, thread: &mut ImportedThreadSummary) {
    if imported_session_for_thread(core, thread.source_client, &thread.source_thread_id).is_some() {
        thread.import_status = ConversationImportThreadStatus::Imported;
    }
}

pub(super) fn imported_session_for_thread(
    core: &RuntimeCore,
    source_client: ConversationImportSourceClient,
    source_thread_id: &str,
) -> Option<AgentSession> {
    let normalized_thread_id = source_thread_id.trim();
    if normalized_thread_id.is_empty() {
        return None;
    }
    let in_memory = {
        let state = core
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        state
            .sessions
            .values()
            .filter(|stored| {
                stored
                    .session
                    .business_object_ref
                    .as_ref()
                    .is_some_and(|reference| {
                        import_reference_matches(reference, source_client, normalized_thread_id)
                    })
            })
            .map(|stored| stored.session.clone())
            .max_by(|left, right| {
                left.updated_at
                    .cmp(&right.updated_at)
                    .then_with(|| left.session_id.cmp(&right.session_id))
            })
    };
    if in_memory.is_some() {
        return in_memory;
    }

    let projection_store = core.projection_store.as_ref()?;
    projection_store
        .find_session_by_import_source(
            IMPORTED_CONVERSATION_KIND,
            source_client_value(source_client),
            normalized_thread_id,
        )
        .ok()
        .flatten()
}

fn import_reference_matches(
    reference: &BusinessObjectRef,
    source_client: ConversationImportSourceClient,
    source_thread_id: &str,
) -> bool {
    reference.kind == IMPORTED_CONVERSATION_KIND
        && reference.id == source_thread_id
        && reference_source_client_matches(reference.metadata.as_ref(), source_client)
}

fn reference_source_client_matches(
    metadata: Option<&Value>,
    source_client: ConversationImportSourceClient,
) -> bool {
    let Some(client) = metadata
        .and_then(|metadata| metadata.get("sourceClient"))
        .and_then(Value::as_str)
    else {
        return source_client == ConversationImportSourceClient::Codex;
    };
    client == source_client_value(source_client)
}

pub(super) fn source_client_value(source_client: ConversationImportSourceClient) -> &'static str {
    match source_client {
        ConversationImportSourceClient::Codex => "codex",
        ConversationImportSourceClient::ClaudeCode => "claude_code",
    }
}
