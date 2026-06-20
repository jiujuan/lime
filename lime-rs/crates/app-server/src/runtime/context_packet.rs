use serde_json::{json, Map, Value};

const CONTEXT_PACKET_SCHEMA: &str = "context_packet.v1";
const CONTEXT_ASSEMBLY_SCHEMA: &str = "context_packet_assembly.v1";
const HARD_PACKET_MAX_TOKENS: usize = 10_000;
const CHARS_PER_TOKEN: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ContextPacketKind {
    LongTermMemorySummary,
    InteractionSoul,
    SessionContextCompaction,
}

impl ContextPacketKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::LongTermMemorySummary => "long_term_memory_summary",
            Self::InteractionSoul => "interaction_soul",
            Self::SessionContextCompaction => "session_context_compaction",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ContextSource {
    MemoryStore,
    MemorySoul,
    SessionCompaction,
}

impl ContextSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::MemoryStore => "memory.store",
            Self::MemorySoul => "memory.soul",
            Self::SessionCompaction => "session.compaction",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ContextScope {
    Global,
    Workspace,
    InteractionOnly,
    Session,
}

impl ContextScope {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Global => "global",
            Self::Workspace => "workspace",
            Self::InteractionOnly => "interaction_only",
            Self::Session => "session",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ContextRole {
    Developer,
}

impl ContextRole {
    fn as_str(self) -> &'static str {
        match self {
            Self::Developer => "developer",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ContextTrustLevel {
    UserMaintained,
    AppConfig,
    RuntimeGenerated,
}

impl ContextTrustLevel {
    fn as_str(self) -> &'static str {
        match self {
            Self::UserMaintained => "user_maintained",
            Self::AppConfig => "app_config",
            Self::RuntimeGenerated => "runtime_generated",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ContextSensitivity {
    Private,
    InteractionPreference,
    SessionContext,
}

impl ContextSensitivity {
    fn as_str(self) -> &'static str {
        match self {
            Self::Private => "private",
            Self::InteractionPreference => "interaction_preference",
            Self::SessionContext => "session_context",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ContextPacket {
    id: String,
    kind: ContextPacketKind,
    source: ContextSource,
    scope: ContextScope,
    role: ContextRole,
    trust_level: ContextTrustLevel,
    sensitivity: ContextSensitivity,
    token_budget: usize,
    content: String,
    input_truncated: bool,
    metadata: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AdmittedContextPacket {
    pub(crate) id: String,
    pub(crate) content: String,
    pub(crate) token_count: usize,
    pub(crate) truncated: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ContextAssembly {
    pub(crate) rendered: Option<String>,
    pub(crate) telemetry: Value,
    pub(crate) admitted_packets: Vec<AdmittedContextPacket>,
}

impl ContextPacket {
    pub(crate) fn memory_summary(
        content: impl Into<String>,
        scope: ContextScope,
        token_budget: usize,
        input_truncated: bool,
        metadata: Map<String, Value>,
    ) -> Self {
        Self {
            id: "memory.summary".to_string(),
            kind: ContextPacketKind::LongTermMemorySummary,
            source: ContextSource::MemoryStore,
            scope,
            role: ContextRole::Developer,
            trust_level: ContextTrustLevel::UserMaintained,
            sensitivity: ContextSensitivity::Private,
            token_budget,
            content: content.into(),
            input_truncated,
            metadata,
        }
    }

    pub(crate) fn interaction_soul(
        content: impl Into<String>,
        token_budget: usize,
        metadata: Map<String, Value>,
    ) -> Self {
        Self {
            id: "memory.soul".to_string(),
            kind: ContextPacketKind::InteractionSoul,
            source: ContextSource::MemorySoul,
            scope: ContextScope::InteractionOnly,
            role: ContextRole::Developer,
            trust_level: ContextTrustLevel::AppConfig,
            sensitivity: ContextSensitivity::InteractionPreference,
            token_budget,
            content: content.into(),
            input_truncated: false,
            metadata,
        }
    }

    pub(crate) fn session_compaction(
        content: impl Into<String>,
        token_budget: usize,
        metadata: Map<String, Value>,
    ) -> Self {
        Self {
            id: "session.context_compaction".to_string(),
            kind: ContextPacketKind::SessionContextCompaction,
            source: ContextSource::SessionCompaction,
            scope: ContextScope::Session,
            role: ContextRole::Developer,
            trust_level: ContextTrustLevel::RuntimeGenerated,
            sensitivity: ContextSensitivity::SessionContext,
            token_budget,
            content: content.into(),
            input_truncated: false,
            metadata,
        }
    }
}

struct PacketAdmission {
    packet: ContextPacket,
    content: Option<String>,
    token_count: usize,
    truncated: bool,
    rejected_reason: Option<&'static str>,
}

pub(crate) fn assemble_context_packets(packets: Vec<ContextPacket>) -> ContextAssembly {
    let admissions = packets.into_iter().map(admit_packet).collect::<Vec<_>>();
    let mut blocks = Vec::new();
    let mut admitted_packets = Vec::new();
    let mut telemetry_packets = Vec::with_capacity(admissions.len());
    let mut total_tokens = 0usize;

    for admission in admissions {
        let admitted = admission.rejected_reason.is_none();
        if let Some(content) = admission.content.as_ref() {
            blocks.push(render_packet(
                &admission.packet,
                content,
                admission.truncated,
            ));
            admitted_packets.push(AdmittedContextPacket {
                id: admission.packet.id.clone(),
                content: content.clone(),
                token_count: admission.token_count,
                truncated: admission.truncated,
            });
            total_tokens = total_tokens.saturating_add(admission.token_count);
        }
        telemetry_packets.push(json!({
            "schema": CONTEXT_PACKET_SCHEMA,
            "id": admission.packet.id,
            "kind": admission.packet.kind.as_str(),
            "source": admission.packet.source.as_str(),
            "scope": admission.packet.scope.as_str(),
            "role": admission.packet.role.as_str(),
            "trustLevel": admission.packet.trust_level.as_str(),
            "sensitivity": admission.packet.sensitivity.as_str(),
            "tokenBudget": effective_token_budget(admission.packet.token_budget),
            "actualTokens": admission.token_count,
            "inputTruncated": admission.packet.input_truncated,
            "truncated": admission.truncated,
            "admitted": admitted,
            "rejectedReason": admission.rejected_reason,
        }));
    }

    let admitted_count = admitted_packets.len();
    let packet_count = telemetry_packets.len();
    ContextAssembly {
        rendered: (!blocks.is_empty()).then(|| blocks.join("\n\n")),
        telemetry: json!({
            "schema": CONTEXT_ASSEMBLY_SCHEMA,
            "packetCount": packet_count,
            "admittedCount": admitted_count,
            "rejectedCount": packet_count.saturating_sub(admitted_count),
            "totalTokens": total_tokens,
            "hardPacketMaxTokens": HARD_PACKET_MAX_TOKENS,
            "packets": telemetry_packets,
        }),
        admitted_packets,
    }
}

fn admit_packet(packet: ContextPacket) -> PacketAdmission {
    let normalized = packet.content.trim().to_string();
    if normalized.is_empty() {
        return PacketAdmission {
            packet,
            content: None,
            token_count: 0,
            truncated: false,
            rejected_reason: Some("empty"),
        };
    }
    if contains_secret_like_content(&normalized) {
        let token_count = approx_token_count(&normalized);
        return PacketAdmission {
            packet,
            content: None,
            token_count,
            truncated: false,
            rejected_reason: Some("secret_like"),
        };
    }

    let token_budget = effective_token_budget(packet.token_budget);
    let token_count = approx_token_count(&normalized);
    let (content, token_count, truncated) = if token_count > token_budget {
        let content = truncate_to_token_budget(&normalized, token_budget);
        let token_count = approx_token_count(&content);
        (content, token_count, true)
    } else {
        (normalized, token_count, false)
    };

    PacketAdmission {
        packet,
        content: Some(content),
        token_count,
        truncated,
        rejected_reason: None,
    }
}

fn render_packet(packet: &ContextPacket, content: &str, truncated: bool) -> String {
    match packet.kind {
        ContextPacketKind::LongTermMemorySummary => {
            render_memory_summary(packet, content, truncated)
        }
        ContextPacketKind::InteractionSoul => render_interaction_soul(packet, content, truncated),
        ContextPacketKind::SessionContextCompaction => {
            render_session_context_compaction(packet, content, truncated)
        }
    }
}

fn render_memory_summary(packet: &ContextPacket, content: &str, truncated: bool) -> String {
    let path = string_metadata(packet, "path").unwrap_or("memory_summary.md");
    let scope = string_metadata(packet, "scope").unwrap_or_else(|| packet.scope.as_str());
    let start_line = u64_metadata(packet, "startLineNumber").unwrap_or(1);
    let end_line = u64_metadata(packet, "endLineNumber").unwrap_or(start_line);
    let truncated_hint = if packet.input_truncated || truncated {
        "\n- 该摘要已被截断；如当前任务需要更多长期记忆，请优先使用 memory tools 进行 search/read，并保留 citation。"
    } else {
        ""
    };
    let budget_hint = if truncated {
        "\n- 该上下文包已按单包预算截断；不要推断被截断部分的内容。"
    } else {
        ""
    };

    format!(
        "## Long-Term Memory Summary\n\
         来源：memory store `{path}`，scope `{scope}`，lines {start_line}-{end_line}。\n\
         这些内容是长期记忆摘要，不是用户本轮输入；只在与当前任务明显相关时使用。不要把摘要当成绝对事实；需要更多细节时使用 memory tools search/read，并在结果中保留 citation。{truncated_hint}{budget_hint}\n\
         \n\
         ```memory-summary\n{content}\n```"
    )
}

fn render_interaction_soul(packet: &ContextPacket, content: &str, truncated: bool) -> String {
    let scope = string_metadata(packet, "scope").unwrap_or_else(|| packet.scope.as_str());
    let budget_hint = if truncated {
        "\n该上下文包已按单包预算截断；不要推断被截断部分的内容。"
    } else {
        ""
    };

    format!(
        "## Interaction Soul\n\
         来源：saved app config `memory.soul`，scope `{scope}`。\n\
         这些内容只影响对话方式和协作节奏，不是用户本轮输入，也不是长期事实。正式 artifact / 创作声线只能使用显式 generation brief；不要从这里推断或写入 artifact voice。{budget_hint}\n\
        {content}"
    )
}

fn render_session_context_compaction(
    packet: &ContextPacket,
    content: &str,
    truncated: bool,
) -> String {
    let compaction_id = string_metadata(packet, "compactionId").unwrap_or("unknown");
    let context_epoch = u64_metadata(packet, "contextEpoch").unwrap_or(0);
    let tail_start_turn_id = string_metadata(packet, "tailStartTurnId").unwrap_or("unknown");
    let budget_hint = if truncated {
        "\n- 该压缩摘要已按单包预算截断；不要推断被截断部分的内容。"
    } else {
        ""
    };

    format!(
        "## Session Context Compaction\n\
         来源：session context artifact `{compaction_id}`，context epoch `{context_epoch}`，tail starts at `{tail_start_turn_id}`。\n\
         这些内容只用于当前会话续接，不是长期记忆，不是用户本轮输入，也不替代原始历史。需要精确信息时优先读取原始 thread / turn / tool evidence。不得把本摘要自动写入 memory store。{budget_hint}\n\
         \n\
         ```session-context-summary\n{content}\n```"
    )
}

fn effective_token_budget(token_budget: usize) -> usize {
    token_budget.clamp(1, HARD_PACKET_MAX_TOKENS)
}

fn truncate_to_token_budget(value: &str, token_budget: usize) -> String {
    let max_chars = token_budget.saturating_mul(CHARS_PER_TOKEN);
    value.chars().take(max_chars).collect::<String>()
}

fn approx_token_count(value: &str) -> usize {
    value.chars().count().saturating_add(CHARS_PER_TOKEN - 1) / CHARS_PER_TOKEN
}

fn contains_secret_like_content(value: &str) -> bool {
    if value.contains("-----BEGIN PRIVATE KEY-----") {
        return true;
    }
    if contains_prefixed_secret(value, "sk-", 20) {
        return true;
    }
    value.lines().any(line_has_secret_assignment)
}

fn contains_prefixed_secret(value: &str, prefix: &str, min_tail: usize) -> bool {
    let mut rest = value;
    while let Some(index) = rest.find(prefix) {
        let tail = &rest[index + prefix.len()..];
        let count = tail
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
            .count();
        if count >= min_tail {
            return true;
        }
        rest = &tail[count..];
    }
    false
}

fn line_has_secret_assignment(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    if lower.contains("bearer ") && secret_value_len_after(&lower, "bearer ") >= 16 {
        return true;
    }
    [
        "api_key",
        "apikey",
        "api key",
        "access_token",
        "refresh_token",
        "password",
        "authorization",
        "client_secret",
    ]
    .into_iter()
    .any(|key| {
        let Some(index) = lower.find(key) else {
            return false;
        };
        let rest = &line[index + key.len()..];
        let Some(separator_index) = rest.find([':', '=']) else {
            return false;
        };
        rest[separator_index + 1..].trim().len() >= 8
    })
}

fn secret_value_len_after(value: &str, marker: &str) -> usize {
    value
        .find(marker)
        .map(|index| value[index + marker.len()..].trim().len())
        .unwrap_or(0)
}

fn string_metadata<'a>(packet: &'a ContextPacket, key: &str) -> Option<&'a str> {
    packet
        .metadata
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn u64_metadata(packet: &ContextPacket, key: &str) -> Option<u64> {
    packet.metadata.get(key).and_then(Value::as_u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assembler_truncates_oversized_packet() {
        let packet = ContextPacket::memory_summary(
            "a".repeat(120),
            ContextScope::Workspace,
            10,
            false,
            Map::new(),
        );

        let assembly = assemble_context_packets(vec![packet]);

        assert_eq!(assembly.admitted_packets.len(), 1);
        assert!(assembly.admitted_packets[0].truncated);
        assert_eq!(assembly.admitted_packets[0].content.chars().count(), 40);
        assert_eq!(assembly.telemetry["packets"][0]["truncated"], true);
    }

    #[test]
    fn assembler_rejects_secret_like_packet() {
        let packet = ContextPacket::memory_summary(
            "api_key = abcdefghijklmnop",
            ContextScope::Global,
            100,
            false,
            Map::new(),
        );

        let assembly = assemble_context_packets(vec![packet]);

        assert!(assembly.rendered.is_none());
        assert_eq!(assembly.telemetry["packets"][0]["admitted"], false);
        assert_eq!(
            assembly.telemetry["packets"][0]["rejectedReason"].as_str(),
            Some("secret_like")
        );
    }
}
