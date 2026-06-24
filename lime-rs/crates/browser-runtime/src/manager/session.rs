use crate::client::CdpCommandClient;
use crate::types::{BrowserEvent, BrowserPageInfo, CdpSessionState};
use chrono::Utc;
use futures::stream::{SplitSink, SplitStream};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::sync::{broadcast, Mutex, RwLock};
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

pub(super) const DEFAULT_BUFFER_SIZE: usize = 500;
pub(super) const DEFAULT_CDP_TIMEOUT_MS: u64 = 10_000;
pub(super) const SCREENSHOT_FALLBACK_INTERVAL_MS: u64 = 500;
pub(super) const RESUME_TO_LIVE_DELAY_MS: u64 = 1_200;

pub(super) type CdpRead = SplitStream<WebSocketStream<MaybeTlsStream<TcpStream>>>;
type CdpWrite = SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>;

#[derive(Clone)]
pub struct CdpSessionHandle {
    pub(super) inner: Arc<CdpSession>,
}

impl CdpSessionHandle {
    pub(super) fn new(state: CdpSessionState, writer: CdpWrite) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            inner: Arc::new(CdpSession {
                client: Arc::new(CdpCommandClient::new(writer)),
                state: RwLock::new(state),
                event_buffer: RwLock::new(VecDeque::with_capacity(DEFAULT_BUFFER_SIZE)),
                event_tx,
                next_event_sequence: AtomicU64::new(1),
                next_user_command_id: AtomicU64::new(1),
                frame_sequence: AtomicU64::new(1),
                reader_task: Mutex::new(None),
                screenshot_task: Mutex::new(None),
                fallback_frames_running: AtomicBool::new(false),
            }),
        }
    }

    pub async fn bootstrap(&self) -> Result<(), String> {
        for method in [
            "Page.enable",
            "Runtime.enable",
            "Network.enable",
            "Log.enable",
        ] {
            let _ = self
                .send_command(method, json!({}), DEFAULT_CDP_TIMEOUT_MS)
                .await;
        }
        let _ = self
            .send_command(
                "Target.setAutoAttach",
                json!({
                    "autoAttach": true,
                    "waitForDebuggerOnStart": false,
                    "flatten": true,
                }),
                DEFAULT_CDP_TIMEOUT_MS,
            )
            .await;
        Ok(())
    }

    pub async fn state(&self) -> CdpSessionState {
        self.inner.state.read().await.clone()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<BrowserEvent> {
        self.inner.event_tx.subscribe()
    }

    pub fn next_user_command_id(&self) -> u64 {
        self.inner
            .next_user_command_id
            .fetch_add(1, Ordering::SeqCst)
    }

    pub(super) async fn set_reader_task(&self, task: JoinHandle<()>) {
        *self.inner.reader_task.lock().await = Some(task);
    }

    pub async fn send_command(
        &self,
        method: &str,
        params: Value,
        timeout_ms: u64,
    ) -> Result<Value, String> {
        self.inner
            .client
            .send_command(method, params, timeout_ms)
            .await
    }

    pub async fn runtime_evaluate(
        &self,
        expression: String,
        return_by_value: bool,
        timeout_ms: u64,
    ) -> Result<Value, String> {
        let response = self
            .send_command(
                "Runtime.evaluate",
                json!({
                    "expression": expression,
                    "returnByValue": return_by_value,
                    "awaitPromise": true,
                }),
                timeout_ms,
            )
            .await?;
        if let Some(exception) = response.get("exceptionDetails") {
            return Err(format!("页面脚本执行失败: {exception}"));
        }
        let result = response.get("result").cloned().unwrap_or(Value::Null);
        Ok(result.get("value").cloned().unwrap_or(result))
    }

    pub async fn capture_page_info(&self) -> Result<BrowserPageInfo, String> {
        let result = self
            .runtime_evaluate(
                r#"
(() => {
  const bodyText = (document.body?.innerText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80)
    .join("\n");
  const title = document.title || location.href;
  const url = location.href;
  return {
    title,
    url,
    markdown: `# ${title}\nURL: ${url}\n\n${bodyText}`.trim(),
  };
})()
"#
                .to_string(),
                true,
                DEFAULT_CDP_TIMEOUT_MS,
            )
            .await?;
        let title = result
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let url = result
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let markdown = result
            .get("markdown")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        Ok(BrowserPageInfo {
            title,
            url,
            markdown,
            updated_at: Utc::now().to_rfc3339(),
        })
    }
}

pub(super) struct CdpSession {
    pub(super) client: Arc<CdpCommandClient>,
    pub(super) state: RwLock<CdpSessionState>,
    pub(super) event_buffer: RwLock<VecDeque<BrowserEvent>>,
    pub(super) event_tx: broadcast::Sender<BrowserEvent>,
    pub(super) next_event_sequence: AtomicU64,
    pub(super) next_user_command_id: AtomicU64,
    pub(super) frame_sequence: AtomicU64,
    pub(super) reader_task: Mutex<Option<JoinHandle<()>>>,
    pub(super) screenshot_task: Mutex<Option<JoinHandle<()>>>,
    pub(super) fallback_frames_running: AtomicBool,
}
