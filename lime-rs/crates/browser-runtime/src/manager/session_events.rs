use crate::manager::session::{CdpSessionHandle, DEFAULT_BUFFER_SIZE};
use crate::types::{
    BrowserEvent, BrowserEventPayload, BrowserPageInfo, BrowserSessionLifecycleState,
};
use chrono::Utc;
use std::sync::atomic::Ordering;

#[derive(Debug, Clone)]
pub struct EventBufferSnapshot {
    pub events: Vec<BrowserEvent>,
    pub next_cursor: u64,
}

impl CdpSessionHandle {
    pub async fn event_buffer(&self, cursor: Option<u64>) -> EventBufferSnapshot {
        let buffer = self.inner.event_buffer.read().await;
        let events = buffer
            .iter()
            .filter(|event| cursor.map(|value| event.sequence > value).unwrap_or(true))
            .cloned()
            .collect::<Vec<_>>();
        let next_cursor = buffer.back().map(|event| event.sequence).unwrap_or(0);
        EventBufferSnapshot {
            events,
            next_cursor,
        }
    }

    pub async fn update_page_info(&self, page_info: BrowserPageInfo) {
        {
            let mut state = self.inner.state.write().await;
            state.target_title = page_info.title.clone();
            state.target_url = page_info.url.clone();
            state.last_page_info = Some(page_info.clone());
            state.last_event_at = Some(Utc::now().to_rfc3339());
        }
        self.emit(BrowserEventPayload::PageInfoChanged {
            title: page_info.title,
            url: page_info.url,
            markdown: page_info.markdown,
        })
        .await;
        self.promote_to_live_if_needed().await;
    }

    pub async fn emit(&self, payload: BrowserEventPayload) {
        let session_id = self.inner.state.read().await.session_id.clone();
        let sequence = self
            .inner
            .next_event_sequence
            .fetch_add(1, Ordering::SeqCst);
        let occurred_at = Utc::now().to_rfc3339();
        let event = BrowserEvent {
            session_id,
            sequence,
            occurred_at: occurred_at.clone(),
            payload,
        };
        {
            let mut buffer = self.inner.event_buffer.write().await;
            buffer.push_back(event.clone());
            while buffer.len() > DEFAULT_BUFFER_SIZE {
                buffer.pop_front();
            }
        }
        {
            let mut state = self.inner.state.write().await;
            state.last_event_at = Some(occurred_at);
            match &event.payload {
                BrowserEventPayload::FrameChunk { .. } => {
                    state.last_frame_at = Some(event.occurred_at.clone());
                }
                BrowserEventPayload::SessionError { error } => {
                    state.last_error = Some(error.clone());
                }
                BrowserEventPayload::SessionClosed { .. } => {
                    state.connected = false;
                    if !matches!(
                        state.lifecycle_state,
                        BrowserSessionLifecycleState::Failed | BrowserSessionLifecycleState::Closed
                    ) {
                        state.lifecycle_state = BrowserSessionLifecycleState::Closed;
                    }
                }
                _ => {}
            }
        }
        let _ = self.inner.event_tx.send(event);
    }

    pub fn collect_console_messages(&self, since: Option<u64>) -> Vec<BrowserEvent> {
        if let Ok(buffer) = self.inner.event_buffer.try_read() {
            buffer
                .iter()
                .filter(|event| {
                    since.map(|value| event.sequence > value).unwrap_or(true)
                        && matches!(event.payload, BrowserEventPayload::ConsoleMessage { .. })
                })
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }

    pub fn collect_network_events(&self, since: Option<u64>) -> Vec<BrowserEvent> {
        if let Ok(buffer) = self.inner.event_buffer.try_read() {
            buffer
                .iter()
                .filter(|event| {
                    since.map(|value| event.sequence > value).unwrap_or(true)
                        && matches!(
                            event.payload,
                            BrowserEventPayload::NetworkRequest { .. }
                                | BrowserEventPayload::NetworkResponse { .. }
                                | BrowserEventPayload::NetworkFailed { .. }
                        )
                })
                .cloned()
                .collect()
        } else {
            Vec::new()
        }
    }
}
