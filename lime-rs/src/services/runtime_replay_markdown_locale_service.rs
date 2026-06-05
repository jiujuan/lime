//! Runtime replay Markdown 本地化文案。
//!
//! Facts JSON 保持稳定英文 key；这里仅承载 Replay Markdown presentation copy。

use crate::services::runtime_evidence_markdown_locale_service::{
    resolved_current_locale_family, RuntimeMarkdownLocaleFamily,
};

pub(crate) struct RuntimeReplayMarkdownCopy {
    pub input_artifact_title: &'static str,
    pub expected_artifact_title: &'static str,
    pub grader_artifact_title: &'static str,
    pub evidence_links_artifact_title: &'static str,
    pub grader_title: &'static str,
    pub session: &'static str,
    pub thread: &'static str,
    pub exported_at: &'static str,
    pub goal_summary: &'static str,
    pub reading_order: &'static str,
    pub read_input: &'static str,
    pub read_expected: &'static str,
    pub read_evidence_links: &'static str,
    pub read_existing_evidence: &'static str,
    pub scoring_principles: &'static str,
    pub principle_result_only: &'static str,
    pub principle_evidence_first: &'static str,
    pub principle_pending_request: &'static str,
    pub success_criteria: &'static str,
    pub blocking_checks: &'static str,
    pub modality_contract_checks: &'static str,
    pub output_template: &'static str,
}

pub(crate) fn runtime_replay_markdown_copy(
    locale: Option<&str>,
) -> &'static RuntimeReplayMarkdownCopy {
    match resolved_current_locale_family(locale) {
        RuntimeMarkdownLocaleFamily::ZhTw => &ZH_TW_REPLAY_COPY,
        RuntimeMarkdownLocaleFamily::Ja => &JA_JP_REPLAY_COPY,
        RuntimeMarkdownLocaleFamily::Ko => &KO_KR_REPLAY_COPY,
        RuntimeMarkdownLocaleFamily::En => &EN_US_REPLAY_COPY,
        RuntimeMarkdownLocaleFamily::ZhCn => &ZH_CN_REPLAY_COPY,
    }
}

static ZH_CN_REPLAY_COPY: RuntimeReplayMarkdownCopy = RuntimeReplayMarkdownCopy {
    input_artifact_title: "回放输入",
    expected_artifact_title: "期望结果",
    grader_artifact_title: "评分说明",
    evidence_links_artifact_title: "证据链接",
    grader_title: "Replay Case 评分说明",
    session: "会话",
    thread: "线程",
    exported_at: "导出时间",
    goal_summary: "目标摘要",
    reading_order: "建议读取顺序",
    read_input: "先读 `input.json`，理解当前任务与运行时上下文。",
    read_expected: "再读 `expected.json`，确认只评估结果与风险。",
    read_evidence_links: "再读 `evidence-links.json`，跳转到已有证据源。",
    read_existing_evidence: "如需补证据，优先回看",
    scoring_principles: "评分原则",
    principle_result_only: "只评结果，不评路径。",
    principle_evidence_first: "先证据后结论；没有证据支撑的 PASS 不成立。",
    principle_pending_request:
        "如仍存在 pending request，必须解释它是已处理、仍保留，还是不影响判定。",
    success_criteria: "最小通过条件",
    blocking_checks: "关键阻塞检查",
    modality_contract_checks: "多模态运行合同检查",
    output_template: "建议输出模板",
};

static ZH_TW_REPLAY_COPY: RuntimeReplayMarkdownCopy = RuntimeReplayMarkdownCopy {
    input_artifact_title: "回放輸入",
    expected_artifact_title: "預期結果",
    grader_artifact_title: "評分說明",
    evidence_links_artifact_title: "證據連結",
    grader_title: "Replay Case 評分說明",
    session: "會話",
    thread: "執行緒",
    exported_at: "匯出時間",
    goal_summary: "目標摘要",
    reading_order: "建議讀取順序",
    read_input: "先讀 `input.json`，理解目前任務與執行階段上下文。",
    read_expected: "再讀 `expected.json`，確認只評估結果與風險。",
    read_evidence_links: "再讀 `evidence-links.json`，跳轉到既有證據來源。",
    read_existing_evidence: "如需補證據，優先回看",
    scoring_principles: "評分原則",
    principle_result_only: "只評結果，不評路徑。",
    principle_evidence_first: "先證據後結論；沒有證據支撐的 PASS 不成立。",
    principle_pending_request:
        "如仍存在 pending request，必須解釋它是已處理、仍保留，還是不影響判定。",
    success_criteria: "最小通過條件",
    blocking_checks: "關鍵阻塞檢查",
    modality_contract_checks: "多模態執行合約檢查",
    output_template: "建議輸出模板",
};

static EN_US_REPLAY_COPY: RuntimeReplayMarkdownCopy = RuntimeReplayMarkdownCopy {
    input_artifact_title: "Replay Input",
    expected_artifact_title: "Expected Outcome",
    grader_artifact_title: "Grading Guide",
    evidence_links_artifact_title: "Evidence Links",
    grader_title: "Replay Case Grading Guide",
    session: "Session",
    thread: "Thread",
    exported_at: "Exported at",
    goal_summary: "Goal summary",
    reading_order: "Recommended Reading Order",
    read_input: "Read `input.json` first to understand the task and runtime context.",
    read_expected: "Then read `expected.json` to evaluate only outcome and risk.",
    read_evidence_links: "Then read `evidence-links.json` to jump to existing evidence sources.",
    read_existing_evidence: "If more evidence is needed, review",
    scoring_principles: "Grading Principles",
    principle_result_only: "Grade the outcome, not the path.",
    principle_evidence_first: "Evidence first, conclusion second; PASS is invalid without supporting evidence.",
    principle_pending_request: "If pending requests remain, explain whether they were handled, intentionally kept, or irrelevant to the verdict.",
    success_criteria: "Minimum Pass Criteria",
    blocking_checks: "Critical Blocking Checks",
    modality_contract_checks: "Modality Runtime Contract Checks",
    output_template: "Suggested Output Template",
};

static JA_JP_REPLAY_COPY: RuntimeReplayMarkdownCopy = RuntimeReplayMarkdownCopy {
    input_artifact_title: "リプレイ入力",
    expected_artifact_title: "期待結果",
    grader_artifact_title: "採点ガイド",
    evidence_links_artifact_title: "エビデンスリンク",
    grader_title: "Replay Case 採点ガイド",
    session: "セッション",
    thread: "スレッド",
    exported_at: "エクスポート時刻",
    goal_summary: "目標サマリー",
    reading_order: "推奨確認順",
    read_input: "まず `input.json` を読み、タスクとランタイム文脈を理解します。",
    read_expected: "次に `expected.json` を読み、成果とリスクだけを評価します。",
    read_evidence_links: "次に `evidence-links.json` から既存のエビデンスへ移動します。",
    read_existing_evidence: "追加エビデンスが必要な場合は優先して確認",
    scoring_principles: "採点原則",
    principle_result_only: "経路ではなく成果を評価します。",
    principle_evidence_first: "結論より先にエビデンスを確認します。裏付けのない PASS は無効です。",
    principle_pending_request:
        "pending request が残る場合、それが処理済み、意図的に保持、または判定に無関係かを説明します。",
    success_criteria: "最小合格条件",
    blocking_checks: "重要なブロック確認",
    modality_contract_checks: "モダリティ実行契約の確認",
    output_template: "推奨出力テンプレート",
};

static KO_KR_REPLAY_COPY: RuntimeReplayMarkdownCopy = RuntimeReplayMarkdownCopy {
    input_artifact_title: "리플레이 입력",
    expected_artifact_title: "예상 결과",
    grader_artifact_title: "채점 가이드",
    evidence_links_artifact_title: "증거 링크",
    grader_title: "Replay Case 채점 가이드",
    session: "세션",
    thread: "스레드",
    exported_at: "내보낸 시간",
    goal_summary: "목표 요약",
    reading_order: "권장 읽기 순서",
    read_input: "먼저 `input.json`을 읽고 현재 작업과 런타임 맥락을 이해합니다.",
    read_expected: "다음으로 `expected.json`을 읽고 결과와 위험만 평가합니다.",
    read_evidence_links: "다음으로 `evidence-links.json`에서 기존 증거 소스로 이동합니다.",
    read_existing_evidence: "추가 증거가 필요하면 우선 검토",
    scoring_principles: "채점 원칙",
    principle_result_only: "경로가 아니라 결과를 평가합니다.",
    principle_evidence_first: "증거가 먼저이고 결론은 그다음입니다. 근거 없는 PASS는 유효하지 않습니다.",
    principle_pending_request:
        "pending request가 남아 있으면 처리됨, 의도적으로 유지됨, 또는 판정과 무관함 중 무엇인지 설명해야 합니다.",
    success_criteria: "최소 통과 조건",
    blocking_checks: "핵심 차단 확인",
    modality_contract_checks: "모달리티 런타임 계약 확인",
    output_template: "권장 출력 템플릿",
};
