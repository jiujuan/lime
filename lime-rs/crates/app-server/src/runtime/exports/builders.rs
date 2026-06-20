use super::super::status::agent_session_status_label;
use super::super::status::agent_turn_status_label;
use super::super::RuntimeCoreError;
use super::metrics::HandoffMetrics;
use super::metrics::HandoffRecentArtifact;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentSessionReviewDecision;
use app_server_protocol::AgentSessionReviewDecisionSaveParams;
use serde_json::json;
use std::fmt::Write as _;
use std::path::Component;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct HandoffCopy {
    pub(super) plan_title: &'static str,
    pub(super) progress_title: &'static str,
    pub(super) handoff_title: &'static str,
    pub(super) review_summary_title: &'static str,
    pub(super) session_label: &'static str,
    pub(super) thread_label: &'static str,
    pub(super) status_label: &'static str,
    pub(super) exported_at_label: &'static str,
    pub(super) todo_summary_title: &'static str,
    pub(super) recent_artifacts_title: &'static str,
    pub(super) no_recent_artifacts: &'static str,
    pub(super) next_step_title: &'static str,
    pub(super) next_step_body: &'static str,
    pub(super) review_note: &'static str,
}

pub(super) fn sanitized_workspace_root(workspace_root: &Path) -> String {
    let mut components = workspace_root
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => value.to_str().map(ToString::to_string),
            _ => None,
        })
        .collect::<Vec<_>>();
    if components.is_empty() {
        return workspace_root.to_string_lossy().to_string();
    }
    if components.len() > 3 {
        components = components.split_off(components.len() - 3);
    }
    components.join("/")
}

fn json_pretty(value: serde_json::Value, label: &str) -> Result<String, RuntimeCoreError> {
    serde_json::to_string_pretty(&value)
        .map_err(|error| RuntimeCoreError::Backend(format!("failed to serialize {label}: {error}")))
}

pub(super) fn build_replay_input_json(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-replay-case.v1",
            "sessionId": read.session.session_id,
            "threadId": read.session.thread_id,
            "exportedAt": exported_at,
            "threadStatus": agent_session_status_label(read.session.status),
            "latestTurnStatus": metrics.latest_turn_status,
            "turns": read.turns.iter().map(|turn| {
                json!({
                    "turnId": turn.turn_id,
                    "status": agent_turn_status_label(turn.status),
                    "startedAt": turn.started_at,
                    "completedAt": turn.completed_at,
                })
            }).collect::<Vec<_>>(),
            "detail": read.detail,
            "recentArtifacts": recent_artifacts.iter().map(|artifact| {
                json!({
                    "title": artifact.title,
                    "kind": artifact.kind,
                    "path": artifact.path,
                })
            }).collect::<Vec<_>>(),
        }),
        "replay input",
    )
}

pub(super) fn build_replay_expected_json(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-replay-expected.v1",
            "sessionId": read.session.session_id,
            "threadId": read.session.thread_id,
            "exportedAt": exported_at,
            "expected": {
                "terminalThreadStatus": agent_session_status_label(read.session.status),
                "latestTurnStatus": metrics.latest_turn_status,
                "pendingRequestCount": metrics.pending_request_count,
                "queuedTurnCount": metrics.queued_turn_count,
            }
        }),
        "replay expected",
    )
}

pub(super) fn build_replay_grader_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    exported_at: &str,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# Replay Grader");
    let _ = writeln!(content);
    let _ = writeln!(content, "- sessionId: `{}`", read.session.session_id);
    let _ = writeln!(content, "- threadId: `{}`", read.session.thread_id);
    let _ = writeln!(content, "- exportedAt: `{exported_at}`");
    let _ = writeln!(
        content,
        "- threadStatus: `{}`",
        agent_session_status_label(read.session.status)
    );
    let _ = writeln!(content);
    let _ = writeln!(content, "## Checks");
    let _ = writeln!(
        content,
        "- pendingRequestCount should remain {} unless intentionally changed.",
        metrics.pending_request_count
    );
    let _ = writeln!(
        content,
        "- queuedTurnCount should remain {} unless intentionally changed.",
        metrics.queued_turn_count
    );
    let _ = writeln!(
        content,
        "- replay should preserve App Server current read model shape."
    );
    content
}

pub(super) fn build_replay_evidence_links_json(
    session_id: &str,
    handoff_relative_root: &str,
    evidence_relative_root: &str,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-replay-evidence-links.v1",
            "sessionId": session_id,
            "exportedAt": exported_at,
            "handoffBundleRelativeRoot": handoff_relative_root,
            "evidencePackRelativeRoot": evidence_relative_root,
            "recentArtifacts": recent_artifacts.iter().map(|artifact| {
                json!({
                    "title": artifact.title,
                    "kind": artifact.kind,
                    "path": artifact.path,
                })
            }).collect::<Vec<_>>(),
        }),
        "replay evidence links",
    )
}

pub(super) fn build_analysis_brief_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# Analysis Handoff");
    let _ = writeln!(content);
    let _ = writeln!(content, "- sessionId: `{}`", read.session.session_id);
    let _ = writeln!(content, "- threadId: `{}`", read.session.thread_id);
    let _ = writeln!(
        content,
        "- threadStatus: `{}`",
        agent_session_status_label(read.session.status)
    );
    if let Some(latest_turn_status) = metrics.latest_turn_status.as_deref() {
        let _ = writeln!(content, "- latestTurnStatus: `{latest_turn_status}`");
    }
    let _ = writeln!(content, "- exportedAt: `{exported_at}`");
    let _ = writeln!(content);
    let _ = writeln!(content, "## Focus");
    let _ = writeln!(
        content,
        "- Review the current App Server read model and decide the next implementation slice."
    );
    let _ = writeln!(
        content,
        "- Do not use legacy `agent_runtime_*` command output as production evidence."
    );
    let _ = writeln!(content);
    write_handoff_todo_summary(&mut content, metrics, handoff_copy(Some("en-US")));
    let _ = writeln!(content);
    write_handoff_recent_artifacts(&mut content, recent_artifacts, handoff_copy(Some("en-US")));
    content
}

pub(super) fn build_analysis_context_json(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    workspace_root: &Path,
    replay_relative_root: &str,
    handoff_relative_root: &str,
    evidence_relative_root: &str,
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-analysis-handoff.v1",
            "sessionId": read.session.session_id,
            "threadId": read.session.thread_id,
            "workspaceId": read.session.workspace_id,
            "workspaceRoot": workspace_root.to_string_lossy(),
            "sanitizedWorkspaceRoot": sanitized_workspace_root(workspace_root),
            "exportedAt": exported_at,
            "threadStatus": agent_session_status_label(read.session.status),
            "latestTurnStatus": metrics.latest_turn_status,
            "pendingRequestCount": metrics.pending_request_count,
            "queuedTurnCount": metrics.queued_turn_count,
            "handoffBundleRelativeRoot": handoff_relative_root,
            "evidencePackRelativeRoot": evidence_relative_root,
            "replayCaseRelativeRoot": replay_relative_root,
            "detail": read.detail,
        }),
        "analysis context",
    )
}

pub(super) fn build_analysis_copy_prompt(
    read: &AgentSessionReadResponse,
    analysis_relative_root: &str,
    replay_relative_root: &str,
) -> String {
    format!(
        "请基于 App Server current 导出的 `{}` 和 `{}` 分析会话 `{}` 的下一步风险、缺口和回归验证；不要依赖 legacy agent_runtime_* 输出。",
        analysis_relative_root, replay_relative_root, read.session.session_id
    )
}

pub(super) fn default_review_decision() -> AgentSessionReviewDecision {
    AgentSessionReviewDecision {
        decision_status: "pending_review".to_string(),
        decision_summary: String::new(),
        chosen_fix_strategy: String::new(),
        risk_level: "unknown".to_string(),
        risk_tags: Vec::new(),
        human_reviewer: String::new(),
        followup_actions: Vec::new(),
        regression_requirements: vec![
            "Run targeted current-path regression before marking accepted.".to_string(),
        ],
        notes: String::new(),
    }
}

pub(super) fn review_decision_from_save_params(
    params: &AgentSessionReviewDecisionSaveParams,
) -> AgentSessionReviewDecision {
    AgentSessionReviewDecision {
        decision_status: normalize_review_decision_status(params.decision_status.as_str()),
        decision_summary: params.decision_summary.trim().to_string(),
        chosen_fix_strategy: params.chosen_fix_strategy.trim().to_string(),
        risk_level: normalize_review_risk_level(params.risk_level.as_str()),
        risk_tags: trim_string_vec(&params.risk_tags),
        human_reviewer: params.human_reviewer.trim().to_string(),
        followup_actions: trim_string_vec(&params.followup_actions),
        regression_requirements: trim_string_vec(&params.regression_requirements),
        notes: params.notes.trim().to_string(),
    }
}

fn normalize_review_decision_status(value: &str) -> String {
    match value.trim() {
        "accepted" | "deferred" | "rejected" | "needs_more_evidence" | "pending_review" => {
            value.trim().to_string()
        }
        _ => "pending_review".to_string(),
    }
}

fn normalize_review_risk_level(value: &str) -> String {
    match value.trim() {
        "low" | "medium" | "high" | "unknown" => value.trim().to_string(),
        _ => "unknown".to_string(),
    }
}

fn trim_string_vec(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .collect()
}

pub(super) fn build_review_decision_markdown(
    read: &AgentSessionReadResponse,
    decision: &AgentSessionReviewDecision,
    analysis_relative_root: &str,
    replay_relative_root: &str,
    exported_at: &str,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# Review Decision");
    let _ = writeln!(content);
    let _ = writeln!(content, "- sessionId: `{}`", read.session.session_id);
    let _ = writeln!(content, "- threadId: `{}`", read.session.thread_id);
    let _ = writeln!(content, "- exportedAt: `{exported_at}`");
    let _ = writeln!(content, "- decisionStatus: `{}`", decision.decision_status);
    let _ = writeln!(content, "- riskLevel: `{}`", decision.risk_level);
    let _ = writeln!(content, "- analysis: `{analysis_relative_root}`");
    let _ = writeln!(content, "- replay: `{replay_relative_root}`");
    let _ = writeln!(content);
    let _ = writeln!(content, "## Summary");
    let _ = writeln!(
        content,
        "{}",
        if decision.decision_summary.is_empty() {
            "Pending human review."
        } else {
            decision.decision_summary.as_str()
        }
    );
    let _ = writeln!(content);
    let _ = writeln!(content, "## Follow-up Actions");
    if decision.followup_actions.is_empty() {
        let _ = writeln!(content, "- None recorded.");
    } else {
        for action in &decision.followup_actions {
            let _ = writeln!(content, "- {action}");
        }
    }
    let _ = writeln!(content);
    let _ = writeln!(content, "## Regression Requirements");
    if decision.regression_requirements.is_empty() {
        let _ = writeln!(content, "- Run current-path targeted regression.");
    } else {
        for item in &decision.regression_requirements {
            let _ = writeln!(content, "- {item}");
        }
    }
    if !decision.notes.is_empty() {
        let _ = writeln!(content);
        let _ = writeln!(content, "## Notes");
        let _ = writeln!(content, "{}", decision.notes);
    }
    content
}

pub(super) fn build_review_decision_json(
    read: &AgentSessionReadResponse,
    decision: &AgentSessionReviewDecision,
    analysis_relative_root: &str,
    replay_relative_root: &str,
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    json_pretty(
        json!({
            "schemaVersion": "agent-session-review-decision.v1",
            "sessionId": read.session.session_id,
            "threadId": read.session.thread_id,
            "exportedAt": exported_at,
            "analysisRelativeRoot": analysis_relative_root,
            "replayCaseRelativeRoot": replay_relative_root,
            "decision": decision,
        }),
        "review decision",
    )
}

pub(super) fn build_handoff_plan_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
    copy: HandoffCopy,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# {}", copy.plan_title);
    let _ = writeln!(content);
    write_handoff_header(&mut content, read, metrics, exported_at, copy);
    let _ = writeln!(content);
    write_handoff_todo_summary(&mut content, metrics, copy);
    let _ = writeln!(content);
    write_handoff_recent_artifacts(&mut content, recent_artifacts, copy);
    let _ = writeln!(content);
    let _ = writeln!(content, "## {}", copy.next_step_title);
    let _ = writeln!(content);
    let _ = writeln!(content, "- {}", copy.next_step_body);
    content
}

pub(super) fn build_handoff_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
    copy: HandoffCopy,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# {}", copy.handoff_title);
    let _ = writeln!(content);
    write_handoff_header(&mut content, read, metrics, exported_at, copy);
    let _ = writeln!(content);
    let _ = writeln!(content, "## {}", copy.next_step_title);
    let _ = writeln!(content);
    let _ = writeln!(content, "- {}", copy.next_step_body);
    let _ = writeln!(content);
    write_handoff_recent_artifacts(&mut content, recent_artifacts, copy);
    content
}

pub(super) fn build_handoff_review_summary_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
    copy: HandoffCopy,
) -> String {
    let mut content = String::new();
    let _ = writeln!(content, "# {}", copy.review_summary_title);
    let _ = writeln!(content);
    write_handoff_header(&mut content, read, metrics, exported_at, copy);
    let _ = writeln!(content);
    let _ = writeln!(content, "{}", copy.review_note);
    let _ = writeln!(content);
    write_handoff_todo_summary(&mut content, metrics, copy);
    let _ = writeln!(content);
    write_handoff_recent_artifacts(&mut content, recent_artifacts, copy);
    content
}

pub(super) fn build_rollout_summary_candidate_markdown(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    exported_at: &str,
    export_relative_root: &str,
    export_kind: &str,
) -> String {
    let mut content = String::new();
    let _ = writeln!(
        content,
        "Session `{}` exported `{export_kind}` evidence for follow-up consolidation.",
        read.session.session_id
    );
    let _ = writeln!(content);
    let _ = writeln!(content, "## Export Evidence");
    let _ = writeln!(content, "- sessionId: `{}`", read.session.session_id);
    let _ = writeln!(content, "- threadId: `{}`", read.session.thread_id);
    let _ = writeln!(content, "- exportKind: `{export_kind}`");
    let _ = writeln!(content, "- exportRoot: `{export_relative_root}`");
    let _ = writeln!(
        content,
        "- threadStatus: `{}`",
        agent_session_status_label(read.session.status)
    );
    if let Some(latest_turn_status) = metrics.latest_turn_status.as_deref() {
        let _ = writeln!(content, "- latestTurnStatus: `{latest_turn_status}`");
    }
    let _ = writeln!(content, "- exportedAt: `{exported_at}`");
    let _ = writeln!(content);
    let _ = writeln!(content, "## Candidate Memory");
    let _ = writeln!(
        content,
        "- Review `{export_relative_root}` before promoting this candidate into long-term memory."
    );
    if metrics.todo_pending > 0 || metrics.todo_in_progress > 0 {
        let _ = writeln!(
            content,
            "- Pending work remains: {} pending, {} in progress.",
            metrics.todo_pending, metrics.todo_in_progress
        );
    }
    if !recent_artifacts.is_empty() {
        let _ = writeln!(content);
        let _ = writeln!(content, "## Referenced Artifacts");
        for artifact in recent_artifacts {
            let _ = writeln!(
                content,
                "- {} `{}` ({})",
                artifact.title, artifact.path, artifact.kind
            );
        }
    }
    content
}

pub(super) fn build_handoff_progress_json(
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    recent_artifacts: &[HandoffRecentArtifact],
    workspace_root: &Path,
    exported_at: &str,
) -> Result<String, RuntimeCoreError> {
    let recent_artifacts = recent_artifacts
        .iter()
        .map(|artifact| {
            json!({
                "title": artifact.title,
                "kind": artifact.kind,
                "path": artifact.path,
            })
        })
        .collect::<Vec<_>>();
    let turns = read
        .turns
        .iter()
        .map(|turn| {
            json!({
                "turnId": turn.turn_id,
                "status": agent_turn_status_label(turn.status),
                "startedAt": turn.started_at,
                "completedAt": turn.completed_at,
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string_pretty(&json!({
        "schemaVersion": "agent-session-handoff-bundle.v1",
        "sessionId": read.session.session_id,
        "threadId": read.session.thread_id,
        "workspaceId": read.session.workspace_id,
        "workspaceRoot": workspace_root.to_string_lossy(),
        "exportedAt": exported_at,
        "status": {
            "thread": agent_session_status_label(read.session.status),
            "latestTurn": metrics.latest_turn_status,
        },
        "counts": {
            "pendingRequest": metrics.pending_request_count,
            "queuedTurn": metrics.queued_turn_count,
            "activeSubagent": metrics.active_subagent_count,
        },
        "todos": {
            "total": metrics.todo_total,
            "pending": metrics.todo_pending,
            "inProgress": metrics.todo_in_progress,
            "completed": metrics.todo_completed,
        },
        "turns": turns,
        "recentArtifacts": recent_artifacts,
    }))
    .map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to serialize handoff progress: {error}"))
    })
}

fn write_handoff_header(
    content: &mut String,
    read: &AgentSessionReadResponse,
    metrics: &HandoffMetrics,
    exported_at: &str,
    copy: HandoffCopy,
) {
    let _ = writeln!(
        content,
        "- {}: `{}`",
        copy.session_label, read.session.session_id
    );
    let _ = writeln!(
        content,
        "- {}: `{}`",
        copy.thread_label, read.session.thread_id
    );
    let _ = writeln!(
        content,
        "- {}: `{}`",
        copy.status_label,
        agent_session_status_label(read.session.status)
    );
    if let Some(latest_turn_status) = metrics.latest_turn_status.as_deref() {
        let _ = writeln!(content, "- latestTurnStatus: `{latest_turn_status}`");
    }
    let _ = writeln!(content, "- {}: `{}`", copy.exported_at_label, exported_at);
}

fn write_handoff_todo_summary(content: &mut String, metrics: &HandoffMetrics, copy: HandoffCopy) {
    let _ = writeln!(content, "## {}", copy.todo_summary_title);
    let _ = writeln!(content);
    let _ = writeln!(content, "- total: {}", metrics.todo_total);
    let _ = writeln!(content, "- pending: {}", metrics.todo_pending);
    let _ = writeln!(content, "- inProgress: {}", metrics.todo_in_progress);
    let _ = writeln!(content, "- completed: {}", metrics.todo_completed);
    let _ = writeln!(
        content,
        "- pendingRequests: {}",
        metrics.pending_request_count
    );
    let _ = writeln!(content, "- queuedTurns: {}", metrics.queued_turn_count);
    let _ = writeln!(
        content,
        "- activeSubagents: {}",
        metrics.active_subagent_count
    );
}

fn write_handoff_recent_artifacts(
    content: &mut String,
    recent_artifacts: &[HandoffRecentArtifact],
    copy: HandoffCopy,
) {
    let _ = writeln!(content, "## {}", copy.recent_artifacts_title);
    let _ = writeln!(content);
    if recent_artifacts.is_empty() {
        let _ = writeln!(content, "- {}", copy.no_recent_artifacts);
        return;
    }
    for artifact in recent_artifacts {
        let _ = writeln!(
            content,
            "- `{}` {} ({})",
            artifact.path, artifact.title, artifact.kind
        );
    }
}

pub(super) fn handoff_copy(locale: Option<&str>) -> HandoffCopy {
    match locale.unwrap_or("zh-CN") {
        value if value.eq_ignore_ascii_case("zh-TW") || value.eq_ignore_ascii_case("zh-HK") => {
            HandoffCopy {
                plan_title: "計畫摘要",
                progress_title: "結構化進度",
                handoff_title: "交接摘要",
                review_summary_title: "審查摘要",
                session_label: "會話",
                thread_label: "執行緒",
                status_label: "狀態",
                exported_at_label: "匯出時間",
                todo_summary_title: "待辦摘要",
                recent_artifacts_title: "最近產物",
                no_recent_artifacts: "目前沒有可引用的最近產物。",
                next_step_title: "建議接手順序",
                next_step_body: "先讀 progress.json 確認結構化狀態，再讀 handoff.md 決定下一刀。",
                review_note: "此摘要來自 App Server current read model；不要把 legacy command 輸出當成交付證據。",
            }
        }
        value if value.eq_ignore_ascii_case("ja-JP") || value.eq_ignore_ascii_case("ja") => {
            HandoffCopy {
                plan_title: "計画サマリー",
                progress_title: "構造化された進捗",
                handoff_title: "引き継ぎサマリー",
                review_summary_title: "レビューサマリー",
                session_label: "セッション",
                thread_label: "スレッド",
                status_label: "状態",
                exported_at_label: "エクスポート時刻",
                todo_summary_title: "Todo サマリー",
                recent_artifacts_title: "最近の成果物",
                no_recent_artifacts: "参照できる最近の成果物はありません。",
                next_step_title: "推奨される引き継ぎ順序",
                next_step_body: "まず progress.json で構造化された状態を確認し、次に handoff.md で次の作業を決めてください。",
                review_note: "このサマリーは App Server current read model から生成されています。legacy command の出力を納品証跡として扱わないでください。",
            }
        }
        value if value.eq_ignore_ascii_case("ko-KR") || value.eq_ignore_ascii_case("ko") => {
            HandoffCopy {
                plan_title: "계획 요약",
                progress_title: "구조화된 진행 상황",
                handoff_title: "인수인계 요약",
                review_summary_title: "리뷰 요약",
                session_label: "세션",
                thread_label: "스레드",
                status_label: "상태",
                exported_at_label: "내보낸 시간",
                todo_summary_title: "Todo 요약",
                recent_artifacts_title: "최근 산출물",
                no_recent_artifacts: "참조할 최근 산출물이 없습니다.",
                next_step_title: "권장 인수인계 순서",
                next_step_body: "먼저 progress.json에서 구조화된 상태를 확인한 뒤 handoff.md에서 다음 작업을 결정하세요.",
                review_note: "이 요약은 App Server current read model에서 생성되었습니다. legacy command 출력을 납품 증거로 사용하지 마세요.",
            }
        }
        value if value.eq_ignore_ascii_case("en-US") || value.eq_ignore_ascii_case("en") => {
            HandoffCopy {
                plan_title: "Plan Summary",
                progress_title: "Structured Progress",
                handoff_title: "Handoff Summary",
                review_summary_title: "Review Summary",
                session_label: "Session",
                thread_label: "Thread",
                status_label: "Status",
                exported_at_label: "Exported At",
                todo_summary_title: "Todo Summary",
                recent_artifacts_title: "Recent Artifacts",
                no_recent_artifacts: "No recent artifacts are available.",
                next_step_title: "Recommended Handoff Order",
                next_step_body: "Read progress.json for structured state first, then use handoff.md to choose the next implementation slice.",
                review_note: "This summary is generated from the App Server current read model; do not treat legacy command output as delivery evidence.",
            }
        }
        _ => HandoffCopy {
            plan_title: "计划摘要",
            progress_title: "结构化进度",
            handoff_title: "交接摘要",
            review_summary_title: "审查摘要",
            session_label: "会话",
            thread_label: "线程",
            status_label: "状态",
            exported_at_label: "导出时间",
            todo_summary_title: "Todo 摘要",
            recent_artifacts_title: "最近产物",
            no_recent_artifacts: "当前没有可引用的最近产物。",
            next_step_title: "推荐接手顺序",
            next_step_body: "先读 progress.json 确认结构化状态，再读 handoff.md 决定下一刀。",
            review_note: "此摘要来自 App Server current read model；不要把 legacy command 输出当成交付证据。",
        },
    }
}
