use crate::manager::session::{CdpRead, CdpSessionHandle, DEFAULT_CDP_TIMEOUT_MS};
use crate::types::{
    BrowserControlMode, BrowserEventPayload, BrowserSessionLifecycleState, FrameMetadata,
};
use chrono::Utc;
use futures::StreamExt;
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tracing::{debug, warn};

impl CdpSessionHandle {
    pub(super) async fn reader_loop(&self, mut reader: CdpRead) {
        let mut close_reason = "socket_closed".to_string();
        let mut close_as_failed = false;
        while let Some(message) = reader.next().await {
            match message {
                Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                    if let Err(error) = self.handle_message(text.to_string()).await {
                        warn!("处理 CDP 消息失败: {error}");
                        self.emit(BrowserEventPayload::SessionError { error }).await;
                    }
                }
                Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => break,
                Ok(_) => {}
                Err(error) => {
                    close_reason = "socket_error".to_string();
                    close_as_failed = true;
                    self.emit(BrowserEventPayload::SessionError {
                        error: format!("读取 CDP 消息失败: {error}"),
                    })
                    .await;
                    break;
                }
            }
        }
        if close_as_failed {
            self.set_session_state(
                BrowserSessionLifecycleState::Failed,
                BrowserControlMode::Agent,
                None,
            )
            .await;
        } else {
            self.set_session_state(
                BrowserSessionLifecycleState::Closed,
                BrowserControlMode::Agent,
                None,
            )
            .await;
        }
        {
            let mut state = self.inner.state.write().await;
            state.connected = false;
        }
        self.emit(BrowserEventPayload::SessionClosed {
            reason: close_reason,
        })
        .await;
    }

    async fn handle_message(&self, text: String) -> Result<(), String> {
        let payload: Value =
            serde_json::from_str(&text).map_err(|e| format!("解析 CDP 消息失败: {e}"))?;
        if let Some(id) = payload.get("id").and_then(Value::as_u64) {
            if let Some(error) = payload.get("error") {
                self.inner
                    .client
                    .respond(id, Err(format!("CDP 错误: {error}")))
                    .await;
            } else {
                self.inner
                    .client
                    .respond(
                        id,
                        Ok(payload.get("result").cloned().unwrap_or(Value::Null)),
                    )
                    .await;
            }
            return Ok(());
        }

        let Some(method) = payload.get("method").and_then(Value::as_str) else {
            return Ok(());
        };
        let params = payload.get("params").cloned().unwrap_or(Value::Null);
        match method {
            "Runtime.consoleAPICalled" => {
                let level = params
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("log")
                    .to_string();
                let text = params
                    .get("args")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .map(extract_remote_value)
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                    .unwrap_or_default();
                let timestamp = params
                    .get("timestamp")
                    .and_then(Value::as_f64)
                    .map(|value| value as i64)
                    .unwrap_or_else(|| Utc::now().timestamp_millis());
                self.emit(BrowserEventPayload::ConsoleMessage {
                    level,
                    text,
                    timestamp,
                })
                .await;
            }
            "Log.entryAdded" => {
                let entry = params.get("entry").cloned().unwrap_or(Value::Null);
                let level = entry
                    .get("level")
                    .and_then(Value::as_str)
                    .unwrap_or("info")
                    .to_string();
                let text = entry
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let timestamp = entry
                    .get("timestamp")
                    .and_then(Value::as_f64)
                    .map(|value| value as i64)
                    .unwrap_or_else(|| Utc::now().timestamp_millis());
                self.emit(BrowserEventPayload::ConsoleMessage {
                    level,
                    text,
                    timestamp,
                })
                .await;
            }
            "Network.requestWillBeSent" => {
                let request = params.get("request").cloned().unwrap_or(Value::Null);
                self.emit(BrowserEventPayload::NetworkRequest {
                    request_id: params
                        .get("requestId")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    url: request
                        .get("url")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    method: request
                        .get("method")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                })
                .await;
            }
            "Network.responseReceived" => {
                let response = params.get("response").cloned().unwrap_or(Value::Null);
                self.emit(BrowserEventPayload::NetworkResponse {
                    request_id: params
                        .get("requestId")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    url: response
                        .get("url")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    status: response
                        .get("status")
                        .and_then(Value::as_f64)
                        .map(|value| value.round() as u16)
                        .unwrap_or(0),
                    mime_type: response
                        .get("mimeType")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                })
                .await;
            }
            "Network.loadingFailed" => {
                self.emit(BrowserEventPayload::NetworkFailed {
                    request_id: params
                        .get("requestId")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    error_text: params
                        .get("errorText")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                })
                .await;
            }
            "Page.loadEventFired" => {
                // 不要在 reader_loop 内直接等待 Runtime.evaluate，
                // 否则会把“等待响应”和“接收响应”锁在同一个任务里。
                let session = self.clone();
                tokio::spawn(async move {
                    if let Ok(page_info) = session.capture_page_info().await {
                        session.update_page_info(page_info).await;
                    }
                });
            }
            "Page.screencastFrame" => {
                let data = params
                    .get("data")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let metadata = params.get("metadata").cloned().unwrap_or(Value::Null);
                let sequence = self.inner.frame_sequence.fetch_add(1, Ordering::SeqCst);
                let frame = FrameMetadata {
                    width: metadata
                        .get("deviceWidth")
                        .and_then(Value::as_u64)
                        .unwrap_or(1280) as u32,
                    height: metadata
                        .get("deviceHeight")
                        .and_then(Value::as_u64)
                        .unwrap_or(720) as u32,
                    timestamp: Utc::now().timestamp_millis(),
                    sequence,
                };
                self.emit(BrowserEventPayload::FrameChunk {
                    data,
                    metadata: frame,
                })
                .await;
                self.promote_to_live_if_needed().await;
                if let Some(session_id) = params.get("sessionId").and_then(Value::as_u64) {
                    let session = self.clone();
                    tokio::spawn(async move {
                        let _ = session
                            .send_command(
                                "Page.screencastFrameAck",
                                json!({ "sessionId": session_id }),
                                DEFAULT_CDP_TIMEOUT_MS,
                            )
                            .await;
                    });
                }
            }
            _ => {
                debug!("忽略未处理 CDP 事件: {method}");
            }
        }
        Ok(())
    }
}

fn extract_remote_value(value: &Value) -> String {
    value
        .get("value")
        .or_else(|| value.get("description"))
        .or_else(|| value.get("unserializableValue"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
