mod cdp_targets;
mod session;
mod session_events;
mod session_lifecycle;
mod session_reader;
mod session_stream;

use crate::action;
use crate::types::{
    BrowserControlMode, BrowserEvent, BrowserEventPayload, BrowserSessionLifecycleState,
    BrowserStreamMode, BrowserTransportKind, CdpSessionState, CdpTargetInfo,
};
use chrono::Utc;
use futures::StreamExt;
use serde_json::Value;
use std::collections::HashMap;
use tokio::sync::{broadcast, Mutex, RwLock};
use tokio_tungstenite::connect_async;

use self::cdp_targets::ensure_cdp_target;

pub use self::cdp_targets::{fetch_cdp_targets, is_cdp_endpoint_alive};
pub use self::session::CdpSessionHandle;
pub use self::session_events::EventBufferSnapshot;

#[derive(Debug, Clone)]
pub struct OpenSessionRequest {
    pub profile_key: String,
    pub remote_debugging_port: u16,
    pub target_id: Option<String>,
    pub environment_preset_id: Option<String>,
    pub environment_preset_name: Option<String>,
}

pub struct BrowserRuntimeManager {
    sessions: RwLock<HashMap<String, CdpSessionHandle>>,
    open_session_gate: Mutex<()>,
}

impl Default for BrowserRuntimeManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BrowserRuntimeManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            open_session_gate: Mutex::new(()),
        }
    }

    pub async fn list_targets(
        &self,
        remote_debugging_port: u16,
    ) -> Result<Vec<CdpTargetInfo>, String> {
        fetch_cdp_targets(remote_debugging_port).await
    }

    pub async fn is_cdp_endpoint_alive(&self, remote_debugging_port: u16) -> bool {
        is_cdp_endpoint_alive(remote_debugging_port).await
    }

    pub async fn find_session_by_profile_key(&self, profile_key: &str) -> Option<CdpSessionState> {
        let mut sessions = self
            .session_states_by_profile_key(profile_key)
            .await
            .into_iter()
            .filter(|state| state.connected)
            .collect::<Vec<_>>();
        sessions.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        sessions.pop()
    }

    pub async fn close_sessions_by_profile_key(&self, profile_key: &str) -> Vec<String> {
        let session_ids = self
            .session_states_by_profile_key(profile_key)
            .await
            .into_iter()
            .map(|state| state.session_id)
            .collect::<Vec<_>>();

        for session_id in &session_ids {
            let _ = self.close_session(session_id).await;
        }

        session_ids
    }

    pub async fn open_session(
        &self,
        request: OpenSessionRequest,
    ) -> Result<CdpSessionState, String> {
        let _open_guard = self.open_session_gate.lock().await;
        if let Some(existing) = self.find_session_by_profile_key(&request.profile_key).await {
            let duplicate_session_ids = self
                .session_states_by_profile_key(&request.profile_key)
                .await
                .into_iter()
                .filter(|state| state.connected && state.session_id != existing.session_id)
                .map(|state| state.session_id)
                .collect::<Vec<_>>();
            for session_id in duplicate_session_ids {
                let _ = self.close_session(&session_id).await;
            }
            if existing.environment_preset_id == request.environment_preset_id {
                return Ok(existing);
            }
            return Err(format!(
                "浏览器资料 {} 已存在运行会话，当前环境预设与现有会话不同，请先关闭会话后再切换环境",
                request.profile_key
            ));
        }

        let target =
            ensure_cdp_target(request.remote_debugging_port, request.target_id.as_deref()).await?;
        let ws_url = target
            .web_socket_debugger_url
            .clone()
            .ok_or_else(|| "目标标签页缺少 webSocketDebuggerUrl".to_string())?;
        let (ws_stream, _) = connect_async(&ws_url)
            .await
            .map_err(|e| format!("连接 CDP WebSocket 失败: {e}"))?;
        let (writer, reader) = ws_stream.split();
        let created_at = Utc::now().to_rfc3339();
        let session_id = uuid::Uuid::new_v4().to_string();
        let state = CdpSessionState {
            session_id: session_id.clone(),
            profile_key: request.profile_key.clone(),
            environment_preset_id: request.environment_preset_id.clone(),
            environment_preset_name: request.environment_preset_name.clone(),
            target_id: target.id.clone(),
            target_title: target.title.clone(),
            target_url: target.url.clone(),
            remote_debugging_port: request.remote_debugging_port,
            ws_debugger_url: ws_url,
            devtools_frontend_url: target.devtools_frontend_url.clone(),
            stream_mode: None,
            transport_kind: BrowserTransportKind::CdpFrames,
            lifecycle_state: BrowserSessionLifecycleState::Launching,
            control_mode: BrowserControlMode::Agent,
            human_reason: None,
            last_page_info: None,
            last_event_at: None,
            last_frame_at: None,
            last_error: None,
            created_at,
            connected: true,
        };
        let session = CdpSessionHandle::new(state, writer);
        let session_clone = session.clone();
        let reader_task = tokio::spawn(async move {
            session_clone.reader_loop(reader).await;
        });
        session.set_reader_task(reader_task).await;
        session.bootstrap().await?;
        session
            .emit(BrowserEventPayload::SessionOpened {
                profile_key: request.profile_key,
                target_id: target.id,
            })
            .await;
        session
            .set_session_state(
                BrowserSessionLifecycleState::Live,
                BrowserControlMode::Agent,
                None,
            )
            .await;
        if let Ok(page_info) = session.capture_page_info().await {
            session.update_page_info(page_info).await;
        }
        self.sessions
            .write()
            .await
            .insert(session_id, session.clone());
        Ok(session.state().await)
    }

    pub async fn close_session(&self, session_id: &str) -> Result<(), String> {
        let session = {
            let mut sessions = self.sessions.write().await;
            sessions
                .remove(session_id)
                .ok_or_else(|| format!("未找到 session_id={session_id}"))?
        };
        session.shutdown("manual_close").await;
        Ok(())
    }

    pub async fn start_stream(
        &self,
        session_id: &str,
        mode: BrowserStreamMode,
    ) -> Result<CdpSessionState, String> {
        let session = self.get_session(session_id).await?;
        session.start_stream(mode).await?;
        Ok(session.state().await)
    }

    pub async fn stop_stream(&self, session_id: &str) -> Result<CdpSessionState, String> {
        let session = self.get_session(session_id).await?;
        session.stop_stream().await?;
        Ok(session.state().await)
    }

    pub async fn get_session_state(&self, session_id: &str) -> Result<CdpSessionState, String> {
        Ok(self.get_session(session_id).await?.state().await)
    }

    pub async fn take_over_session(
        &self,
        session_id: &str,
        human_reason: Option<String>,
    ) -> Result<CdpSessionState, String> {
        let session = self.get_session(session_id).await?;
        session.take_over(human_reason).await;
        Ok(session.state().await)
    }

    pub async fn release_session(
        &self,
        session_id: &str,
        human_reason: Option<String>,
    ) -> Result<CdpSessionState, String> {
        let session = self.get_session(session_id).await?;
        session.release(human_reason).await;
        Ok(session.state().await)
    }

    pub async fn resume_session(
        &self,
        session_id: &str,
        human_reason: Option<String>,
    ) -> Result<CdpSessionState, String> {
        let session = self.get_session(session_id).await?;
        session.resume(human_reason).await;
        Ok(session.state().await)
    }

    pub async fn get_event_buffer(
        &self,
        session_id: &str,
        cursor: Option<u64>,
    ) -> Result<EventBufferSnapshot, String> {
        Ok(self
            .get_session(session_id)
            .await?
            .event_buffer(cursor)
            .await)
    }

    pub async fn send_command(
        &self,
        session_id: &str,
        method: &str,
        params: Value,
        timeout_ms: u64,
    ) -> Result<Value, String> {
        self.get_session(session_id)
            .await?
            .send_command(method, params, timeout_ms)
            .await
    }

    pub async fn refresh_page_info(&self, session_id: &str) -> Result<CdpSessionState, String> {
        let session = self.get_session(session_id).await?;
        let page_info = session.capture_page_info().await?;
        session.update_page_info(page_info).await;
        Ok(session.state().await)
    }

    pub async fn subscribe(
        &self,
        session_id: &str,
    ) -> Result<broadcast::Receiver<BrowserEvent>, String> {
        Ok(self.get_session(session_id).await?.subscribe())
    }

    pub async fn execute_action(
        &self,
        session_id: &str,
        action: &str,
        args: Value,
    ) -> Result<Value, String> {
        let session = self.get_session(session_id).await?;
        let command_id = session.next_user_command_id();
        session
            .emit(BrowserEventPayload::CommandStarted {
                command_id,
                action: action.to_string(),
            })
            .await;
        match action::execute_action(&session, action, args).await {
            Ok(result) => {
                session
                    .emit(BrowserEventPayload::CommandCompleted {
                        command_id,
                        action: action.to_string(),
                    })
                    .await;
                Ok(result)
            }
            Err(error) => {
                session
                    .emit(BrowserEventPayload::CommandFailed {
                        command_id,
                        action: action.to_string(),
                        error: error.clone(),
                    })
                    .await;
                Err(error)
            }
        }
    }

    async fn get_session(&self, session_id: &str) -> Result<CdpSessionHandle, String> {
        self.sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| format!("未找到 session_id={session_id}"))
    }

    async fn session_states_by_profile_key(&self, profile_key: &str) -> Vec<CdpSessionState> {
        let session_handles = self
            .sessions
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        let mut matches = Vec::new();
        for session in session_handles {
            let state = session.state().await;
            if state.profile_key == profile_key {
                matches.push(state);
            }
        }
        matches
    }
}
