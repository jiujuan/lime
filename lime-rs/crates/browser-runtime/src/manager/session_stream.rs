use crate::manager::session::{
    CdpSessionHandle, DEFAULT_CDP_TIMEOUT_MS, SCREENSHOT_FALLBACK_INTERVAL_MS,
};
use crate::types::{BrowserEventPayload, BrowserStreamMode, FrameMetadata};
use chrono::Utc;
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::time::Duration;

impl CdpSessionHandle {
    pub async fn start_stream(&self, mode: BrowserStreamMode) -> Result<(), String> {
        {
            let mut state = self.inner.state.write().await;
            state.stream_mode = Some(mode);
        }
        self.promote_to_live_if_needed().await;
        if !mode.includes_frames() {
            return Ok(());
        }
        if self
            .send_command(
                "Page.startScreencast",
                json!({
                    "format": "jpeg",
                    "quality": 60,
                    "maxWidth": 1280,
                    "maxHeight": 720,
                    "everyNthFrame": 1,
                }),
                DEFAULT_CDP_TIMEOUT_MS,
            )
            .await
            .is_ok()
        {
            self.inner
                .fallback_frames_running
                .store(false, Ordering::SeqCst);
            return Ok(());
        }
        self.start_screenshot_fallback().await;
        Ok(())
    }

    pub async fn stop_stream(&self) -> Result<(), String> {
        {
            let mut state = self.inner.state.write().await;
            state.stream_mode = None;
        }
        self.inner
            .fallback_frames_running
            .store(false, Ordering::SeqCst);
        if let Some(task) = self.inner.screenshot_task.lock().await.take() {
            task.abort();
        }
        let _ = self
            .send_command("Page.stopScreencast", json!({}), DEFAULT_CDP_TIMEOUT_MS)
            .await;
        Ok(())
    }

    async fn start_screenshot_fallback(&self) {
        if self
            .inner
            .fallback_frames_running
            .swap(true, Ordering::SeqCst)
        {
            return;
        }
        let session = self.clone();
        let task = tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(Duration::from_millis(SCREENSHOT_FALLBACK_INTERVAL_MS));
            loop {
                interval.tick().await;
                if !session.inner.fallback_frames_running.load(Ordering::SeqCst) {
                    break;
                }
                match session
                    .send_command(
                        "Page.captureScreenshot",
                        json!({
                            "format": "jpeg",
                            "quality": 60,
                        }),
                        DEFAULT_CDP_TIMEOUT_MS,
                    )
                    .await
                {
                    Ok(result) => {
                        if let Some(data) = result.get("data").and_then(Value::as_str) {
                            let frame = FrameMetadata {
                                width: 1280,
                                height: 720,
                                timestamp: Utc::now().timestamp_millis(),
                                sequence: session
                                    .inner
                                    .frame_sequence
                                    .fetch_add(1, Ordering::SeqCst),
                            };
                            session
                                .emit(BrowserEventPayload::FrameChunk {
                                    data: data.to_string(),
                                    metadata: frame,
                                })
                                .await;
                            session.promote_to_live_if_needed().await;
                        } else {
                            session
                                .emit(BrowserEventPayload::FrameDropped {
                                    reason: "截图结果缺少 data 字段".to_string(),
                                })
                                .await;
                        }
                    }
                    Err(error) => {
                        session
                            .emit(BrowserEventPayload::FrameDropped { reason: error })
                            .await;
                    }
                }
            }
        });
        *self.inner.screenshot_task.lock().await = Some(task);
    }
}
