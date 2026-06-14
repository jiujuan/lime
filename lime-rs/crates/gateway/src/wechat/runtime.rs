use super::api::get_updates;
use super::media::{
    body_from_item_list, find_media_item, resolve_account_data_dir, send_text_message,
};
use super::types::{WechatMessage, DEFAULT_BASE_URL, SESSION_EXPIRED_ERRCODE};
use crate::agent_runner::{GatewayAgentRunRequest, GatewayAgentRunnerHandle};
use chrono::Utc;
use lime_core::config::{Config, WechatAccountConfig, WechatBotConfig, WechatGroupConfig};
use lime_core::logger::LogStore;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const DEFAULT_POLL_TIMEOUT_MS: u64 = 35_000;
const MESSAGE_DEDUP_TTL_MS: i64 = 5 * 60 * 1_000;
const MESSAGE_DEDUP_MAX_ENTRIES: usize = 2_048;

type LogState = Arc<RwLock<LogStore>>;
type SessionRouteState = Arc<RwLock<HashMap<String, String>>>;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WechatGatewayAccountStatus {
    pub account_id: String,
    pub running: bool,
    pub started_at: Option<String>,
    pub last_error: Option<String>,
    pub last_update_at: Option<String>,
    pub last_message_at: Option<String>,
    pub sync_buf_present: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WechatGatewayStatus {
    pub running_accounts: usize,
    pub accounts: Vec<WechatGatewayAccountStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WechatProbeResult {
    pub account_id: String,
    pub ok: bool,
    pub message: String,
}

pub struct WechatGatewayState {
    inner: Arc<RwLock<WechatGatewayRuntime>>,
}

struct WechatGatewayRuntime {
    accounts: HashMap<String, AccountRuntimeHandle>,
}

struct AccountRuntimeHandle {
    stop_token: CancellationToken,
    task: JoinHandle<()>,
    status: Arc<RwLock<WechatGatewayAccountStatus>>,
}

impl Default for WechatGatewayState {
    fn default() -> Self {
        Self {
            inner: Arc::new(RwLock::new(WechatGatewayRuntime {
                accounts: HashMap::new(),
            })),
        }
    }
}

#[derive(Debug, Clone)]
struct ResolvedWechatAccount {
    account_id: String,
    base_url: String,
    bot_token: String,
    scanner_user_id: Option<String>,
    dm_policy: String,
    allow_from: HashSet<String>,
    group_policy: String,
    group_allow_from: HashSet<String>,
    groups: HashMap<String, WechatGroupConfig>,
}

#[derive(Debug, Clone)]
struct InboundMessage {
    from_user_id: String,
    group_id: Option<String>,
    text: String,
    context_token: Option<String>,
}

fn build_gateway_source_metadata(
    account: &ResolvedWechatAccount,
    inbound: &InboundMessage,
    media_present: bool,
) -> serde_json::Value {
    let remote_task_id = format!(
        "gateway:wechat:{}:{}:{}",
        account.account_id,
        inbound
            .group_id
            .as_deref()
            .unwrap_or(inbound.from_user_id.as_str()),
        Utc::now().timestamp_millis()
    );
    serde_json::json!({
        "remote_task": {
            "source": "gateway_channel",
            "channel": "wechat",
            "accountId": account.account_id.as_str(),
            "remoteTaskId": remote_task_id,
            "fromUserId": inbound.from_user_id.as_str(),
            "groupId": inbound.group_id.as_deref(),
            "mediaPresent": media_present,
            "agentCard": {
                "id": format!("wechat:{}", account.account_id),
                "name": "WeChat Remote",
                "provider": "wechat"
            }
        }
    })
}

#[derive(Default)]
struct WechatMessageDedupCache {
    seen: HashMap<String, i64>,
}

impl WechatMessageDedupCache {
    fn check_and_record(&mut self, message: &WechatMessage) -> Option<(String, bool)> {
        let key = build_wechat_message_dedup_key(message)?.into_owned();
        let now_ms = message
            .create_time_ms
            .unwrap_or_else(|| Utc::now().timestamp_millis());
        self.prune(now_ms);
        if self.seen.contains_key(key.as_str()) {
            return Some((key, true));
        }
        self.seen.insert(key.clone(), now_ms);
        if self.seen.len() > MESSAGE_DEDUP_MAX_ENTRIES {
            self.prune(now_ms);
        }
        Some((key, false))
    }

    fn prune(&mut self, now_ms: i64) {
        self.seen
            .retain(|_, created_ms| now_ms.saturating_sub(*created_ms) <= MESSAGE_DEDUP_TTL_MS);
    }
}

fn preview_inbound_text(text: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 120;
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return "<empty>".to_string();
    }
    let preview = trimmed.chars().take(MAX_PREVIEW_CHARS).collect::<String>();
    if trimmed.chars().count() > MAX_PREVIEW_CHARS {
        format!("{preview}...")
    } else {
        preview
    }
}

fn normalize_message_text_for_dedup(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn build_wechat_message_dedup_key(message: &WechatMessage) -> Option<Cow<'_, str>> {
    if let Some(message_id) = message.message_id {
        return Some(Cow::Owned(format!("message_id:{message_id}")));
    }
    if let Some(client_id) = message
        .client_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(Cow::Owned(format!("client_id:{client_id}")));
    }

    let from_user_id = message
        .from_user_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let created_ms = message.create_time_ms?;
    let normalized_text =
        normalize_message_text_for_dedup(&body_from_item_list(message.item_list.as_deref()));
    let context_token = message.context_token.as_deref().unwrap_or_default();
    let group_id = message.group_id.as_deref().unwrap_or_default();

    Some(Cow::Owned(format!(
        "fallback:{from_user_id}:{group_id}:{created_ms}:{context_token}:{normalized_text}"
    )))
}

pub async fn start_gateway(
    state: &WechatGatewayState,
    logs: LogState,
    agent_runner: GatewayAgentRunnerHandle,
    config: Config,
    account_filter: Option<String>,
    poll_timeout_secs: Option<u64>,
) -> Result<WechatGatewayStatus, String> {
    let state_inner = state.inner.clone();
    let accounts = resolve_wechat_accounts(&config, account_filter.as_deref())?;
    if accounts.is_empty() {
        return Err("没有可启动的微信账号，请检查 channels.wechat 配置".to_string());
    }
    let poll_timeout_ms = poll_timeout_secs
        .map(|value| value.saturating_mul(1_000))
        .unwrap_or(DEFAULT_POLL_TIMEOUT_MS)
        .clamp(5_000, 60_000);

    for account in accounts {
        let existing = {
            let runtime = state_inner.read().await;
            runtime.accounts.contains_key(&account.account_id)
        };
        if existing {
            continue;
        }
        let sync_buf_present = load_sync_buf(&account.account_id).is_some();
        let status = Arc::new(RwLock::new(WechatGatewayAccountStatus {
            account_id: account.account_id.clone(),
            running: true,
            started_at: Some(Utc::now().to_rfc3339()),
            last_error: None,
            last_update_at: None,
            last_message_at: None,
            sync_buf_present,
        }));
        let state_for_task = state_inner.clone();
        let status_for_task = status.clone();
        let logs_for_task = logs.clone();
        let runner_for_task = agent_runner.clone();
        let stop_token = CancellationToken::new();
        let stop_for_task = stop_token.clone();
        let account_for_task = account.clone();
        let task = tokio::spawn(async move {
            run_account_loop(
                state_for_task,
                status_for_task,
                logs_for_task,
                runner_for_task,
                account_for_task,
                poll_timeout_ms,
                stop_for_task,
            )
            .await;
        });
        let mut runtime = state_inner.write().await;
        runtime.accounts.insert(
            account.account_id.clone(),
            AccountRuntimeHandle {
                stop_token,
                task,
                status,
            },
        );
    }

    snapshot_status(state_inner).await
}

pub async fn stop_gateway(
    state: &WechatGatewayState,
    account_filter: Option<String>,
) -> Result<WechatGatewayStatus, String> {
    let state_inner = state.inner.clone();
    let mut handles = Vec::new();
    {
        let mut runtime = state_inner.write().await;
        if let Some(account_id) = account_filter {
            if let Some(handle) = runtime.accounts.remove(&account_id) {
                handles.push(handle);
            }
        } else {
            handles = runtime.accounts.drain().map(|(_, handle)| handle).collect();
        }
    }

    for handle in handles {
        handle.stop_token.cancel();
        let _ = handle.task.await;
    }

    snapshot_status(state_inner).await
}

pub async fn status_gateway(state: &WechatGatewayState) -> Result<WechatGatewayStatus, String> {
    snapshot_status(state.inner.clone()).await
}

pub async fn probe_gateway_account(
    config: &Config,
    account_filter: Option<String>,
) -> Result<WechatProbeResult, String> {
    let account = resolve_wechat_accounts(config, account_filter.as_deref())?
        .into_iter()
        .next()
        .ok_or_else(|| "没有可探测的微信账号".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1_500))
        .build()
        .map_err(|e| e.to_string())?;

    match get_updates(&client, &account.base_url, &account.bot_token, None, 1_500).await {
        Ok(resp)
            if resp.ret.unwrap_or(0) == 0 && resp.errcode.unwrap_or(0) == 0
                || resp.errcode == Some(SESSION_EXPIRED_ERRCODE) =>
        {
            Ok(WechatProbeResult {
                account_id: account.account_id,
                ok: true,
                message: "微信账号连通性正常。".to_string(),
            })
        }
        Ok(resp) => Ok(WechatProbeResult {
            account_id: account.account_id,
            ok: false,
            message: format!(
                "微信探测失败: ret={:?} errcode={:?} errmsg={}",
                resp.ret,
                resp.errcode,
                resp.errmsg.unwrap_or_default()
            ),
        }),
        Err(error) => Ok(WechatProbeResult {
            account_id: account.account_id,
            ok: false,
            message: format!("微信探测异常: {error}"),
        }),
    }
}

async fn snapshot_status(
    state: Arc<RwLock<WechatGatewayRuntime>>,
) -> Result<WechatGatewayStatus, String> {
    let handles = {
        let runtime = state.read().await;
        runtime
            .accounts
            .values()
            .map(|handle| handle.status.clone())
            .collect::<Vec<_>>()
    };
    let mut accounts = Vec::with_capacity(handles.len());
    for handle in handles {
        accounts.push(handle.read().await.clone());
    }
    Ok(WechatGatewayStatus {
        running_accounts: accounts.len(),
        accounts,
    })
}

async fn run_account_loop(
    state: Arc<RwLock<WechatGatewayRuntime>>,
    status: Arc<RwLock<WechatGatewayAccountStatus>>,
    logs: LogState,
    agent_runner: GatewayAgentRunnerHandle,
    account: ResolvedWechatAccount,
    poll_timeout_ms: u64,
    stop_token: CancellationToken,
) {
    logs.write().await.add(
        "info",
        &format!("[WechatGateway] account={} 开始轮询", account.account_id),
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(poll_timeout_ms + 10_000))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let session_route_state = Arc::new(RwLock::new(HashMap::new()));
    let mut get_updates_buf = load_sync_buf(&account.account_id).unwrap_or_default();
    let mut message_dedup = WechatMessageDedupCache::default();

    loop {
        if stop_token.is_cancelled() {
            break;
        }
        match get_updates(
            &client,
            &account.base_url,
            &account.bot_token,
            if get_updates_buf.is_empty() {
                None
            } else {
                Some(get_updates_buf.as_str())
            },
            poll_timeout_ms,
        )
        .await
        {
            Ok(resp) => {
                if resp.errcode == Some(SESSION_EXPIRED_ERRCODE)
                    || resp.ret == Some(SESSION_EXPIRED_ERRCODE)
                {
                    set_last_error(&status, "微信会话已过期，等待下次重试。".to_string()).await;
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    continue;
                }
                if resp.ret.unwrap_or(0) != 0 || resp.errcode.unwrap_or(0) != 0 {
                    set_last_error(
                        &status,
                        format!(
                            "微信拉取失败: ret={:?} errcode={:?} errmsg={}",
                            resp.ret,
                            resp.errcode,
                            resp.errmsg.unwrap_or_default()
                        ),
                    )
                    .await;
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
                if let Some(buf) = resp.get_updates_buf.filter(|value| !value.is_empty()) {
                    save_sync_buf(&account.account_id, &buf);
                    get_updates_buf = buf;
                    status.write().await.sync_buf_present = true;
                }
                status.write().await.last_update_at = Some(Utc::now().to_rfc3339());
                let messages = resp.msgs.unwrap_or_default();
                for message in messages {
                    if stop_token.is_cancelled() {
                        break;
                    }
                    if let Some((dedup_key, true)) = message_dedup.check_and_record(&message) {
                        logs.write().await.add(
                            "info",
                            &format!(
                                "[WechatGateway] account={} 跳过重复消息: dedup_key={} sender={}",
                                account.account_id,
                                dedup_key,
                                message.from_user_id.as_deref().unwrap_or("<unknown>")
                            ),
                        );
                        continue;
                    }
                    if let Err(error) = process_message(
                        &client,
                        &account,
                        &logs,
                        &agent_runner,
                        &session_route_state,
                        &message,
                    )
                    .await
                    {
                        set_last_error(&status, error.clone()).await;
                        logs.write().await.add(
                            "warn",
                            &format!(
                                "[WechatGateway] account={} 处理消息失败: {}",
                                account.account_id, error
                            ),
                        );
                    } else {
                        status.write().await.last_message_at = Some(Utc::now().to_rfc3339());
                    }
                }
            }
            Err(error) => {
                set_last_error(&status, error.clone()).await;
                logs.write().await.add(
                    "warn",
                    &format!(
                        "[WechatGateway] account={} 拉取更新失败: {}",
                        account.account_id, error
                    ),
                );
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }

    {
        let mut runtime = state.write().await;
        runtime.accounts.remove(&account.account_id);
    }
    status.write().await.running = false;
    logs.write().await.add(
        "info",
        &format!("[WechatGateway] account={} 已停止轮询", account.account_id),
    );
}

async fn set_last_error(status: &Arc<RwLock<WechatGatewayAccountStatus>>, error: String) {
    status.write().await.last_error = Some(error);
}

async fn process_message(
    client: &reqwest::Client,
    account: &ResolvedWechatAccount,
    logs: &LogState,
    agent_runner: &GatewayAgentRunnerHandle,
    session_route_state: &SessionRouteState,
    message: &WechatMessage,
) -> Result<(), String> {
    let from_user_id = message
        .from_user_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "微信消息缺少 from_user_id".to_string())?
        .to_string();
    let inbound = InboundMessage {
        from_user_id: from_user_id.clone(),
        group_id: message.group_id.clone(),
        text: body_from_item_list(message.item_list.as_deref()),
        context_token: message.context_token.clone(),
    };
    if !is_sender_allowed(account, &inbound) {
        logs.write().await.add(
            "info",
            &format!(
                "[WechatGateway] account={} sender={} 未通过策略，忽略消息",
                account.account_id, inbound.from_user_id
            ),
        );
        return Ok(());
    }

    if let Some(reply) = handle_local_command(account, &inbound, session_route_state).await? {
        return send_text_message(
            client,
            &account.base_url,
            &account.bot_token,
            &inbound.from_user_id,
            &reply,
            inbound.context_token.as_deref(),
        )
        .await;
    }

    let session_id = resolve_active_session_id(account, &inbound, session_route_state).await;
    let media_present = find_media_item(message.item_list.as_deref()).is_some();
    logs.write().await.add(
        "info",
        &format!(
            "[WechatGateway] account={} 通过 App Server current runner 处理消息: sender={} group={} session={} text_preview=\"{}\" media_present={}",
            account.account_id,
            inbound.from_user_id,
            inbound.group_id.as_deref().unwrap_or("<dm>"),
            session_id,
            preview_inbound_text(&inbound.text),
            media_present
        ),
    );

    if inbound.text.trim().is_empty() {
        return send_text_message(
            client,
            &account.base_url,
            &account.bot_token,
            &inbound.from_user_id,
            "收到消息，但没有可处理的文本。",
            inbound.context_token.as_deref(),
        )
        .await;
    }

    let response = agent_runner
        .run_agent_turn(GatewayAgentRunRequest {
            channel: "wechat".to_string(),
            account_id: account.account_id.clone(),
            session_id,
            input_text: inbound.text.clone(),
            metadata: build_gateway_source_metadata(account, &inbound, media_present),
            provider_preference: None,
            model_preference: None,
        })
        .await?;
    let reply = if response.reply_text.trim().is_empty() {
        format!(
            "已完成，但当前会话没有生成可发送文本。\nsession_id: {}\nturn_id: {}",
            response.session_id, response.turn_id
        )
    } else {
        response.reply_text
    };
    send_text_message(
        client,
        &account.base_url,
        &account.bot_token,
        &inbound.from_user_id,
        &reply,
        inbound.context_token.as_deref(),
    )
    .await
}

async fn handle_local_command(
    account: &ResolvedWechatAccount,
    inbound: &InboundMessage,
    session_route_state: &SessionRouteState,
) -> Result<Option<String>, String> {
    let text = inbound.text.trim();
    if text.eq_ignore_ascii_case("/help") {
        return Ok(Some("可用命令：/new、/help".to_string()));
    }
    if text == "/new" {
        let new_session_id = rotate_active_session_id(account, inbound, session_route_state).await;
        return Ok(Some(format!(
            "已开启新会话：{new_session_id}\n后续消息将进入新上下文。"
        )));
    }
    if text.starts_with("/new ") {
        return Ok(Some(
            "/new 不再接收首条消息；请先发送 /new，再直接发送下一条消息。".to_string(),
        ));
    }
    Ok(None)
}

fn build_session_scope(account: &ResolvedWechatAccount, inbound: &InboundMessage) -> String {
    if let Some(group_id) = inbound
        .group_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return format!(
            "wechat:group:{}:{}:{}",
            account.account_id, group_id, inbound.from_user_id
        );
    }
    format!("wechat:dm:{}:{}", account.account_id, inbound.from_user_id)
}

async fn resolve_active_session_id(
    account: &ResolvedWechatAccount,
    inbound: &InboundMessage,
    session_route_state: &SessionRouteState,
) -> String {
    let scope = build_session_scope(account, inbound);
    let state = session_route_state.read().await;
    state.get(&scope).cloned().unwrap_or(scope)
}

async fn rotate_active_session_id(
    account: &ResolvedWechatAccount,
    inbound: &InboundMessage,
    session_route_state: &SessionRouteState,
) -> String {
    let scope = build_session_scope(account, inbound);
    let rotated = format!("{scope}:new:{}", &Uuid::new_v4().to_string()[..8]);
    session_route_state
        .write()
        .await
        .insert(scope, rotated.clone());
    rotated
}

fn is_sender_allowed(account: &ResolvedWechatAccount, inbound: &InboundMessage) -> bool {
    let is_group = inbound
        .group_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some();
    if !is_group {
        return policy_allows(
            &account.dm_policy,
            &account.allow_from,
            &inbound.from_user_id,
            account.scanner_user_id.as_deref(),
        );
    }

    let group_config = inbound
        .group_id
        .as_deref()
        .and_then(|group_id| account.groups.get(group_id))
        .or_else(|| account.groups.get("*"));
    let policy = group_config
        .and_then(|config| config.group_policy.as_deref())
        .unwrap_or(&account.group_policy);
    let allow_from = if let Some(config) = group_config {
        if !config.allow_from.is_empty() {
            config.allow_from.iter().cloned().collect::<HashSet<_>>()
        } else if !account.group_allow_from.is_empty() {
            account.group_allow_from.clone()
        } else {
            account.allow_from.clone()
        }
    } else if !account.group_allow_from.is_empty() {
        account.group_allow_from.clone()
    } else {
        account.allow_from.clone()
    };
    policy_allows(
        policy,
        &allow_from,
        &inbound.from_user_id,
        account.scanner_user_id.as_deref(),
    )
}

fn policy_allows(
    policy: &str,
    allow_from: &HashSet<String>,
    sender_id: &str,
    scanner_user_id: Option<&str>,
) -> bool {
    match policy.trim().to_ascii_lowercase().as_str() {
        "disabled" => false,
        "open" | "pairing" => true,
        "allowlist" => {
            allow_from.contains("*")
                || allow_from.contains(sender_id)
                || scanner_user_id == Some(sender_id)
        }
        _ => false,
    }
}

fn resolve_wechat_accounts(
    config: &Config,
    account_filter: Option<&str>,
) -> Result<Vec<ResolvedWechatAccount>, String> {
    let wechat = &config.channels.wechat;
    let mut resolved = Vec::new();
    if !wechat.accounts.is_empty() {
        for (account_id, account) in &wechat.accounts {
            if !account.enabled {
                continue;
            }
            if let Some(filter) = account_filter {
                if filter != account_id {
                    continue;
                }
            }
            resolved.push(resolve_account_config(account_id, account, wechat)?);
        }
        return Ok(resolved);
    }

    if !wechat.bot_token.trim().is_empty() || !wechat.base_url.trim().is_empty() {
        let legacy_account_id = wechat
            .account_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("default");
        if account_filter
            .map(|filter| filter == legacy_account_id)
            .unwrap_or(true)
        {
            resolved.push(ResolvedWechatAccount {
                account_id: legacy_account_id.to_string(),
                base_url: if wechat.base_url.trim().is_empty() {
                    DEFAULT_BASE_URL.to_string()
                } else {
                    wechat.base_url.trim().to_string()
                },
                bot_token: wechat.bot_token.trim().to_string(),
                scanner_user_id: wechat.scanner_user_id.clone(),
                dm_policy: wechat.dm_policy.clone(),
                allow_from: wechat.allow_from.iter().cloned().collect(),
                group_policy: wechat.group_policy.clone(),
                group_allow_from: wechat.group_allow_from.iter().cloned().collect(),
                groups: wechat.groups.clone(),
            });
        }
    }

    Ok(resolved)
}

fn resolve_account_config(
    account_id: &str,
    account: &WechatAccountConfig,
    root: &WechatBotConfig,
) -> Result<ResolvedWechatAccount, String> {
    let base_url = account
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if root.base_url.trim().is_empty() {
                DEFAULT_BASE_URL
            } else {
                root.base_url.trim()
            }
        })
        .to_string();
    let bot_token = account
        .bot_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            root.bot_token
                .trim()
                .is_empty()
                .then_some("")
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| root.bot_token.trim());
    if bot_token.is_empty() {
        return Err(format!("微信账号 {} 缺少 bot_token", account_id));
    }
    Ok(ResolvedWechatAccount {
        account_id: account_id.to_string(),
        base_url,
        bot_token: bot_token.to_string(),
        scanner_user_id: account
            .scanner_user_id
            .clone()
            .or_else(|| root.scanner_user_id.clone()),
        dm_policy: account
            .dm_policy
            .clone()
            .unwrap_or_else(|| root.dm_policy.clone()),
        allow_from: if account.allow_from.is_empty() {
            root.allow_from.iter().cloned().collect()
        } else {
            account.allow_from.iter().cloned().collect()
        },
        group_policy: account
            .group_policy
            .clone()
            .unwrap_or_else(|| root.group_policy.clone()),
        group_allow_from: if account.group_allow_from.is_empty() {
            root.group_allow_from.iter().cloned().collect()
        } else {
            account.group_allow_from.iter().cloned().collect()
        },
        groups: if account.groups.is_empty() {
            root.groups.clone()
        } else {
            account.groups.clone()
        },
    })
}

fn sync_buf_path(account_id: &str) -> Result<PathBuf, String> {
    Ok(resolve_account_data_dir(account_id)?
        .join("cache")
        .join("get_updates_buf.txt"))
}

fn load_sync_buf(account_id: &str) -> Option<String> {
    let path = sync_buf_path(account_id).ok()?;
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn save_sync_buf(account_id: &str, value: &str) {
    if let Ok(path) = sync_buf_path(account_id) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(path, value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_wechat_message_dedup_key_prefers_message_id() {
        let message = WechatMessage {
            message_id: Some(42),
            client_id: Some("client-1".to_string()),
            from_user_id: Some("user-1".to_string()),
            create_time_ms: Some(1_700_000_000_000),
            ..WechatMessage::default()
        };

        let key = build_wechat_message_dedup_key(&message).unwrap();
        assert_eq!(key.as_ref(), "message_id:42");
    }

    #[test]
    fn build_wechat_message_dedup_key_falls_back_to_body_signature() {
        let message = WechatMessage {
            from_user_id: Some("user-1".to_string()),
            group_id: Some("group-1".to_string()),
            create_time_ms: Some(1_700_000_000_000),
            context_token: Some("ctx-1".to_string()),
            item_list: Some(vec![super::super::types::MessageItem {
                r#type: Some(super::super::types::MessageItemType::Text as i32),
                text_item: Some(super::super::types::TextItem {
                    text: Some(" 今天 的 天气 怎么样 ".to_string()),
                }),
                ..super::super::types::MessageItem::default()
            }]),
            ..WechatMessage::default()
        };

        let key = build_wechat_message_dedup_key(&message).unwrap();
        assert_eq!(
            key.as_ref(),
            "fallback:user-1:group-1:1700000000000:ctx-1:今天 的 天气 怎么样"
        );
    }
}
