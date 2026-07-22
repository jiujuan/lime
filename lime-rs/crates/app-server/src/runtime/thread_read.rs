use super::status::agent_turn_blocks_queue_resume;
use super::{RuntimeCore, RuntimeCoreError};
use agent_protocol::PageCursor;
use app_server_protocol::{
    ThreadItemsListParams, ThreadItemsListResponse, ThreadListParams, ThreadListResponse,
    ThreadReadParams, ThreadReadResponse, ThreadTurnsListParams, ThreadTurnsListResponse,
};
use thread_store::{
    ArchiveThreadParams, ListItemsParams, ListThreadsParams, ListTurnsParams, PageRequest,
    ReadThreadParams, StoreCursor, ThreadStore,
};

const DEFAULT_PAGE_LIMIT: u32 = 100;

pub(crate) struct RuntimeThreadResumeSnapshot {
    pub thread: agent_protocol::Thread,
    pub active_turn_id: Option<agent_protocol::TurnId>,
}

impl RuntimeCore {
    pub async fn archive_thread(
        &self,
        thread_id: agent_protocol::ThreadId,
    ) -> Result<bool, RuntimeCoreError> {
        let store = self.canonical_thread_store()?;
        let current = store
            .read_thread(ReadThreadParams {
                thread_id: thread_id.clone(),
                include_archived: true,
                turns_view: agent_protocol::ThreadTurnsView::NotLoaded,
            })
            .await
            .map_err(store_error)?
            .ok_or_else(|| RuntimeCoreError::Backend(format!("thread not found: {thread_id}")))?;
        store
            .archive_thread(ArchiveThreadParams { thread_id })
            .await
            .map_err(store_error)?;
        Ok(!current.archived)
    }

    pub async fn unarchive_thread(
        &self,
        thread_id: agent_protocol::ThreadId,
    ) -> Result<(agent_protocol::Thread, bool), RuntimeCoreError> {
        let store = self.canonical_thread_store()?;
        let current = store
            .read_thread(ReadThreadParams {
                thread_id: thread_id.clone(),
                include_archived: true,
                turns_view: agent_protocol::ThreadTurnsView::NotLoaded,
            })
            .await
            .map_err(store_error)?
            .ok_or_else(|| RuntimeCoreError::Backend(format!("thread not found: {thread_id}")))?;
        let thread = store
            .unarchive_thread(ArchiveThreadParams { thread_id })
            .await
            .map_err(store_error)?;
        Ok((thread, current.archived))
    }

    pub(crate) async fn resume_thread(
        &self,
        thread_id: agent_protocol::ThreadId,
    ) -> Result<RuntimeThreadResumeSnapshot, RuntimeCoreError> {
        let response = self
            .read_thread(ThreadReadParams {
                thread_id,
                turns_view: agent_protocol::ThreadTurnsView::NotLoaded,
            })
            .await?;
        let session_id = response.thread.session_id.clone();
        if let Err(error) = self
            .ensure_current_session_hydrated(session_id.as_str())
            .await
        {
            if !matches!(error, RuntimeCoreError::SessionNotFound(_))
                || response.thread.forked_from_id.is_none()
            {
                return Err(error);
            }
            let canonical = self
                .read_thread(ThreadReadParams {
                    thread_id: response.thread.thread_id.clone(),
                    turns_view: agent_protocol::ThreadTurnsView::Full,
                })
                .await?;
            self.hydrate_fork_session_from_canonical(&canonical.thread)?;
        }
        let active_turn_id = self
            .session_loops
            .snapshot(session_id.as_str())
            .await
            .map_err(|error| {
                RuntimeCoreError::Backend(format!(
                    "read runtime session snapshot for thread resume: {error}"
                ))
            })?
            .and_then(|snapshot| snapshot.active_turn_id)
            .map(agent_protocol::TurnId::new);
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let thread_is_idle = active_turn_id.is_none()
            && state
                .sessions
                .get(session_id.as_str())
                .is_some_and(|stored| {
                    !stored
                        .turns
                        .iter()
                        .any(|turn| agent_turn_blocks_queue_resume(turn.status))
                });
        self.projection_store
            .as_deref()
            .ok_or_else(|| {
                RuntimeCoreError::Backend("thread goal store is unavailable".to_string())
            })?
            .restore_thread_goal_accounting_sync(response.thread.thread_id.as_str(), thread_is_idle)
            .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?;
        drop(state);
        Ok(RuntimeThreadResumeSnapshot {
            thread: response.thread,
            active_turn_id,
        })
    }

    pub async fn read_thread(
        &self,
        params: ThreadReadParams,
    ) -> Result<ThreadReadResponse, RuntimeCoreError> {
        let store = self.canonical_thread_store()?;
        let thread_id = params.thread_id.clone();
        let turns_view = params.turns_view;
        let mut thread = store
            .read_thread(ReadThreadParams {
                thread_id: params.thread_id,
                include_archived: true,
                turns_view,
            })
            .await
            .map_err(store_error)?
            .ok_or_else(|| RuntimeCoreError::Backend(format!("thread not found: {thread_id}")))?;
        if thread.forked_from_id.is_some()
            && thread
                .metadata
                .get("forkSequence")
                .and_then(serde_json::Value::as_u64)
                .is_some()
        {
            if let Err(error) = self
                .ensure_current_session_hydrated(thread.session_id.as_str())
                .await
            {
                if !matches!(error, RuntimeCoreError::SessionNotFound(_)) {
                    return Err(error);
                }
            }
            let canonical = if matches!(turns_view, agent_protocol::ThreadTurnsView::Full) {
                thread.clone()
            } else {
                store
                    .read_thread(ReadThreadParams {
                        thread_id: thread.thread_id.clone(),
                        include_archived: true,
                        turns_view: agent_protocol::ThreadTurnsView::Full,
                    })
                    .await
                    .map_err(store_error)?
                    .ok_or_else(|| {
                        RuntimeCoreError::Backend(format!(
                            "forked thread disappeared during history hydration: {}",
                            thread.thread_id
                        ))
                    })?
            };
            self.hydrate_fork_session_from_canonical(&canonical)?;
        }
        if let Some(product) = self
            .projection_store
            .as_deref()
            .map(|store| store.read_thread_product_projection(thread.session_id.as_str()))
            .transpose()
            .map_err(RuntimeCoreError::Backend)?
            .flatten()
        {
            merge_thread_product_projection(&mut thread.metadata, product);
        }
        Ok(ThreadReadResponse { thread })
    }

    pub async fn list_threads(
        &self,
        params: ThreadListParams,
    ) -> Result<ThreadListResponse, RuntimeCoreError> {
        let store = self.canonical_thread_store()?;
        let turns_view = params.turns_view;
        let page = store
            .list_threads(ListThreadsParams {
                include_archived: params.include_archived,
                page: store_page(params.page)?,
            })
            .await
            .map_err(store_error)?;
        let mut data = page.data;
        if !matches!(turns_view, agent_protocol::ThreadTurnsView::NotLoaded) {
            for thread in &mut data {
                let Some(hydrated) = store
                    .read_thread(ReadThreadParams {
                        thread_id: thread.thread_id.clone(),
                        include_archived: true,
                        turns_view,
                    })
                    .await
                    .map_err(store_error)?
                else {
                    return Err(RuntimeCoreError::Backend(format!(
                        "listed thread disappeared during hydration: {}",
                        thread.thread_id
                    )));
                };
                *thread = hydrated;
            }
        }
        Ok(ThreadListResponse {
            data,
            next_cursor: page.next_cursor.map(StoreCursor::into_string),
            backwards_cursor: page.backwards_cursor.map(StoreCursor::into_string),
        })
    }

    pub async fn list_thread_turns(
        &self,
        params: ThreadTurnsListParams,
    ) -> Result<ThreadTurnsListResponse, RuntimeCoreError> {
        let store = self.canonical_thread_store()?;
        let page = store
            .list_turns(ListTurnsParams {
                thread_id: params.thread_id,
                include_archived: true,
                page: store_page(params.page)?,
                items_view: params.items_view,
            })
            .await
            .map_err(store_error)?;
        Ok(ThreadTurnsListResponse {
            data: page.data,
            next_cursor: page.next_cursor.map(StoreCursor::into_string),
            backwards_cursor: page.backwards_cursor.map(StoreCursor::into_string),
        })
    }

    pub async fn list_thread_items(
        &self,
        params: ThreadItemsListParams,
    ) -> Result<ThreadItemsListResponse, RuntimeCoreError> {
        let store = self.canonical_thread_store()?;
        let page = store
            .list_items(ListItemsParams {
                thread_id: params.thread_id,
                turn_id: params.turn_id,
                include_archived: true,
                page: store_page(params.page)?,
            })
            .await
            .map_err(store_error)?;
        Ok(ThreadItemsListResponse {
            data: page.data,
            next_cursor: page.next_cursor.map(StoreCursor::into_string),
            backwards_cursor: page.backwards_cursor.map(StoreCursor::into_string),
        })
    }

    fn canonical_thread_store(&self) -> Result<&dyn ThreadStore, RuntimeCoreError> {
        self.projection_store
            .as_deref()
            .map(|store| store as &dyn ThreadStore)
            .ok_or_else(|| {
                RuntimeCoreError::Backend("canonical thread store is unavailable".to_string())
            })
    }
}

fn merge_thread_product_projection(metadata: &mut serde_json::Value, product: serde_json::Value) {
    let Some(product) = product.as_object() else {
        return;
    };
    if !metadata.is_object() {
        *metadata = serde_json::Value::Object(serde_json::Map::new());
    }
    let Some(metadata) = metadata.as_object_mut() else {
        return;
    };
    metadata.extend(product.clone());
}

fn store_page(page: PageCursor) -> Result<PageRequest, RuntimeCoreError> {
    let cursor = page
        .cursor
        .map(StoreCursor::new)
        .transpose()
        .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?;
    Ok(PageRequest {
        cursor,
        limit: page.limit.unwrap_or(DEFAULT_PAGE_LIMIT),
        sort_direction: page.sort_direction,
    })
}

fn store_error(error: thread_store::ThreadStoreError) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ProjectionStore;
    use agent_protocol::{
        ItemId, ItemKind, ItemStatus, SessionId, Thread, ThreadHistoryChangeSet, ThreadId,
        ThreadItem, ThreadItemPayload, ThreadStatus, ThreadTurnsView, Turn, TurnAdmissionState,
        TurnApprovalState, TurnId, TurnItemsView, TurnQueueState, TurnStatus,
    };
    use app_server_protocol::AgentEvent;
    use serde_json::json;
    use std::sync::Arc;
    use thread_store::{
        ApplyThreadHistoryParams, ArchiveThreadParams, CreateThreadParams, ThreadStore,
    };

    #[tokio::test]
    async fn canonical_thread_reads_use_the_projection_store_without_session_fallback() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = Arc::new(
            ProjectionStore::initialize(temp.path().join("projection.sqlite")).expect("store"),
        );
        let thread = make_thread("thread-current", 10);
        store
            .create_thread(CreateThreadParams {
                thread: thread.clone(),
            })
            .await
            .expect("create current thread");
        let archived = make_thread("thread-archived", 20);
        store
            .create_thread(CreateThreadParams {
                thread: archived.clone(),
            })
            .await
            .expect("create archived thread");
        store
            .archive_thread(ArchiveThreadParams {
                thread_id: archived.thread_id.clone(),
            })
            .await
            .expect("archive thread");

        let turn = Turn {
            session_id: thread.session_id.clone(),
            thread_id: thread.thread_id.clone(),
            turn_id: TurnId::new("turn-current"),
            status: TurnStatus::Completed,
            admission: TurnAdmissionState::Accepted,
            queue: TurnQueueState::Running,
            approval: TurnApprovalState::NotRequired,
            items: Vec::new(),
            items_view: TurnItemsView::NotLoaded,
            error: None,
            created_at_ms: 10,
            updated_at_ms: 12,
            started_at_ms: Some(10),
            completed_at_ms: Some(12),
            duration_ms: Some(2),
        };
        let item = ThreadItem {
            session_id: thread.session_id.clone(),
            thread_id: thread.thread_id.clone(),
            turn_id: turn.turn_id.clone(),
            item_id: ItemId::new("item-current"),
            sequence: 1,
            ordinal: 1,
            created_at_ms: 11,
            updated_at_ms: 12,
            completed_at_ms: Some(12),
            kind: ItemKind::AgentMessage,
            status: ItemStatus::Completed,
            payload: ThreadItemPayload::AgentMessage {
                text: "canonical".to_string(),
                phase: None,
                content_parts: Vec::new(),
            },
            metadata: json!({}),
        };
        store
            .apply_history(ApplyThreadHistoryParams {
                session_id: thread.session_id.clone(),
                thread_id: thread.thread_id.clone(),
                changes: ThreadHistoryChangeSet {
                    sequence: 1,
                    changed_turns: vec![turn],
                    changed_items: vec![item],
                    ..Default::default()
                },
            })
            .await
            .expect("apply history");
        store
            .apply_event(&AgentEvent {
                event_id: "artifact-current".to_string(),
                sequence: 1,
                session_id: thread.session_id.to_string(),
                thread_id: Some(thread.thread_id.to_string()),
                turn_id: None,
                event_type: "artifact.snapshot".to_string(),
                timestamp: "2026-07-21T00:00:00Z".to_string(),
                payload: json!({
                    "session": {
                        "createdAt": "2026-07-21T00:00:00Z",
                        "updatedAt": "2026-07-21T00:00:00Z",
                        "workspaceId": "workspace-current"
                    },
                    "artifact": {
                        "artifactId": "workspace-patch-current",
                        "kind": "content_factory.workspace_patch",
                        "metadata": {
                            "contentFactoryWorkspacePatch": {
                                "schemaVersion": "article-workspace.v1",
                                "appId": "content-factory-app",
                                "sessionId": thread.session_id,
                                "workspaceId": "workspace-current",
                                "objects": [{
                                    "ref": {
                                        "appId": "content-factory-app",
                                        "kind": "articleDraft",
                                        "id": "article-current",
                                        "sessionId": thread.session_id,
                                        "artifactIds": ["artifact-current"]
                                    },
                                    "title": "Current article",
                                    "status": "ready",
                                    "previewArtifactId": "artifact-current",
                                    "source": {"markdown": "# Current article"}
                                }]
                            }
                        }
                    }
                }),
            })
            .expect("apply product projection");

        let runtime = RuntimeCore::default().with_projection_store(store);
        let visible = runtime
            .list_threads(ThreadListParams {
                page: page(),
                include_archived: false,
                turns_view: ThreadTurnsView::NotLoaded,
            })
            .await
            .expect("list visible");
        assert_eq!(visible.data.len(), 1);
        assert_eq!(visible.data[0].thread_id.as_str(), "thread-current");

        let all = runtime
            .list_threads(ThreadListParams {
                page: page(),
                include_archived: true,
                turns_view: ThreadTurnsView::Full,
            })
            .await
            .expect("list all");
        assert_eq!(all.data.len(), 2);
        assert_eq!(
            all.data
                .iter()
                .find(|item| item.thread_id.as_str() == "thread-current")
                .expect("current thread")
                .turns
                .len(),
            1
        );

        let read = runtime
            .read_thread(ThreadReadParams {
                thread_id: thread.thread_id.clone(),
                turns_view: ThreadTurnsView::Full,
            })
            .await
            .expect("read thread");
        assert_eq!(
            read.thread.turns[0].items[0].item_id.as_str(),
            "item_item-current"
        );
        assert_eq!(
            read.thread.metadata["articleWorkspace"]["objects"][0]["ref"]["id"],
            "article-current"
        );
        assert!(read.thread.metadata["artifacts"]
            .as_array()
            .expect("thread artifacts")
            .iter()
            .any(|artifact| artifact["artifactRef"] == "artifact-current"));

        let turns = runtime
            .list_thread_turns(ThreadTurnsListParams {
                thread_id: thread.thread_id.clone(),
                page: page(),
                items_view: TurnItemsView::Full,
            })
            .await
            .expect("list turns");
        assert_eq!(turns.data[0].items[0].item_id.as_str(), "item_item-current");

        let items = runtime
            .list_thread_items(ThreadItemsListParams {
                thread_id: thread.thread_id,
                turn_id: None,
                page: page(),
            })
            .await
            .expect("list items");
        assert_eq!(items.data[0].item_id.as_str(), "item_item-current");
    }

    fn make_thread(thread_id: &str, timestamp: i64) -> Thread {
        Thread {
            session_id: SessionId::new(format!("session-{thread_id}")),
            thread_id: ThreadId::new(thread_id),
            status: ThreadStatus::Idle,
            created_at_ms: timestamp,
            updated_at_ms: timestamp,
            archived: false,
            recency_at_ms: Some(timestamp),
            parent_thread_id: None,
            agent_path: None,
            agent_nickname: None,
            agent_role: None,
            last_task_message: None,
            agent_state: None,
            forked_from_id: None,
            preview: String::new(),
            model_provider: "test".to_string(),
            product: None,
            name: None,
            metadata: json!({}),
            turns: Vec::new(),
            turns_view: ThreadTurnsView::NotLoaded,
        }
    }

    fn page() -> PageCursor {
        PageCursor {
            cursor: None,
            limit: Some(20),
            sort_direction: agent_protocol::SortDirection::Asc,
        }
    }
}
