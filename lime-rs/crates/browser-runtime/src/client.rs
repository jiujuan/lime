use futures::{stream::SplitSink, SinkExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::net::TcpStream;
use tokio::sync::{oneshot, Mutex};
use tokio::time::{timeout, Duration};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

type CdpWrite = SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>;

pub struct CdpCommandClient {
    next_command_id: AtomicU64,
    writer: Mutex<CdpWrite>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
}

impl CdpCommandClient {
    pub fn new(writer: CdpWrite) -> Self {
        Self {
            next_command_id: AtomicU64::new(1),
            writer: Mutex::new(writer),
            pending: Mutex::new(HashMap::new()),
        }
    }

    pub async fn send_command(
        &self,
        method: &str,
        params: Value,
        timeout_ms: u64,
    ) -> Result<Value, String> {
        let id = self.next_command_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);

        let payload = json!({
            "id": id,
            "method": method,
            "params": params,
        });

        let message_text =
            serde_json::to_string(&payload).map_err(|e| format!("序列化 CDP 命令失败: {e}"))?;
        if let Err(error) = self
            .writer
            .lock()
            .await
            .send(Message::Text(message_text))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(format!("发送 CDP 命令失败: {error}"));
        }

        match timeout(Duration::from_millis(timeout_ms), rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("CDP 响应通道已关闭".to_string()),
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err(format!("CDP 命令超时: {method}"))
            }
        }
    }

    pub async fn respond(&self, id: u64, payload: Result<Value, String>) {
        if let Some(sender) = self.pending.lock().await.remove(&id) {
            let _ = sender.send(payload);
        }
    }
}
