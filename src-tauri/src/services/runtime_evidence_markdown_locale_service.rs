//! Runtime evidence Markdown 本地化文案。
//!
//! Facts JSON 保持稳定英文 key；这里仅承载导出 Markdown 的 presentation copy。

use std::env;

pub(crate) struct RuntimeEvidencePackMarkdownCopy {
    pub summary_artifact_title: &'static str,
    pub runtime_artifact_title: &'static str,
    pub timeline_artifact_title: &'static str,
    pub artifacts_artifact_title: &'static str,
    pub title: &'static str,
    pub intro: &'static str,
    pub session: &'static str,
    pub thread: &'static str,
    pub exported_at: &'static str,
    pub thread_status: &'static str,
    pub pending_request: &'static str,
    pub queued_turn: &'static str,
    pub latest_summary: &'static str,
    pub no_latest_summary: &'static str,
    pub evidence_overview: &'static str,
    pub turns: &'static str,
    pub timeline_items: &'static str,
    pub recent_artifacts: &'static str,
    pub controlled_get_evidence: &'static str,
    pub primary_blocking: &'static str,
    pub observability_coverage: &'static str,
    pub correlation_keys: &'static str,
    pub no_correlation_keys: &'static str,
    pub exported_signals: &'static str,
    pub evidence_gaps: &'static str,
    pub blocked_signals: &'static str,
    pub completion_audit: &'static str,
    pub decision: &'static str,
    pub automation_owner: &'static str,
    pub workspace_skill_tool_call: &'static str,
    pub artifact_evidence: &'static str,
    pub controlled_get_executed_suffix: &'static str,
    pub controlled_get_artifact: &'static str,
    pub blocking_reasons: &'static str,
    pub none: &'static str,
    pub audit_principle_label: &'static str,
    pub audit_principle: &'static str,
    pub reading_order: &'static str,
    pub read_summary: &'static str,
    pub read_runtime: &'static str,
    pub read_timeline: &'static str,
    pub read_artifacts: &'static str,
    pub known_gaps: &'static str,
}

pub(crate) fn runtime_evidence_pack_markdown_copy(
    locale: Option<&str>,
) -> &'static RuntimeEvidencePackMarkdownCopy {
    let resolved = resolved_locale_tag(locale);
    copy_for_locale_tag(resolved.as_str())
}

fn resolved_locale_tag(locale: Option<&str>) -> String {
    let normalized = locale.map(str::trim).filter(|value| !value.is_empty());
    if normalized
        .map(|value| value.eq_ignore_ascii_case("auto"))
        .unwrap_or(true)
    {
        return system_locale_hint().unwrap_or_else(|| "zh-CN".to_string());
    }

    normalized.unwrap_or("zh-CN").to_string()
}

fn copy_for_locale_tag(locale: &str) -> &'static RuntimeEvidencePackMarkdownCopy {
    let normalized = locale.trim().replace('_', "-").to_ascii_lowercase();
    if normalized.starts_with("zh-tw")
        || normalized.starts_with("zh-hk")
        || normalized.starts_with("zh-mo")
        || normalized == "zh-hant"
    {
        return &ZH_TW_COPY;
    }
    if normalized.starts_with("ja") {
        return &JA_JP_COPY;
    }
    if normalized.starts_with("ko") {
        return &KO_KR_COPY;
    }
    if normalized.starts_with("en") {
        return &EN_US_COPY;
    }

    &ZH_CN_COPY
}

pub(crate) enum RuntimeMarkdownLocaleFamily {
    ZhCn,
    ZhTw,
    En,
    Ja,
    Ko,
}

pub(crate) fn resolved_current_locale_family(locale: Option<&str>) -> RuntimeMarkdownLocaleFamily {
    let normalized = resolved_locale_tag(locale)
        .trim()
        .replace('_', "-")
        .to_ascii_lowercase();
    if normalized.starts_with("zh-tw")
        || normalized.starts_with("zh-hk")
        || normalized.starts_with("zh-mo")
        || normalized == "zh-hant"
    {
        return RuntimeMarkdownLocaleFamily::ZhTw;
    }
    if normalized.starts_with("ja") {
        return RuntimeMarkdownLocaleFamily::Ja;
    }
    if normalized.starts_with("ko") {
        return RuntimeMarkdownLocaleFamily::Ko;
    }
    if normalized.starts_with("en") {
        return RuntimeMarkdownLocaleFamily::En;
    }

    RuntimeMarkdownLocaleFamily::ZhCn
}

fn system_locale_hint() -> Option<String> {
    ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|key| env::var(key).ok())
        .find_map(|value| {
            value
                .split('.')
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty() && *value != "C")
                .map(str::to_string)
        })
}

static ZH_CN_COPY: RuntimeEvidencePackMarkdownCopy = RuntimeEvidencePackMarkdownCopy {
    summary_artifact_title: "问题摘要",
    runtime_artifact_title: "运行时快照",
    timeline_artifact_title: "时间线快照",
    artifacts_artifact_title: "产物与验证线索",
    title: "问题证据包",
    intro: "当前证据包继续沿用 Codex 的结构化交接思路，运行时事实承接 Aster 的 session / thread / diagnostics，最终制品由 Lime 落盘到工作区。",
    session: "会话",
    thread: "线程",
    exported_at: "导出时间",
    thread_status: "线程状态",
    pending_request: "Pending request",
    queued_turn: "排队 turn",
    latest_summary: "最近摘要",
    no_latest_summary: "当前没有结构化 turn summary，请先读 runtime.json 与 timeline.json。",
    evidence_overview: "证据概览",
    turns: "Turns",
    timeline_items: "Timeline items",
    recent_artifacts: "最近产物",
    controlled_get_evidence: "受控 GET evidence",
    primary_blocking: "当前主要阻塞",
    observability_coverage: "证据关联与可观测覆盖",
    correlation_keys: "关联键",
    no_correlation_keys: "当前未导出关联键",
    exported_signals: "当前导出信号",
    evidence_gaps: "当前证据缺口",
    blocked_signals: "当前阻断信号",
    completion_audit: "Completion Audit",
    decision: "判定",
    automation_owner: "Automation owner",
    workspace_skill_tool_call: "Workspace Skill ToolCall evidence",
    artifact_evidence: "Artifact evidence",
    controlled_get_executed_suffix: "executed",
    controlled_get_artifact: "受控 GET evidence artifact",
    blocking_reasons: "阻塞原因",
    none: "无",
    audit_principle_label: "审计原则",
    audit_principle: "`success` run 只作为 audit input；`completed` 必须由 owner、ToolCall 与 artifact / timeline 证据共同判定。",
    reading_order: "建议读取顺序",
    read_summary: "先读 `summary.md`，确认会话状态和当前阻塞。",
    read_runtime: "再读 `runtime.json`，查看 pending request / queued turn / diagnostics。",
    read_timeline: "再读 `timeline.json`，回放最近 turns 与 items。",
    read_artifacts: "最后读 `artifacts.json`，确认最近产物与当前证据缺口。",
    known_gaps: "已知缺口",
};

static ZH_TW_COPY: RuntimeEvidencePackMarkdownCopy = RuntimeEvidencePackMarkdownCopy {
    summary_artifact_title: "問題摘要",
    runtime_artifact_title: "執行階段快照",
    timeline_artifact_title: "時間線快照",
    artifacts_artifact_title: "產物與驗證線索",
    title: "問題證據包",
    intro: "目前證據包延續 Codex 的結構化交接思路，執行階段事實承接 Aster 的 session / thread / diagnostics，最終制品由 Lime 落盤到工作區。",
    session: "會話",
    thread: "執行緒",
    exported_at: "匯出時間",
    thread_status: "執行緒狀態",
    pending_request: "Pending request",
    queued_turn: "排隊 turn",
    latest_summary: "最近摘要",
    no_latest_summary: "目前沒有結構化 turn summary，請先讀 runtime.json 與 timeline.json。",
    evidence_overview: "證據概覽",
    turns: "Turns",
    timeline_items: "Timeline items",
    recent_artifacts: "最近產物",
    controlled_get_evidence: "受控 GET evidence",
    primary_blocking: "目前主要阻塞",
    observability_coverage: "證據關聯與可觀測覆蓋",
    correlation_keys: "關聯鍵",
    no_correlation_keys: "目前未匯出關聯鍵",
    exported_signals: "目前匯出信號",
    evidence_gaps: "目前證據缺口",
    blocked_signals: "目前阻斷信號",
    completion_audit: "Completion Audit",
    decision: "判定",
    automation_owner: "Automation owner",
    workspace_skill_tool_call: "Workspace Skill ToolCall evidence",
    artifact_evidence: "Artifact evidence",
    controlled_get_executed_suffix: "executed",
    controlled_get_artifact: "受控 GET evidence artifact",
    blocking_reasons: "阻塞原因",
    none: "無",
    audit_principle_label: "審計原則",
    audit_principle: "`success` run 僅作為 audit input；`completed` 必須由 owner、ToolCall 與 artifact / timeline 證據共同判定。",
    reading_order: "建議讀取順序",
    read_summary: "先讀 `summary.md`，確認會話狀態和目前阻塞。",
    read_runtime: "再讀 `runtime.json`，查看 pending request / queued turn / diagnostics。",
    read_timeline: "再讀 `timeline.json`，回放最近 turns 與 items。",
    read_artifacts: "最後讀 `artifacts.json`，確認最近產物與目前證據缺口。",
    known_gaps: "已知缺口",
};

static EN_US_COPY: RuntimeEvidencePackMarkdownCopy = RuntimeEvidencePackMarkdownCopy {
    summary_artifact_title: "Issue Summary",
    runtime_artifact_title: "Runtime Snapshot",
    timeline_artifact_title: "Timeline Snapshot",
    artifacts_artifact_title: "Artifacts and Verification Clues",
    title: "Issue Evidence Pack",
    intro: "This evidence pack follows Codex-style structured handoff: runtime facts come from Aster session / thread / diagnostics, and Lime writes the final artifacts into the workspace.",
    session: "Session",
    thread: "Thread",
    exported_at: "Exported at",
    thread_status: "Thread status",
    pending_request: "Pending requests",
    queued_turn: "Queued turns",
    latest_summary: "Latest Summary",
    no_latest_summary: "No structured turn summary is available. Read runtime.json and timeline.json first.",
    evidence_overview: "Evidence Overview",
    turns: "Turns",
    timeline_items: "Timeline items",
    recent_artifacts: "Recent artifacts",
    controlled_get_evidence: "Controlled GET evidence",
    primary_blocking: "Primary blocker",
    observability_coverage: "Evidence Correlation and Observability Coverage",
    correlation_keys: "Correlation keys",
    no_correlation_keys: "No correlation keys were exported",
    exported_signals: "Exported signals",
    evidence_gaps: "Evidence gaps",
    blocked_signals: "Blocked signals",
    completion_audit: "Completion Audit",
    decision: "Decision",
    automation_owner: "Automation owner",
    workspace_skill_tool_call: "Workspace Skill ToolCall evidence",
    artifact_evidence: "Artifact evidence",
    controlled_get_executed_suffix: "executed",
    controlled_get_artifact: "Controlled GET evidence artifact",
    blocking_reasons: "Blocking reasons",
    none: "None",
    audit_principle_label: "Audit principle",
    audit_principle: "`success` runs are audit inputs only; `completed` must be decided from owner, ToolCall, and artifact / timeline evidence together.",
    reading_order: "Recommended Reading Order",
    read_summary: "Read `summary.md` first to confirm session state and the current blocker.",
    read_runtime: "Then read `runtime.json` for pending requests / queued turns / diagnostics.",
    read_timeline: "Then read `timeline.json` to replay recent turns and items.",
    read_artifacts: "Finally read `artifacts.json` to confirm recent artifacts and evidence gaps.",
    known_gaps: "Known Gaps",
};

static JA_JP_COPY: RuntimeEvidencePackMarkdownCopy = RuntimeEvidencePackMarkdownCopy {
    summary_artifact_title: "問題サマリー",
    runtime_artifact_title: "ランタイムスナップショット",
    timeline_artifact_title: "タイムラインスナップショット",
    artifacts_artifact_title: "成果物と検証手掛かり",
    title: "問題エビデンスパック",
    intro: "このエビデンスパックは Codex 型の構造化ハンドオフを踏襲し、ランタイム事実は Aster の session / thread / diagnostics から取得し、最終成果物は Lime がワークスペースへ書き込みます。",
    session: "セッション",
    thread: "スレッド",
    exported_at: "エクスポート時刻",
    thread_status: "スレッド状態",
    pending_request: "Pending request",
    queued_turn: "Queued turn",
    latest_summary: "最新サマリー",
    no_latest_summary: "構造化された turn summary はまだありません。まず runtime.json と timeline.json を確認してください。",
    evidence_overview: "エビデンス概要",
    turns: "Turns",
    timeline_items: "Timeline items",
    recent_artifacts: "最近の成果物",
    controlled_get_evidence: "制御付き GET evidence",
    primary_blocking: "現在の主なブロッカー",
    observability_coverage: "エビデンス相関と可観測性カバレッジ",
    correlation_keys: "相関キー",
    no_correlation_keys: "相関キーはエクスポートされていません",
    exported_signals: "エクスポート済みシグナル",
    evidence_gaps: "エビデンスギャップ",
    blocked_signals: "ブロック中シグナル",
    completion_audit: "Completion Audit",
    decision: "判定",
    automation_owner: "Automation owner",
    workspace_skill_tool_call: "Workspace Skill ToolCall evidence",
    artifact_evidence: "Artifact evidence",
    controlled_get_executed_suffix: "executed",
    controlled_get_artifact: "制御付き GET evidence artifact",
    blocking_reasons: "ブロック理由",
    none: "なし",
    audit_principle_label: "監査原則",
    audit_principle: "`success` run は audit input に過ぎません。`completed` は owner、ToolCall、artifact / timeline evidence を合わせて判定します。",
    reading_order: "推奨確認順",
    read_summary: "まず `summary.md` を読み、セッション状態と現在のブロッカーを確認します。",
    read_runtime: "次に `runtime.json` で pending request / queued turn / diagnostics を確認します。",
    read_timeline: "続いて `timeline.json` で最近の turns と items を再生します。",
    read_artifacts: "最後に `artifacts.json` で最近の成果物とエビデンスギャップを確認します。",
    known_gaps: "既知のギャップ",
};

static KO_KR_COPY: RuntimeEvidencePackMarkdownCopy = RuntimeEvidencePackMarkdownCopy {
    summary_artifact_title: "문제 요약",
    runtime_artifact_title: "런타임 스냅샷",
    timeline_artifact_title: "타임라인 스냅샷",
    artifacts_artifact_title: "산출물 및 검증 단서",
    title: "문제 증거 패키지",
    intro: "이 증거 패키지는 Codex식 구조화 인수인계를 따르며, 런타임 사실은 Aster session / thread / diagnostics에서 가져오고 최종 산출물은 Lime이 워크스페이스에 기록합니다.",
    session: "세션",
    thread: "스레드",
    exported_at: "내보낸 시간",
    thread_status: "스레드 상태",
    pending_request: "Pending request",
    queued_turn: "Queued turn",
    latest_summary: "최근 요약",
    no_latest_summary: "구조화된 turn summary가 없습니다. 먼저 runtime.json과 timeline.json을 확인하세요.",
    evidence_overview: "증거 개요",
    turns: "Turns",
    timeline_items: "Timeline items",
    recent_artifacts: "최근 산출물",
    controlled_get_evidence: "제어된 GET evidence",
    primary_blocking: "현재 주요 차단 요소",
    observability_coverage: "증거 상관관계 및 관측 가능성 범위",
    correlation_keys: "상관 키",
    no_correlation_keys: "내보낸 상관 키가 없습니다",
    exported_signals: "내보낸 신호",
    evidence_gaps: "증거 공백",
    blocked_signals: "차단된 신호",
    completion_audit: "Completion Audit",
    decision: "판정",
    automation_owner: "Automation owner",
    workspace_skill_tool_call: "Workspace Skill ToolCall evidence",
    artifact_evidence: "Artifact evidence",
    controlled_get_executed_suffix: "executed",
    controlled_get_artifact: "제어된 GET evidence artifact",
    blocking_reasons: "차단 사유",
    none: "없음",
    audit_principle_label: "감사 원칙",
    audit_principle: "`success` run은 audit input일 뿐입니다. `completed`는 owner, ToolCall, artifact / timeline evidence를 함께 기준으로 판정해야 합니다.",
    reading_order: "권장 읽기 순서",
    read_summary: "먼저 `summary.md`를 읽고 세션 상태와 현재 차단 요소를 확인합니다.",
    read_runtime: "다음으로 `runtime.json`에서 pending request / queued turn / diagnostics를 확인합니다.",
    read_timeline: "그다음 `timeline.json`에서 최근 turns와 items를 재생합니다.",
    read_artifacts: "마지막으로 `artifacts.json`에서 최근 산출물과 증거 공백을 확인합니다.",
    known_gaps: "알려진 공백",
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_copy_should_support_current_ui_locales() {
        assert_eq!(
            runtime_evidence_pack_markdown_copy(Some("en-US")).title,
            "Issue Evidence Pack"
        );
        assert_eq!(
            runtime_evidence_pack_markdown_copy(Some("zh-TW")).title,
            "問題證據包"
        );
        assert_eq!(
            runtime_evidence_pack_markdown_copy(Some("ja-JP")).title,
            "問題エビデンスパック"
        );
        assert_eq!(
            runtime_evidence_pack_markdown_copy(Some("ko-KR")).title,
            "문제 증거 패키지"
        );
    }
}
