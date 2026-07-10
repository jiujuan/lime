use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt;
use uuid::Uuid;

use crate::tool_definition::RuntimeToolDefinition;

#[path = "collab_agent/execution.rs"]
mod execution;
#[path = "collab_agent/projection.rs"]
mod projection;
#[path = "collab_agent/validation.rs"]
mod validation;

pub use execution::{
    execute_collab_list_peers, execute_collab_send_message, execute_collab_spawn_agent,
    execute_collab_team_create, execute_collab_team_delete, CollabAgentExecutionBackend,
    CollabAgentTeamExecutionBackend, ResolvedCollabSendTarget, ResolvedCollabSendTargetKind,
    RuntimeCollabToolOutput, RuntimeTeamContext, RuntimeTeamMember, RuntimeTeamMemberState,
    RuntimeTeamState,
};
pub use projection::{
    list_peers_metadata, project_send_message_result, project_send_message_unsupported_bridge_peer,
    project_spawn_agent_result, team_create_metadata, team_delete_metadata, SendMessageDelivery,
    SendMessageToolProjection, SpawnAgentToolProjection,
};
pub use validation::{
    normalize_peer_address_target, send_message_requires_team_lead, validate_plan_approval_sender,
    validate_send_message_payload, validate_shutdown_response_target,
};

pub const AGENT_TOOL_NAME: &str = "Agent";
pub const SEND_MESSAGE_TOOL_NAME: &str = "SendMessage";
pub const TEAM_CREATE_TOOL_NAME: &str = "TeamCreate";
pub const TEAM_DELETE_TOOL_NAME: &str = "TeamDelete";
pub const LIST_PEERS_TOOL_NAME: &str = "ListPeers";
pub const TEAM_LEAD_NAME: &str = "team-lead";
pub const MAX_LOCAL_SESSION_PEERS: usize = 12;

pub const SEND_MESSAGE_LEGACY_ALIASES: &[&str] = &["SendMessageTool", "SendInput", "SendInputTool"];
pub const TEAM_CREATE_LEGACY_ALIASES: &[&str] = &["TeamCreateTool"];
pub const TEAM_DELETE_LEGACY_ALIASES: &[&str] = &["TeamDeleteTool"];
pub const LIST_PEERS_LEGACY_ALIASES: &[&str] = &["ListPeersTool"];

pub const AGENT_TOOL_DESCRIPTION: &str =
    "Launch a new agent. 适合把独立子问题委派给新的协作成员；创建后可结合 SendMessage 与 ListPeers 继续协作。";

pub const SEND_MESSAGE_DESCRIPTION: &str =
    "Send a message to another agent. 优先复用已有 agent 的上下文继续推进任务，而不是重复创建新 agent；当前 Lime runtime 支持直接发送给 agent id、命名子 session、活跃 team 内按名字或 `*` 广播路由，并支持 synthetic `uds:<session-id>` 本机会话投递。`bridge:` 远端 peer address 仍只做显式识别并返回未实现失败，因为 Lime 还没有 remote peer host / session ingress。";

pub const SEND_MESSAGE_TO_DESCRIPTION: &str =
    "目标 agent 标识。可传 agent id、命名子 session 名称；若当前 session 属于活跃 team，也可传 teammate 名称或 `*` 广播给所有其他 team 成员。本机会话 peer 请使用 ListPeers 返回的 `send_to`，形如 `uds:<session-id>`；`bridge:` 当前仍返回未实现失败，因为 Lime 还没有 remote peer host / session ingress。";

pub const LIST_PEERS_DESCRIPTION: &str =
    "列出当前可通过 SendMessage 直接通信的 peers。当前 Lime runtime 会先返回活跃 team 内成员，并优先暴露同一 working_dir 下 live 的本机顶层 session；若 live peers 不足，再回退最近本机会话。本机会话请使用 `send_to` 里的 synthetic `uds:<session-id>` 地址发送，不要把 `agent_id` 当作 peer address。`bridge:` remote peer 仍未进入 current，因为 Lime 还没有 remote peer host / session ingress。";

pub const TEAM_CREATE_DESCRIPTION: &str =
    "创建一个共享任务板和多代理协作上下文。只保留当前 team surface：创建后，同一 team 下的子代理会共享 task list，并可通过 SendMessage 用名字互相通信。";

pub const TEAM_DELETE_DESCRIPTION: &str =
    "删除当前 team 协作上下文；仅 team lead 可执行。若仍有活跃成员，工具会拒绝删除，要求先逐个关闭这些成员。";

pub const BRIDGE_PEER_UNSUPPORTED_MESSAGE: &str =
    "Known upstream peer address surface (`bridge:`), but the current Lime runtime does not expose cross-session remote peer messaging through SendMessage yet because Lime does not have a remote peer host / session ingress.";

pub fn collab_agent_tool_definitions() -> Vec<RuntimeToolDefinition> {
    [
        AGENT_TOOL_NAME,
        SEND_MESSAGE_TOOL_NAME,
        TEAM_CREATE_TOOL_NAME,
        TEAM_DELETE_TOOL_NAME,
        LIST_PEERS_TOOL_NAME,
    ]
    .into_iter()
    .filter_map(collab_agent_tool_definition)
    .collect()
}

pub fn collab_agent_tool_definition(tool_name: &str) -> Option<RuntimeToolDefinition> {
    match collab_agent_canonical_tool_name(tool_name)? {
        AGENT_TOOL_NAME => Some(RuntimeToolDefinition::new(
            AGENT_TOOL_NAME,
            AGENT_TOOL_DESCRIPTION,
            agent_input_schema(),
        )),
        SEND_MESSAGE_TOOL_NAME => Some(RuntimeToolDefinition::new(
            SEND_MESSAGE_TOOL_NAME,
            SEND_MESSAGE_DESCRIPTION,
            send_message_input_schema(),
        )),
        TEAM_CREATE_TOOL_NAME => Some(RuntimeToolDefinition::new(
            TEAM_CREATE_TOOL_NAME,
            TEAM_CREATE_DESCRIPTION,
            team_create_input_schema(),
        )),
        TEAM_DELETE_TOOL_NAME => Some(RuntimeToolDefinition::new(
            TEAM_DELETE_TOOL_NAME,
            TEAM_DELETE_DESCRIPTION,
            team_delete_input_schema(),
        )),
        LIST_PEERS_TOOL_NAME => Some(RuntimeToolDefinition::new(
            LIST_PEERS_TOOL_NAME,
            LIST_PEERS_DESCRIPTION,
            list_peers_input_schema(),
        )),
        _ => None,
    }
}

pub fn collab_agent_canonical_tool_name(tool_name: &str) -> Option<&'static str> {
    let trimmed = tool_name.trim();
    if trimmed.is_empty() {
        return None;
    }

    collab_agent_canonical_tool_name_direct(trimmed).or_else(|| {
        model_visible_namespace_tail(trimmed).and_then(collab_agent_canonical_tool_name_direct)
    })
}

fn collab_agent_canonical_tool_name_direct(tool_name: &str) -> Option<&'static str> {
    for canonical in [
        AGENT_TOOL_NAME,
        SEND_MESSAGE_TOOL_NAME,
        TEAM_CREATE_TOOL_NAME,
        TEAM_DELETE_TOOL_NAME,
        LIST_PEERS_TOOL_NAME,
    ] {
        if tool_name.eq_ignore_ascii_case(canonical) {
            return Some(canonical);
        }
    }

    for alias in SEND_MESSAGE_LEGACY_ALIASES {
        if tool_name.eq_ignore_ascii_case(alias) {
            return Some(SEND_MESSAGE_TOOL_NAME);
        }
    }
    for alias in TEAM_CREATE_LEGACY_ALIASES {
        if tool_name.eq_ignore_ascii_case(alias) {
            return Some(TEAM_CREATE_TOOL_NAME);
        }
    }
    for alias in TEAM_DELETE_LEGACY_ALIASES {
        if tool_name.eq_ignore_ascii_case(alias) {
            return Some(TEAM_DELETE_TOOL_NAME);
        }
    }
    for alias in LIST_PEERS_LEGACY_ALIASES {
        if tool_name.eq_ignore_ascii_case(alias) {
            return Some(LIST_PEERS_TOOL_NAME);
        }
    }

    None
}

fn model_visible_namespace_tail(name: &str) -> Option<&str> {
    for prefix in [
        "functions.",
        "functions__",
        "function.",
        "function__",
        "tools.",
        "tools__",
        "tool.",
        "tool__",
        "native.",
        "native__",
        "builtin.",
        "builtin__",
    ] {
        if name
            .get(..prefix.len())
            .is_some_and(|head| head.eq_ignore_ascii_case(prefix))
        {
            let tail = name[prefix.len()..].trim();
            if !tail.is_empty() {
                return Some(tail);
            }
        }
    }

    None
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollabAgentSurfaceErrorKind {
    InvalidParams,
    ExecutionFailed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollabAgentSurfaceError {
    kind: CollabAgentSurfaceErrorKind,
    message: String,
}

impl CollabAgentSurfaceError {
    pub fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            kind: CollabAgentSurfaceErrorKind::InvalidParams,
            message: message.into(),
        }
    }

    pub fn execution_failed(message: impl Into<String>) -> Self {
        Self {
            kind: CollabAgentSurfaceErrorKind::ExecutionFailed,
            message: message.into(),
        }
    }

    pub fn kind(&self) -> CollabAgentSurfaceErrorKind {
        self.kind
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for CollabAgentSurfaceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for CollabAgentSurfaceError {}

pub type CollabAgentSurfaceResult<T> = Result<T, CollabAgentSurfaceError>;

#[derive(Debug, Clone, PartialEq)]
pub struct SpawnAgentToolRequest {
    pub request: SpawnAgentRequest,
    pub description: String,
    pub prompt: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PeerAddressScheme {
    Uds,
    Bridge,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedPeerAddress {
    pub scheme: PeerAddressScheme,
    pub target: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
pub struct FrontmatterHooks {
    pub custom: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SpawnAgentRequest {
    pub parent_session_id: String,
    pub message: String,
    pub name: Option<String>,
    #[serde(alias = "team_name")]
    pub team_name: Option<String>,
    #[serde(alias = "agent_type")]
    pub agent_type: Option<String>,
    pub model: Option<String>,
    #[serde(default, alias = "run_in_background")]
    pub run_in_background: bool,
    #[serde(alias = "reasoning_effort")]
    pub reasoning_effort: Option<String>,
    #[serde(alias = "fork_context")]
    pub fork_context: bool,
    #[serde(alias = "blueprint_role_id")]
    pub blueprint_role_id: Option<String>,
    #[serde(alias = "blueprint_role_label")]
    pub blueprint_role_label: Option<String>,
    #[serde(alias = "profile_id")]
    pub profile_id: Option<String>,
    #[serde(alias = "profile_name")]
    pub profile_name: Option<String>,
    #[serde(alias = "role_key")]
    pub role_key: Option<String>,
    #[serde(default, alias = "skill_ids")]
    pub skill_ids: Vec<String>,
    #[serde(default, alias = "skill_directories")]
    pub skill_directories: Vec<String>,
    #[serde(alias = "team_preset_id")]
    pub team_preset_id: Option<String>,
    pub theme: Option<String>,
    #[serde(alias = "system_overlay")]
    pub system_overlay: Option<String>,
    #[serde(alias = "output_contract")]
    pub output_contract: Option<String>,
    #[serde(default)]
    pub hooks: Option<FrontmatterHooks>,
    #[serde(default, alias = "allowed_tools")]
    pub allowed_tools: Vec<String>,
    #[serde(default, alias = "disallowed_tools")]
    pub disallowed_tools: Vec<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub isolation: Option<String>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SpawnAgentResponse {
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nickname: Option<String>,
    #[serde(flatten, default)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AgentInput {
    pub description: String,
    pub prompt: String,
    #[serde(default, alias = "subagent_type")]
    pub subagent_type: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default, alias = "run_in_background")]
    pub run_in_background: bool,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, alias = "team_name")]
    pub team_name: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub isolation: Option<String>,
    #[serde(default, alias = "reasoning_effort")]
    pub reasoning_effort: Option<String>,
    #[serde(default, alias = "fork_context")]
    pub fork_context: bool,
    #[serde(default, alias = "allowed_tools")]
    pub allowed_tools: Vec<String>,
    #[serde(default, alias = "disallowed_tools")]
    pub disallowed_tools: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
}

pub fn spawn_agent_request_from_input(
    input: AgentInput,
    parent_session_id: String,
) -> CollabAgentSurfaceResult<SpawnAgentToolRequest> {
    let description = normalize_required_text(&input.description, "description")?;
    let prompt = normalize_required_text(&input.prompt, "prompt")?;

    Ok(SpawnAgentToolRequest {
        request: SpawnAgentRequest {
            parent_session_id,
            message: prompt.clone(),
            name: normalize_optional_text(input.name),
            team_name: normalize_optional_text(input.team_name),
            agent_type: normalize_optional_text(input.subagent_type),
            model: normalize_optional_text(input.model),
            run_in_background: input.run_in_background,
            reasoning_effort: normalize_optional_text(input.reasoning_effort),
            fork_context: input.fork_context,
            blueprint_role_id: None,
            blueprint_role_label: None,
            profile_id: None,
            profile_name: None,
            role_key: None,
            skill_ids: Vec::new(),
            skill_directories: Vec::new(),
            team_preset_id: None,
            theme: None,
            system_overlay: None,
            output_contract: None,
            hooks: None,
            allowed_tools: normalize_optional_vec(&input.allowed_tools),
            disallowed_tools: normalize_optional_vec(&input.disallowed_tools),
            mode: normalize_optional_text(input.mode),
            isolation: normalize_optional_text(input.isolation),
            cwd: normalize_optional_text(input.cwd),
        },
        description,
        prompt,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendInputRequest {
    pub id: String,
    pub message: String,
    #[serde(default)]
    pub interrupt: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SendMessageInput {
    pub to: String,
    #[serde(default)]
    pub summary: Option<String>,
    pub message: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StructuredMessage {
    ShutdownRequest {
        #[serde(default)]
        reason: Option<String>,
    },
    ShutdownResponse {
        request_id: String,
        approve: bool,
        #[serde(default)]
        reason: Option<String>,
    },
    PlanApprovalResponse {
        request_id: String,
        approve: bool,
        #[serde(default)]
        feedback: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MessageRouting {
    pub sender: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_color: Option<String>,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MessageOutput {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routing: Option<MessageRouting>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BroadcastOutput {
    pub success: bool,
    pub message: String,
    pub recipients: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routing: Option<MessageRouting>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RequestOutput {
    pub success: bool,
    pub message: String,
    #[serde(rename = "request_id")]
    pub request_id: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ResponseOutput {
    pub success: bool,
    pub message: String,
    #[serde(rename = "request_id", skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

pub type SendMessageOutput = Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SendInputResponse {
    pub submission_id: String,
    #[serde(flatten, default)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct TeamCreateInput {
    #[serde(alias = "team_name")]
    pub team_name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, alias = "agent_type")]
    pub agent_type: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TeamCreateOutput {
    #[serde(rename = "team_name")]
    pub team_name: String,
    #[serde(rename = "team_file_path")]
    pub team_file_path: String,
    #[serde(rename = "lead_agent_id")]
    pub lead_agent_id: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TeamDeleteInput {}

#[derive(Debug, Clone, Serialize)]
pub struct TeamDeleteOutput {
    pub success: bool,
    pub message: String,
    #[serde(rename = "team_name", skip_serializing_if = "Option::is_none")]
    pub team_name: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListPeersInput {}

#[derive(Debug, Clone, Serialize)]
pub struct PeerDescriptor {
    pub name: String,
    #[serde(rename = "agent_id")]
    pub agent_id: String,
    #[serde(rename = "agent_type", skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
    #[serde(rename = "is_lead")]
    pub is_lead: bool,
    #[serde(rename = "send_to")]
    pub send_to: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ListPeersOutput {
    #[serde(rename = "team_name", skip_serializing_if = "Option::is_none")]
    pub team_name: Option<String>,
    pub peers: Vec<PeerDescriptor>,
}

pub fn agent_input_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "description": { "type": "string", "description": "3-5 个词的任务标题，用于展示与回顾。" },
            "prompt": { "type": "string", "description": "发给子代理的完整任务说明。" },
            "subagent_type": { "type": "string", "description": "可选子代理类型，例如 explorer / planner / executor。" },
            "model": { "type": "string", "description": "可选模型覆盖。" },
            "run_in_background": { "type": "boolean", "description": "是否在后台启动子代理。" },
            "name": { "type": "string", "description": "可选名字；创建后可通过 SendMessage({to: name}) 继续沟通。" },
            "team_name": { "type": "string", "description": "可选 team 名称；未传时沿用当前 team 上下文。" },
            "mode": { "type": "string", "description": "可选权限模式；当前 runtime 是否支持由宿主决定。" },
            "isolation": { "type": "string", "enum": ["worktree", "remote"], "description": "可选隔离模式；当前 runtime 是否支持由宿主决定。" },
            "allowed_tools": {
                "type": "array",
                "items": { "type": "string" },
                "description": "可选子代理工具白名单；当前 runtime 会把它下沉到 session 级真实权限限制。"
            },
            "disallowed_tools": {
                "type": "array",
                "items": { "type": "string" },
                "description": "可选子代理工具黑名单；优先级高于 allowed_tools。"
            },
            "reasoning_effort": { "type": "string", "description": "可选推理强度覆盖。" },
            "fork_context": { "type": "boolean", "description": "是否复制当前上下文给子代理。" },
            "cwd": { "type": "string", "description": "可选工作目录绝对路径。" }
        },
        "required": ["description", "prompt"],
        "additionalProperties": false
    })
}

pub fn send_message_input_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "to": { "type": "string", "description": SEND_MESSAGE_TO_DESCRIPTION },
            "summary": { "type": "string", "description": "纯字符串 team / agent 消息必填的 5-10 词预览摘要；显式 `uds:<session-id>` 本机会话投递可省略。当前 runtime 仅保留到 metadata，不参与路由。" },
            "message": {
                "description": "发送给目标 agent 的消息内容。字符串会直接发送；结构化 JSON 会被序列化为字符串后发送。",
                "oneOf": [
                    { "type": "string" },
                    { "type": "object" },
                    { "type": "array", "items": {} },
                    { "type": "number" },
                    { "type": "boolean" },
                    { "type": "null" }
                ]
            }
        },
        "required": ["to", "message"],
        "additionalProperties": false
    })
}

pub fn team_create_input_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "team_name": { "type": "string", "description": "要创建的 team 名称。不能为空，会作为共享 task list id。" },
            "description": { "type": "string", "description": "可选 team 描述。" },
            "agent_type": { "type": "string", "description": "可选 team lead 角色提示。" }
        },
        "required": ["team_name"],
        "additionalProperties": false
    })
}

pub fn team_delete_input_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false
    })
}

pub fn list_peers_input_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false
    })
}

pub fn parse_peer_address(target: &str) -> Option<ParsedPeerAddress> {
    if let Some(value) = target.strip_prefix("uds:") {
        return Some(ParsedPeerAddress {
            scheme: PeerAddressScheme::Uds,
            target: value.trim().to_string(),
        });
    }
    if let Some(value) = target.strip_prefix("bridge:") {
        return Some(ParsedPeerAddress {
            scheme: PeerAddressScheme::Bridge,
            target: value.trim().to_string(),
        });
    }

    None
}

pub fn is_cross_session_local_peer_address(address: &ParsedPeerAddress) -> bool {
    address.scheme == PeerAddressScheme::Uds
}

pub fn peer_address_scheme_key(scheme: PeerAddressScheme) -> &'static str {
    match scheme {
        PeerAddressScheme::Bridge => "bridge",
        PeerAddressScheme::Uds => "uds",
    }
}

pub fn normalize_required_text(value: &str, field_name: &str) -> CollabAgentSurfaceResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(CollabAgentSurfaceError::invalid_params(format!(
            "{field_name} 不能为空"
        )));
    }

    Ok(trimmed.to_string())
}

pub fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

pub fn normalize_optional_vec(values: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    let mut seen = BTreeSet::new();

    for value in values {
        let Some(item) = normalize_optional_text(Some(value.clone())) else {
            continue;
        };
        if seen.insert(item.clone()) {
            normalized.push(item);
        }
    }

    normalized
}

pub fn pretty_json<T: Serialize>(value: &T) -> CollabAgentSurfaceResult<String> {
    serde_json::to_string_pretty(value).map_err(|error| {
        CollabAgentSurfaceError::execution_failed(format!("序列化结果失败: {error}"))
    })
}

pub fn generate_request_id(prefix: &str, target: &str) -> String {
    format!(
        "{prefix}-{}@{target}",
        chrono::Utc::now().timestamp_millis()
    )
}

pub fn build_shutdown_request_delivery_message(
    target: &str,
    reason: Option<String>,
) -> CollabAgentSurfaceResult<(String, String)> {
    let request_id = generate_request_id("shutdown", target);
    let message = serde_json::to_string(&json!({
        "type": "shutdown_request",
        "request_id": request_id,
        "reason": reason,
    }))
    .map_err(|error| {
        CollabAgentSurfaceError::invalid_params(format!(
            "SendMessage 无法序列化 shutdown_request: {error}"
        ))
    })?;

    Ok((message, request_id))
}

pub fn build_shutdown_response_delivery_message(
    sender: &str,
    request_id: &str,
    approve: bool,
    reason: Option<&str>,
) -> CollabAgentSurfaceResult<String> {
    serde_json::to_string(&if approve {
        json!({
            "type": "shutdown_approved",
            "request_id": request_id,
            "from": sender,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })
    } else {
        json!({
            "type": "shutdown_rejected",
            "request_id": request_id,
            "from": sender,
            "reason": reason.unwrap_or_default(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })
    })
    .map_err(|error| {
        CollabAgentSurfaceError::invalid_params(format!(
            "SendMessage 无法序列化 shutdown_response: {error}"
        ))
    })
}

pub fn serialize_structured_message(value: &Value) -> CollabAgentSurfaceResult<String> {
    serde_json::to_string(value).map_err(|error| {
        CollabAgentSurfaceError::invalid_params(format!(
            "SendMessage 无法序列化结构化消息: {error}"
        ))
    })
}

pub fn message_value_to_delivery_text(value: Value) -> CollabAgentSurfaceResult<String> {
    match value {
        Value::String(text) => normalize_required_text(&text, "message"),
        other => Ok(serialize_structured_message(&other)?.trim().to_string()),
    }
}

pub fn build_cross_session_sender_address(session_id: &str) -> String {
    format!("uds:{}", session_id.trim())
}

fn escape_xml_attribute(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub fn build_cross_session_message(sender: &str, message: &str) -> String {
    format!(
        "<cross-session-message from=\"{}\">\n{}\n</cross-session-message>",
        escape_xml_attribute(sender),
        message
    )
}

pub fn build_teammate_message(sender: &str, summary: Option<&str>, message: &str) -> String {
    let summary_attr = summary
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!(" summary=\"{}\"", escape_xml_attribute(value)))
        .unwrap_or_default();
    format!(
        "<teammate-message teammate_id=\"{}\"{}>\n{}\n</teammate-message>",
        escape_xml_attribute(sender),
        summary_attr,
        message
    )
}

pub fn split_team_display_id(target: &str) -> Option<(&str, &str)> {
    let (name, team_name) = target.split_once('@')?;
    let name = name.trim();
    let team_name = team_name.trim();
    if name.is_empty() || team_name.is_empty() {
        None
    } else {
        Some((name, team_name))
    }
}

pub fn format_team_agent_id(name: &str, team_name: &str) -> String {
    format!("{name}@{team_name}")
}

pub fn sanitize_team_name(name: &str) -> String {
    name.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect()
}

pub fn team_config_relative_path(team_name: &str) -> String {
    format!("teams/{}/config.json", sanitize_team_name(team_name))
}

pub fn generate_team_name_slug() -> String {
    const ADJECTIVES: &[&str] = &[
        "amber", "brisk", "clear", "cosmic", "eager", "gentle", "lively", "mellow", "nimble",
        "solar", "steady", "vivid",
    ];
    const VERBS: &[&str] = &[
        "building", "charting", "crafting", "drifting", "guiding", "mapping", "racing", "shaping",
        "sparking", "spinning", "tracking", "weaving",
    ];
    const NOUNS: &[&str] = &[
        "anchor",
        "atlas",
        "beacon",
        "bridge",
        "comet",
        "harbor",
        "lighthouse",
        "meadow",
        "orbit",
        "signal",
        "summit",
        "voyager",
    ];

    let seed = Uuid::new_v4().into_bytes();
    let adjective = ADJECTIVES[usize::from(seed[0]) % ADJECTIVES.len()];
    let verb = VERBS[usize::from(seed[1]) % VERBS.len()];
    let noun = NOUNS[usize::from(seed[2]) % NOUNS.len()];
    format!("{adjective}-{verb}-{noun}")
}

#[cfg(test)]
mod tests;
