use super::{RuntimeCore, RuntimeCoreError};
use agent_protocol::PageCursor;
use app_server_protocol::{
    ThreadItemsListParams, ThreadItemsListResponse, ThreadListParams, ThreadListResponse,
    ThreadReadParams, ThreadReadResponse, ThreadTurnsListParams, ThreadTurnsListResponse,
};
use thread_store::{
    ListItemsParams, ListThreadsParams, ListTurnsParams, PageRequest, ReadThreadParams,
    StoreCursor, ThreadStore,
};

const DEFAULT_PAGE_LIMIT: u32 = 100;

impl RuntimeCore {
    pub async fn read_thread(
        &self,
        params: ThreadReadParams,
    ) -> Result<ThreadReadResponse, RuntimeCoreError> {
        let store = self.canonical_thread_store()?;
        let thread_id = params.thread_id.clone();
        let thread = store
            .read_thread(ReadThreadParams {
                thread_id: params.thread_id,
                include_archived: true,
                turns_view: params.turns_view,
            })
            .await
            .map_err(store_error)?
            .ok_or_else(|| RuntimeCoreError::Backend(format!("thread not found: {thread_id}")))?;
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
