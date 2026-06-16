use super::session_store_history_visibility::load_user_visible_message_flags_from_conn;
use super::session_store_message_projection::{
    convert_agent_messages_with_history_eviction, convert_user_visible_agent_messages_with_flags,
};
use super::session_store_runtime_projection::{
    apply_aster_runtime_snapshot, apply_runtime_usage_fallback_to_latest_assistant_message,
};
use super::session_store_subagent_context::{
    should_load_runtime_overlay_for_runtime_detail,
    should_load_subagent_runtime_context_for_runtime_detail,
};
use super::*;
use crate::protocol::AgentMessage as RuntimeAgentMessage;
use aster::session::{
    SessionRuntimeSnapshot, SessionType as AsterSessionType, SubagentSessionMetadata,
    ThreadRuntime, ThreadRuntimeSnapshot, TurnRuntime, TurnStatus,
};
use chrono::{Duration, Utc};
use lime_core::agent::types::{FunctionCall, ImageUrl, ToolCall};
use lime_core::database::{schema, DbConnection};
use std::ffi::OsString;
use std::sync::{Arc, Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

struct EnvGuard {
    values: Vec<(&'static str, Option<OsString>)>,
}

impl EnvGuard {
    fn set(entries: &[(&'static str, OsString)]) -> Self {
        let mut values = Vec::new();
        for (key, value) in entries {
            values.push((*key, std::env::var_os(key)));
            std::env::set_var(key, value);
        }
        Self { values }
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        for (key, previous) in self.values.drain(..) {
            if let Some(value) = previous {
                std::env::set_var(key, value);
            } else {
                std::env::remove_var(key);
            }
        }
    }
}

fn create_test_db() -> DbConnection {
    let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
    schema::create_tables(&conn).expect("create tables");
    Arc::new(Mutex::new(conn))
}

fn insert_test_workspace(db: &DbConnection, workspace_id: &str, root_path: &str) {
    let conn = db.lock().expect("lock db");
    conn.execute(
            "INSERT INTO workspaces (id, name, workspace_type, root_path, is_default, settings_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, '{}', 0, 0)",
            rusqlite::params![workspace_id, "测试工作区", "general", root_path],
        )
        .expect("insert workspace");
}

#[test]
fn create_session_record_sync_without_strategy_should_default_to_react() {
    let db = create_test_db();

    let session = create_session_record_sync(
        &db,
        CreateSessionRecordInput {
            session_id: Some("session-default-react".to_string()),
            title: Some("默认编程底座".to_string()),
            model: Some("agent:test".to_string()),
            ..CreateSessionRecordInput::default()
        },
    )
    .expect("create session");

    assert_eq!(session.execution_strategy.as_deref(), Some("react"));
}

fn build_detail_with_turn_status(status: AgentThreadTurnStatus) -> SessionDetail {
    build_detail_with_turn_status_updated_at(status, Utc::now())
}

fn build_detail_with_turn_status_updated_at(
    status: AgentThreadTurnStatus,
    updated_at: DateTime<Utc>,
) -> SessionDetail {
    let timestamp = updated_at.to_rfc3339();
    SessionDetail {
        id: "session-runtime-overlay".to_string(),
        name: "运行态叠加判定".to_string(),
        created_at: 0,
        updated_at: 0,
        thread_id: "session-runtime-overlay".to_string(),
        model: Some("agent:test".to_string()),
        working_dir: None,
        workspace_id: None,
        messages: Vec::new(),
        execution_strategy: Some("react".to_string()),
        execution_runtime: None,
        turns: vec![AgentThreadTurn {
            id: "turn-runtime-overlay".to_string(),
            thread_id: "session-runtime-overlay".to_string(),
            prompt_text: "测试".to_string(),
            status,
            started_at: timestamp.clone(),
            completed_at: None,
            error_message: None,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        }],
        items: Vec::new(),
        todo_items: Vec::new(),
        child_subagent_sessions: Vec::new(),
        subagent_parent_context: None,
    }
}

fn build_empty_runtime_detail() -> SessionDetail {
    SessionDetail {
        id: "session-empty-runtime".to_string(),
        name: "空运行态会话".to_string(),
        created_at: 0,
        updated_at: 0,
        thread_id: "session-empty-runtime".to_string(),
        model: Some("agent:test".to_string()),
        working_dir: None,
        workspace_id: None,
        messages: Vec::new(),
        execution_strategy: Some("react".to_string()),
        execution_runtime: None,
        turns: Vec::new(),
        items: Vec::new(),
        todo_items: Vec::new(),
        child_subagent_sessions: Vec::new(),
        subagent_parent_context: None,
    }
}

fn insert_test_session_with_message(
    db: &DbConnection,
    session_id: &str,
    working_dir: &str,
    message_text: &str,
) {
    create_session_record_sync(
        db,
        CreateSessionRecordInput {
            session_id: Some(session_id.to_string()),
            title: Some("测试会话".to_string()),
            model: Some("agent:test".to_string()),
            working_dir: Some(working_dir.to_string()),
            execution_strategy: Some("react".to_string()),
            ..CreateSessionRecordInput::default()
        },
    )
    .expect("create session");

    let conn = db.lock().expect("lock db");
    insert_legacy_agent_message(
        &conn,
        session_id,
        &AgentMessage {
            role: "user".to_string(),
            content: MessageContent::Text(message_text.to_string()),
            timestamp: "2026-03-18T08:00:00Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
    )
    .expect("add message");
}

fn insert_legacy_agent_message(
    conn: &rusqlite::Connection,
    session_id: &str,
    message: &AgentMessage,
) -> Result<(), rusqlite::Error> {
    let content_json = serde_json::to_string(&message.content)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
    let tool_calls_json = message
        .tool_calls
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;

    conn.execute(
        "INSERT INTO agent_messages (
            session_id,
            role,
            content_json,
            timestamp,
            tool_calls_json,
            tool_call_id,
            reasoning_content
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            session_id,
            message.role,
            content_json,
            message.timestamp,
            tool_calls_json,
            message.tool_call_id,
            message.reasoning_content.as_deref(),
        ],
    )?;

    Ok(())
}

#[test]
fn should_load_runtime_overlay_for_full_history() {
    let detail = build_detail_with_turn_status(AgentThreadTurnStatus::Completed);

    assert!(should_load_runtime_overlay(&detail, None));
}

#[test]
fn should_skip_runtime_overlay_for_completed_limited_history() {
    let detail = build_detail_with_turn_status(AgentThreadTurnStatus::Completed);

    assert!(!should_load_runtime_overlay(&detail, Some(80)));
}

#[test]
fn should_load_runtime_overlay_for_running_limited_history() {
    let detail = build_detail_with_turn_status(AgentThreadTurnStatus::Running);

    assert!(should_load_runtime_overlay(&detail, Some(80)));
}

#[test]
fn should_skip_runtime_overlay_for_stale_running_limited_history() {
    let now = Utc::now();
    let detail = build_detail_with_turn_status_updated_at(
        AgentThreadTurnStatus::Running,
        now - Duration::hours(2),
    );

    assert!(!should_load_runtime_overlay_at(&detail, Some(80), now));
}

#[test]
fn should_probe_runtime_overlay_for_empty_limited_history() {
    let detail = build_empty_runtime_detail();

    assert!(detail.is_persisted_empty());
    assert!(should_load_runtime_overlay_for_runtime_detail(
        &detail,
        Some(20)
    ));
}

#[test]
fn apply_runtime_snapshot_should_not_regress_aborted_turn_to_running() {
    let mut detail = build_detail_with_turn_status(AgentThreadTurnStatus::Aborted);
    let thread_id = detail.thread_id.clone();
    let turn_id = detail.turns[0].id.clone();
    let mut runtime_turn = TurnRuntime::new(
        turn_id.clone(),
        detail.id.clone(),
        thread_id.clone(),
        Some("测试".to_string()),
        None,
    );
    runtime_turn.status = TurnStatus::Running;
    let snapshot = SessionRuntimeSnapshot {
        session_id: detail.id.clone(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new(
                thread_id,
                detail.id.clone(),
                std::path::PathBuf::from("/tmp/lime-runtime-overlay-test"),
            ),
            turns: vec![runtime_turn],
            items: Vec::new(),
        }],
    };

    apply_aster_runtime_snapshot(&mut detail, &snapshot);

    assert_eq!(detail.turns.len(), 1);
    assert_eq!(detail.turns[0].id, turn_id);
    assert_eq!(detail.turns[0].status, AgentThreadTurnStatus::Aborted);
}

#[test]
fn should_load_subagent_runtime_context_for_full_history() {
    let detail = build_detail_with_turn_status(AgentThreadTurnStatus::Completed);

    assert!(should_load_subagent_runtime_context(&detail, None));
}

#[test]
fn should_skip_subagent_runtime_context_for_completed_limited_history() {
    let detail = build_detail_with_turn_status(AgentThreadTurnStatus::Completed);

    assert!(!should_load_subagent_runtime_context(&detail, Some(80)));
}

#[test]
fn should_load_subagent_runtime_context_for_running_limited_history() {
    let detail = build_detail_with_turn_status(AgentThreadTurnStatus::Running);

    assert!(should_load_subagent_runtime_context(&detail, Some(80)));
}

#[test]
fn should_skip_subagent_context_for_empty_limited_history() {
    let detail = build_empty_runtime_detail();

    assert!(detail.is_persisted_empty());
    assert!(!should_load_subagent_runtime_context_for_runtime_detail(
        &detail,
        Some(20)
    ));
}

fn build_test_subagent_session(
    session_id: &str,
    name: &str,
    parent_session_id: Option<&str>,
    updated_at: chrono::DateTime<Utc>,
    task_summary: Option<&str>,
    role_hint: Option<&str>,
    created_from_turn_id: Option<&str>,
) -> AsterSession {
    let mut session = AsterSession {
        id: session_id.to_string(),
        name: name.to_string(),
        session_type: AsterSessionType::SubAgent,
        created_at: updated_at - Duration::minutes(1),
        updated_at,
        provider_name: Some("openai".to_string()),
        working_dir: std::path::PathBuf::from("/tmp/workspace-child"),
        ..AsterSession::default()
    };

    if let Some(parent_session_id) = parent_session_id {
        session.extension_data = SubagentSessionMetadata::new(parent_session_id.to_string())
            .with_task_summary(task_summary.map(str::to_string))
            .with_role_hint(role_hint.map(str::to_string))
            .with_created_from_turn_id(created_from_turn_id.map(str::to_string))
            .into_updated_extension_data(&AsterSession::default())
            .expect("build child metadata");
    }

    session
}

#[test]
fn parse_tool_call_arguments_should_parse_json_or_keep_raw() {
    let parsed = parse_tool_call_arguments(r#"{"path":"./a.txt"}"#);
    assert_eq!(parsed["path"], serde_json::json!("./a.txt"));

    let fallback = parse_tool_call_arguments("not-json");
    assert_eq!(fallback["raw"], serde_json::json!("not-json"));
}

#[test]
fn build_child_subagent_session_summaries_should_filter_and_sort_by_updated_at_desc() {
    let now = Utc::now();
    let summaries = build_child_subagent_session_summaries(
        None,
        vec![
            build_test_subagent_session(
                "child-old",
                "旧子代理",
                Some("parent-1"),
                now - Duration::minutes(5),
                Some("先检查日志"),
                Some("explorer"),
                Some("turn-1"),
            ),
            build_test_subagent_session(
                "ignored",
                "忽略项",
                None,
                now - Duration::minutes(1),
                None,
                None,
                None,
            ),
            build_test_subagent_session(
                "child-new",
                "新子代理",
                Some("parent-1"),
                now,
                Some("补充真实 team runtime"),
                Some("planner"),
                Some("turn-2"),
            ),
        ],
    );

    assert_eq!(summaries.len(), 2);
    assert_eq!(summaries[0].id, "child-new");
    assert_eq!(summaries[0].session_type, "sub_agent");
    assert_eq!(
        summaries[0].task_summary.as_deref(),
        Some("补充真实 team runtime")
    );
    assert_eq!(summaries[0].role_hint.as_deref(), Some("planner"));
    assert_eq!(summaries[0].created_from_turn_id.as_deref(), Some("turn-2"));
    assert_eq!(summaries[1].id, "child-old");
}

#[test]
fn build_child_subagent_session_summary_should_merge_customization_state() {
    let now = Utc::now();
    let mut session = build_test_subagent_session(
        "child-customized",
        "自定义子代理",
        Some("parent-1"),
        now,
        Some("整理 customization"),
        Some("Image #1"),
        Some("turn-9"),
    );
    session.extension_data = SubagentCustomizationState {
        blueprint_role_id: Some("runtime-explorer".to_string()),
        blueprint_role_label: Some("分析".to_string()),
        profile_id: Some("code-explorer".to_string()),
        profile_name: Some("代码分析员".to_string()),
        role_key: Some("explorer".to_string()),
        team_preset_id: Some("code-triage-team".to_string()),
        theme: Some("engineering".to_string()),
        output_contract: Some("输出证据、影响面与建议。".to_string()),
        system_overlay: None,
        skill_ids: vec!["repo-exploration".to_string()],
        skills: vec![SubagentSkillSummary {
            id: "repo-exploration".to_string(),
            name: "仓库探索".to_string(),
            description: Some("优先读事实源".to_string()),
            source: Some("builtin".to_string()),
            directory: None,
        }],
        hooks: None,
        allowed_tools: Vec::new(),
        disallowed_tools: Vec::new(),
    }
    .into_updated_extension_data(&session)
    .expect("merge customization");

    let summary =
        build_child_subagent_session_summary(None, session).expect("child summary should exist");

    assert_eq!(
        summary.blueprint_role_id.as_deref(),
        Some("runtime-explorer")
    );
    assert_eq!(summary.blueprint_role_label.as_deref(), Some("分析"));
    assert_eq!(summary.profile_id.as_deref(), Some("code-explorer"));
    assert_eq!(summary.profile_name.as_deref(), Some("代码分析员"));
    assert_eq!(summary.role_key.as_deref(), Some("explorer"));
    assert_eq!(summary.team_preset_id.as_deref(), Some("code-triage-team"));
    assert_eq!(summary.theme.as_deref(), Some("engineering"));
    assert_eq!(
        summary.output_contract.as_deref(),
        Some("输出证据、影响面与建议。")
    );
    assert_eq!(summary.skill_ids, vec!["repo-exploration".to_string()]);
    assert_eq!(summary.skills.len(), 1);
    assert_eq!(summary.skills[0].name, "仓库探索");
}

#[test]
fn build_subagent_parent_context_should_keep_parent_name_and_filter_current_session() {
    let now = Utc::now();
    let session = build_test_subagent_session(
        "child-current",
        "Image #1",
        Some("parent-1"),
        now - Duration::seconds(10),
        Some("处理父线程拆分出来的图片任务"),
        Some("Image #1"),
        Some("turn-2"),
    );
    let parent_session = AsterSession {
        id: "parent-1".to_string(),
        name: "主线程会话".to_string(),
        session_type: AsterSessionType::User,
        ..AsterSession::default()
    };
    let sibling_subagent_sessions = build_child_subagent_session_summaries(
        None,
        vec![
            build_test_subagent_session(
                "child-current",
                "Image #1",
                Some("parent-1"),
                now - Duration::seconds(10),
                Some("当前子代理"),
                Some("Image #1"),
                Some("turn-2"),
            ),
            build_test_subagent_session(
                "child-sibling",
                "Image #2",
                Some("parent-1"),
                now,
                Some("兄弟子代理"),
                Some("Image #2"),
                Some("turn-2"),
            ),
        ],
    );
    let projection =
        SubagentPresentationProjection::from_session(&session).expect("parent projection");

    let context = build_subagent_parent_context(
        "child-current",
        Some(&parent_session),
        projection,
        sibling_subagent_sessions,
    );

    assert_eq!(context.parent_session_id, "parent-1");
    assert_eq!(context.parent_session_name, "主线程会话");
    assert_eq!(context.role_hint.as_deref(), Some("Image #1"));
    assert_eq!(
        context.task_summary.as_deref(),
        Some("处理父线程拆分出来的图片任务")
    );
    assert_eq!(context.created_from_turn_id.as_deref(), Some("turn-2"));
    assert_eq!(context.sibling_subagent_sessions.len(), 1);
    assert_eq!(context.sibling_subagent_sessions[0].id, "child-sibling");
}

#[test]
fn build_subagent_parent_context_should_merge_customization_projection() {
    let now = Utc::now();
    let mut session = build_test_subagent_session(
        "child-customized",
        "自定义子代理",
        Some("parent-1"),
        now,
        Some("整理 customization"),
        Some("Image #1"),
        Some("turn-9"),
    );
    session.extension_data = SubagentCustomizationState {
        blueprint_role_id: Some("runtime-explorer".to_string()),
        blueprint_role_label: Some("分析".to_string()),
        profile_id: Some("code-explorer".to_string()),
        profile_name: Some("代码分析员".to_string()),
        role_key: Some("explorer".to_string()),
        team_preset_id: Some("code-triage-team".to_string()),
        theme: Some("engineering".to_string()),
        output_contract: Some("输出证据、影响面与建议。".to_string()),
        system_overlay: None,
        skill_ids: vec!["repo-exploration".to_string()],
        skills: vec![SubagentSkillSummary {
            id: "repo-exploration".to_string(),
            name: "仓库探索".to_string(),
            description: Some("优先读事实源".to_string()),
            source: Some("builtin".to_string()),
            directory: None,
        }],
        hooks: None,
        allowed_tools: Vec::new(),
        disallowed_tools: Vec::new(),
    }
    .into_updated_extension_data(&session)
    .expect("merge customization");

    let context = build_subagent_parent_context(
        "child-customized",
        None,
        SubagentPresentationProjection::from_session(&session)
            .expect("parent projection should exist"),
        Vec::new(),
    );

    assert_eq!(
        context.blueprint_role_id.as_deref(),
        Some("runtime-explorer")
    );
    assert_eq!(context.blueprint_role_label.as_deref(), Some("分析"));
    assert_eq!(context.profile_id.as_deref(), Some("code-explorer"));
    assert_eq!(context.profile_name.as_deref(), Some("代码分析员"));
    assert_eq!(context.role_key.as_deref(), Some("explorer"));
    assert_eq!(context.team_preset_id.as_deref(), Some("code-triage-team"));
    assert_eq!(context.theme.as_deref(), Some("engineering"));
    assert_eq!(
        context.output_contract.as_deref(),
        Some("输出证据、影响面与建议。")
    );
    assert_eq!(context.skill_ids, vec!["repo-exploration".to_string()]);
    assert_eq!(context.skills.len(), 1);
    assert_eq!(context.skills[0].name, "仓库探索");
}

#[test]
fn resolve_child_subagent_runtime_status_from_snapshot_should_use_latest_turn_status() {
    let now = Utc::now();
    let snapshot = SessionRuntimeSnapshot {
        session_id: "child-session-1".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new(
                "thread-1",
                "child-session-1",
                std::path::PathBuf::from("/tmp/workspace-child"),
            ),
            turns: vec![
                TurnRuntime {
                    id: "turn-old".to_string(),
                    session_id: "child-session-1".to_string(),
                    thread_id: "thread-1".to_string(),
                    status: TurnStatus::Running,
                    input_text: Some("旧任务".to_string()),
                    error_message: None,
                    context_override: None,
                    output_schema_runtime: None,
                    created_at: now - Duration::minutes(2),
                    started_at: Some(now - Duration::minutes(2)),
                    completed_at: None,
                    updated_at: now - Duration::minutes(1),
                },
                TurnRuntime {
                    id: "turn-new".to_string(),
                    session_id: "child-session-1".to_string(),
                    thread_id: "thread-1".to_string(),
                    status: TurnStatus::Completed,
                    input_text: Some("新任务".to_string()),
                    error_message: None,
                    context_override: None,
                    output_schema_runtime: None,
                    created_at: now - Duration::seconds(30),
                    started_at: Some(now - Duration::seconds(30)),
                    completed_at: Some(now - Duration::seconds(10)),
                    updated_at: now,
                },
            ],
            items: Vec::new(),
        }],
    };

    assert_eq!(
        resolve_child_subagent_runtime_status_from_snapshot(&snapshot),
        ChildSubagentRuntimeStatus::Completed
    );
}

#[test]
fn apply_runtime_status_to_child_subagent_session_should_keep_runtime_detail() {
    let mut summary = ChildSubagentSession::new_base(
        "child-1".to_string(),
        "研究员".to_string(),
        1_710_000_000,
        1_710_000_100,
        "sub_agent".to_string(),
        Some("claude-sonnet-4".to_string()),
        Some("openai".to_string()),
        Some("/tmp/workspace-child".to_string()),
        Some("workspace-1".to_string()),
    );
    summary.task_summary = Some("整理事实源".to_string());
    summary.role_hint = Some("explorer".to_string());
    summary.origin_tool = Some("Agent".to_string());
    summary.created_from_turn_id = Some("turn-1".to_string());

    apply_runtime_status_to_child_subagent_session(
        &mut summary,
        crate::subagent_control::SubagentRuntimeStatus {
            session_id: "child-1".to_string(),
            kind: SubagentRuntimeStatusKind::Queued,
            latest_turn_id: Some("turn-queued".to_string()),
            latest_turn_status: Some(SubagentRuntimeStatusKind::Completed),
            queued_turn_count: 2,
            team_phase: Some("queued".to_string()),
            team_parallel_budget: Some(2),
            team_active_count: Some(2),
            team_queued_count: Some(1),
            provider_concurrency_group: Some("zhipuai".to_string()),
            provider_parallel_budget: Some(1),
            queue_reason: Some(
                "为了避免当前模型通道因并发过多直接拒绝请求，系统已切换为低并发顺序处理。"
                    .to_string(),
            ),
            retryable_overload: true,
            closed: false,
            usage: None,
            duration_ms: None,
            tool_count: None,
            result_ref: None,
        },
    );

    assert_eq!(
        summary.runtime_status,
        Some(ChildSubagentRuntimeStatus::Queued)
    );
    assert_eq!(
        summary.latest_turn_status,
        Some(ChildSubagentRuntimeStatus::Completed)
    );
    assert_eq!(summary.queued_turn_count, 2);
    assert_eq!(summary.team_phase.as_deref(), Some("queued"));
    assert_eq!(
        summary.provider_concurrency_group.as_deref(),
        Some("zhipuai")
    );
    assert!(summary.retryable_overload);
}

#[test]
fn convert_agent_message_should_preserve_tool_request_and_response() {
    let assistant = AgentMessage {
        role: "assistant".to_string(),
        content: MessageContent::Text("".to_string()),
        timestamp: "2026-02-19T13:00:00Z".to_string(),
        tool_calls: Some(vec![ToolCall {
            id: "call-1".to_string(),
            call_type: "function".to_string(),
            function: FunctionCall {
                name: "Write".to_string(),
                arguments: r#"{"path":"./a.txt"}"#.to_string(),
            },
        }]),
        tool_call_id: None,
        reasoning_content: None,
        usage: Some(lime_core::agent::types::TokenUsage::new(20_480, 10_240)),
    };

    let assistant_converted = convert_agent_message(
        &assistant,
        &crate::tool_io_offload::HistoryToolIoEvictionPlan::default(),
    );
    assert!(assistant_converted.content.iter().any(|part| {
        matches!(
            part,
            RuntimeAgentMessageContent::ToolRequest { id, tool_name, .. }
                if id == "call-1" && tool_name == "Write"
        )
    }));
    assert_eq!(
        assistant_converted
            .usage
            .as_ref()
            .map(|usage| (usage.input_tokens, usage.output_tokens)),
        Some((20_480, 10_240))
    );

    let tool = AgentMessage {
        role: "tool".to_string(),
        content: MessageContent::Text("写入成功".to_string()),
        timestamp: "2026-02-19T13:00:01Z".to_string(),
        tool_calls: None,
        tool_call_id: Some("call-1".to_string()),
        reasoning_content: None,
        usage: None,
    };

    let tool_converted = convert_agent_message(
        &tool,
        &crate::tool_io_offload::HistoryToolIoEvictionPlan::default(),
    );
    assert!(!tool_converted
        .content
        .iter()
        .any(|part| matches!(part, RuntimeAgentMessageContent::Text { .. })));
    assert!(tool_converted.content.iter().any(|part| {
        matches!(
            part,
            RuntimeAgentMessageContent::ToolResponse { id, output, .. }
                if id == "call-1" && output == "写入成功"
        )
    }));
}

#[test]
fn convert_user_visible_agent_messages_should_skip_agent_only_history() {
    let messages = vec![
        AgentMessage {
            role: "user".to_string(),
            content: MessageContent::Text("用户消息".to_string()),
            timestamp: "2026-02-19T13:00:00Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
        AgentMessage {
            role: "user".to_string(),
            content: MessageContent::Text("内部续跑提示".to_string()),
            timestamp: "2026-02-19T13:00:01Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
    ];
    let persisted_messages = vec![
        aster::conversation::message::Message::user().with_text("用户消息"),
        aster::conversation::message::Message::user()
            .with_text("内部续跑提示")
            .agent_only(),
    ];

    let converted =
        convert_user_visible_agent_messages(&messages, &persisted_messages, Some("gpt-4.1"));

    assert_eq!(converted.len(), 1);
    assert_eq!(converted[0].role, "user");
    assert!(matches!(
        converted[0].content.as_slice(),
        [RuntimeAgentMessageContent::Text { text }] if text == "用户消息"
    ));
}

#[test]
fn convert_user_visible_agent_messages_with_flags_should_skip_agent_only_history() {
    let messages = vec![
        AgentMessage {
            role: "user".to_string(),
            content: MessageContent::Text("用户消息".to_string()),
            timestamp: "2026-02-19T13:00:00Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
        AgentMessage {
            role: "user".to_string(),
            content: MessageContent::Text("内部续跑提示".to_string()),
            timestamp: "2026-02-19T13:00:01Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
    ];

    let converted = convert_user_visible_agent_messages_with_flags(
        &messages,
        &[true, false],
        Some("gpt-4.1"),
        true,
    );

    assert_eq!(converted.len(), 1);
    assert_eq!(converted[0].role, "user");
    assert!(matches!(
        converted[0].content.as_slice(),
        [RuntimeAgentMessageContent::Text { text }] if text == "用户消息"
    ));
}

#[test]
fn load_user_visible_message_flags_should_default_legacy_messages_to_visible() {
    let db = create_test_db();
    insert_test_session_with_message(
        &db,
        "session-visibility-flags",
        "/tmp/lime-workspace-visibility-flags",
        "用户消息",
    );

    let conn = db.lock().expect("lock db");
    conn.execute(
            "INSERT INTO agent_messages (session_id, role, content_json, timestamp)
             VALUES (?1, 'user', ?2, '2026-03-18T08:00:01Z')",
            rusqlite::params![
                "session-visibility-flags",
                r#"{"content":[{"type":"text","text":"内部续跑提示"}],"userVisible":false,"agentVisible":true}"#,
            ],
        )
        .expect("insert hidden message");

    let flags =
        load_user_visible_message_flags_from_conn(&conn, "session-visibility-flags", None, 0, None)
            .expect("load visibility flags");

    assert_eq!(flags, vec![true, false]);
}

#[test]
fn load_user_visible_message_flags_should_follow_history_tail_limit() {
    let db = create_test_db();
    insert_test_session_with_message(
        &db,
        "session-visibility-tail",
        "/tmp/lime-workspace-visibility-tail",
        "第一条",
    );

    let conn = db.lock().expect("lock db");
    conn.execute(
            "INSERT INTO agent_messages (session_id, role, content_json, timestamp)
             VALUES (?1, 'user', ?2, '2026-03-18T08:00:01Z')",
            rusqlite::params![
                "session-visibility-tail",
                r#"{"content":[{"type":"text","text":"第二条"}],"userVisible":false,"agentVisible":true}"#,
            ],
        )
        .expect("insert hidden message");
    conn.execute(
            "INSERT INTO agent_messages (session_id, role, content_json, timestamp)
             VALUES (?1, 'assistant', ?2, '2026-03-18T08:00:02Z')",
            rusqlite::params![
                "session-visibility-tail",
                r#"{"content":[{"type":"text","text":"第三条"}],"userVisible":true,"agentVisible":true}"#,
            ],
        )
        .expect("insert visible message");

    let flags = load_user_visible_message_flags_from_conn(
        &conn,
        "session-visibility-tail",
        Some(2),
        0,
        None,
    )
    .expect("load visibility flags");

    assert_eq!(flags, vec![false, true]);

    let older_flags = load_user_visible_message_flags_from_conn(
        &conn,
        "session-visibility-tail",
        Some(1),
        1,
        None,
    )
    .expect("load visibility flags page");

    assert_eq!(older_flags, vec![false]);

    let cursor_flags = load_user_visible_message_flags_from_conn(
        &conn,
        "session-visibility-tail",
        Some(1),
        0,
        Some(3),
    )
    .expect("load visibility flags cursor page");

    assert_eq!(cursor_flags, vec![false]);
}

#[test]
fn load_user_visible_message_flags_should_not_scan_huge_history_payloads() {
    let db = create_test_db();
    insert_test_session_with_message(
        &db,
        "session-visibility-huge",
        "/tmp/lime-workspace-visibility-huge",
        "第一条",
    );

    let conn = db.lock().expect("lock db");
    let huge_content = serde_json::json!({
        "content": [
            {
                "type": "text",
                "text": format!("超大内容{}", "a".repeat(600_000))
            }
        ],
        "userVisible": true,
        "agentVisible": true
    })
    .to_string();
    conn.execute(
        "INSERT INTO agent_messages (session_id, role, content_json, timestamp)
             VALUES (?1, 'assistant', ?2, '2026-03-18T08:00:01Z')",
        rusqlite::params!["session-visibility-huge", huge_content],
    )
    .expect("insert huge message");

    let flags = load_user_visible_message_flags_from_conn(
        &conn,
        "session-visibility-huge",
        Some(1),
        0,
        None,
    )
    .expect("load visibility flags");

    assert_eq!(flags, vec![true]);
}

#[test]
fn apply_runtime_usage_fallback_should_fill_latest_assistant_message() {
    let mut messages = vec![
        RuntimeAgentMessage {
            id: None,
            role: "user".to_string(),
            content: vec![RuntimeAgentMessageContent::Text {
                text: "请先起草内容首稿".to_string(),
            }],
            timestamp: 1,
            usage: None,
        },
        RuntimeAgentMessage {
            id: None,
            role: "assistant".to_string(),
            content: vec![RuntimeAgentMessageContent::Text {
                text: "# 内容首稿框架".to_string(),
            }],
            timestamp: 2,
            usage: None,
        },
    ];
    let session = AsterSession {
        id: "session-usage-fallback".to_string(),
        input_tokens: Some(3_833),
        output_tokens: Some(615),
        cache_creation_input_tokens: Some(144),
        ..AsterSession::default()
    };

    let applied = apply_runtime_usage_fallback_to_latest_assistant_message(&mut messages, &session);

    assert_eq!(
        applied.map(|usage| (
            usage.input_tokens,
            usage.output_tokens,
            usage.cache_creation_input_tokens,
        )),
        Some((3_833, 615, Some(144)))
    );
    assert_eq!(
        messages[1].usage.as_ref().map(|usage| (
            usage.input_tokens,
            usage.output_tokens,
            usage.cache_creation_input_tokens,
        )),
        Some((3_833, 615, Some(144)))
    );
}

#[test]
fn apply_runtime_usage_fallback_should_not_override_existing_usage() {
    let mut messages = vec![RuntimeAgentMessage {
        id: None,
        role: "assistant".to_string(),
        content: vec![RuntimeAgentMessageContent::Text {
            text: "已存在 usage".to_string(),
        }],
        timestamp: 2,
        usage: Some(crate::protocol::AgentTokenUsage {
            input_tokens: 20_480,
            output_tokens: 10_240,
            cached_input_tokens: Some(8_192),
            cache_creation_input_tokens: Some(1_024),
        }),
    }];
    let session = AsterSession {
        id: "session-usage-existing".to_string(),
        input_tokens: Some(3_833),
        output_tokens: Some(615),
        ..AsterSession::default()
    };

    let applied = apply_runtime_usage_fallback_to_latest_assistant_message(&mut messages, &session);

    assert!(applied.is_none());
    assert_eq!(
        messages[0].usage.as_ref().map(|usage| (
            usage.input_tokens,
            usage.output_tokens,
            usage.cached_input_tokens,
            usage.cache_creation_input_tokens,
        )),
        Some((20_480, 10_240, Some(8_192), Some(1_024)))
    );
}

#[test]
fn convert_agent_message_should_keep_image_parts_for_history() {
    let user_with_image = AgentMessage {
        role: "user".to_string(),
        content: MessageContent::Parts(vec![
            ContentPart::Text {
                text: "参考图".to_string(),
            },
            ContentPart::ImageUrl {
                image_url: ImageUrl {
                    url: "data:image/png;base64,aGVsbG8=".to_string(),
                    detail: None,
                },
            },
        ]),
        timestamp: "2026-02-19T13:00:02Z".to_string(),
        tool_calls: None,
        tool_call_id: None,
        reasoning_content: None,
        usage: None,
    };

    let converted = convert_agent_message(
        &user_with_image,
        &crate::tool_io_offload::HistoryToolIoEvictionPlan::default(),
    );
    assert!(converted.content.iter().any(|part| {
        matches!(
            part,
            RuntimeAgentMessageContent::Image { mime_type, data }
                if mime_type == "image/png" && data == "aGVsbG8="
        )
    }));
    assert!(converted
        .content
        .iter()
        .any(|part| matches!(part, RuntimeAgentMessageContent::Text { text } if text == "参考图")));
}

#[test]
fn convert_agent_message_should_not_render_user_tool_response_as_plain_text() {
    let user_tool_response = AgentMessage {
        role: "user".to_string(),
        content: MessageContent::Text("任务已完成".to_string()),
        timestamp: "2026-02-19T13:00:03Z".to_string(),
        tool_calls: None,
        tool_call_id: Some("call-2".to_string()),
        reasoning_content: None,
        usage: None,
    };

    let converted = convert_agent_message(
        &user_tool_response,
        &crate::tool_io_offload::HistoryToolIoEvictionPlan::default(),
    );
    assert!(!converted
        .content
        .iter()
        .any(|part| matches!(part, RuntimeAgentMessageContent::Text { .. })));
    assert!(converted.content.iter().any(|part| {
        matches!(
            part,
            RuntimeAgentMessageContent::ToolResponse { id, output, .. }
                if id == "call-2" && output == "任务已完成"
        )
    }));
}

#[test]
fn convert_agent_messages_should_force_offload_old_large_tool_calls_under_context_pressure() {
    let _lock = env_lock().lock().expect("lock env");
    let _env = EnvGuard::set(&[
        (
            crate::tool_io_offload::TOOL_TOKEN_LIMIT_BEFORE_EVICT_ENV_KEYS[0],
            OsString::from("50"),
        ),
        (
            crate::tool_io_offload::CONTEXT_MAX_INPUT_TOKENS_ENV_KEYS[0],
            OsString::from("600"),
        ),
        (
            crate::tool_io_offload::CONTEXT_WINDOW_TRIGGER_RATIO_ENV_KEYS[0],
            OsString::from("0.5"),
        ),
        (
            crate::tool_io_offload::CONTEXT_KEEP_RECENT_MESSAGES_ENV_KEYS[0],
            OsString::from("1"),
        ),
    ]);

    let messages = vec![
        AgentMessage {
            role: "assistant".to_string(),
            content: MessageContent::Text(String::new()),
            timestamp: "2026-03-11T00:00:00Z".to_string(),
            tool_calls: Some(vec![ToolCall {
                id: "call-history-1".to_string(),
                call_type: "function".to_string(),
                function: FunctionCall {
                    name: "Write".to_string(),
                    arguments: serde_json::json!({
                        "path": "docs/huge.md",
                        "content": "token ".repeat(220),
                    })
                    .to_string(),
                },
            }]),
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
        AgentMessage {
            role: "user".to_string(),
            content: MessageContent::Text("token ".repeat(320)),
            timestamp: "2026-03-11T00:00:01Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
        AgentMessage {
            role: "assistant".to_string(),
            content: MessageContent::Text("最近一条消息".to_string()),
            timestamp: "2026-03-11T00:00:02Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
    ];

    let converted = convert_agent_messages(&messages, Some("gpt-4"));
    let first = converted.first().expect("first message");
    let request = first
        .content
        .iter()
        .find_map(|part| match part {
            RuntimeAgentMessageContent::ToolRequest { arguments, .. } => Some(arguments),
            _ => None,
        })
        .expect("tool request");

    let record = request
        .as_object()
        .expect("offloaded request should be object");
    assert!(record.contains_key(crate::tool_io_offload::LIME_TOOL_ARGUMENTS_OFFLOAD_KEY));
}

#[test]
fn convert_agent_messages_should_skip_context_eviction_for_limited_history_window() {
    let _lock = env_lock().lock().expect("lock env");
    let _env = EnvGuard::set(&[
        (
            crate::tool_io_offload::TOOL_TOKEN_LIMIT_BEFORE_EVICT_ENV_KEYS[0],
            OsString::from("50"),
        ),
        (
            crate::tool_io_offload::CONTEXT_MAX_INPUT_TOKENS_ENV_KEYS[0],
            OsString::from("600"),
        ),
        (
            crate::tool_io_offload::CONTEXT_WINDOW_TRIGGER_RATIO_ENV_KEYS[0],
            OsString::from("0.5"),
        ),
        (
            crate::tool_io_offload::CONTEXT_KEEP_RECENT_MESSAGES_ENV_KEYS[0],
            OsString::from("1"),
        ),
    ]);

    let messages = vec![
        AgentMessage {
            role: "assistant".to_string(),
            content: MessageContent::Text(String::new()),
            timestamp: "2026-03-11T00:00:00Z".to_string(),
            tool_calls: Some(vec![ToolCall {
                id: "call-history-window".to_string(),
                call_type: "function".to_string(),
                function: FunctionCall {
                    name: "Write".to_string(),
                    arguments: serde_json::json!({
                        "path": "docs/huge.md",
                        "content": "token ".repeat(220),
                    })
                    .to_string(),
                },
            }]),
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
        AgentMessage {
            role: "user".to_string(),
            content: MessageContent::Text("token ".repeat(320)),
            timestamp: "2026-03-11T00:00:01Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
        AgentMessage {
            role: "assistant".to_string(),
            content: MessageContent::Text("最近一条消息".to_string()),
            timestamp: "2026-03-11T00:00:02Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
    ];

    let converted = convert_agent_messages_with_history_eviction(&messages, Some("gpt-4"), false);
    let first = converted.first().expect("first message");
    let request = first
        .content
        .iter()
        .find_map(|part| match part {
            RuntimeAgentMessageContent::ToolRequest { arguments, .. } => Some(arguments),
            _ => None,
        })
        .expect("tool request");

    let record = request
        .as_object()
        .expect("display request should remain an object");
    assert!(!record.contains_key(crate::tool_io_offload::LIME_TOOL_ARGUMENTS_OFFLOAD_KEY));
    assert!(record.contains_key("content"));
}

#[test]
fn list_sessions_sync_should_resolve_workspace_id_from_working_dir() {
    let db = create_test_db();
    insert_test_workspace(&db, "workspace-1", "/tmp/lime-workspace-1");
    insert_test_session_with_message(&db, "session-1", "/tmp/lime-workspace-1", "你好，世界");

    let sessions = list_sessions_sync(&db, SessionArchiveFilter::ActiveOnly, &[], None)
        .expect("list sessions");
    let session = sessions
        .iter()
        .find(|item| item.id == "session-1")
        .expect("session exists");

    assert_eq!(session.workspace_id.as_deref(), Some("workspace-1"));
    assert_eq!(
        session.working_dir.as_deref(),
        Some("/tmp/lime-workspace-1")
    );
    assert_eq!(session.messages_count, 0);
}

#[test]
fn list_sessions_sync_should_include_archived_sessions_when_requested() {
    let db = create_test_db();
    insert_test_session_with_message(&db, "session-active", "/tmp/lime-workspace-6", "活跃");
    insert_test_session_with_message(&db, "session-archived", "/tmp/lime-workspace-7", "归档");

    update_session_archived_state_sync(&db, "session-archived", true).expect("archive session");

    let active_only = list_sessions_sync(&db, SessionArchiveFilter::ActiveOnly, &[], None)
        .expect("list active sessions");
    assert_eq!(active_only.len(), 1);
    assert_eq!(active_only[0].id, "session-active");

    let with_archived =
        list_sessions_sync(&db, SessionArchiveFilter::All, &[], None).expect("list all sessions");
    let archived_session = with_archived
        .iter()
        .find(|item| item.id == "session-archived")
        .expect("archived session exists");
    assert!(archived_session.archived_at.is_some());
}

#[test]
fn list_sessions_sync_should_support_cwd_filter_and_limit() {
    let db = create_test_db();
    insert_test_workspace(&db, "workspace-8", "/tmp/lime-workspace-8");
    insert_test_workspace(&db, "workspace-9", "/tmp/lime-workspace-9");
    insert_test_session_with_message(&db, "session-a", "/tmp/lime-workspace-8", "A");
    insert_test_session_with_message(&db, "session-b", "/tmp/lime-workspace-8", "B");
    insert_test_session_with_message(&db, "session-c", "/tmp/lime-workspace-9", "C");

    let filtered = list_sessions_sync(
        &db,
        SessionArchiveFilter::ActiveOnly,
        &["/tmp/lime-workspace-8".to_string()],
        Some(1),
    )
    .expect("list filtered sessions");

    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].workspace_id.as_deref(), Some("workspace-8"));
}

#[test]
fn get_session_sync_should_resolve_workspace_id_from_working_dir() {
    let db = create_test_db();
    insert_test_workspace(&db, "workspace-2", "/tmp/lime-workspace-2");
    insert_test_session_with_message(&db, "session-2", "/tmp/lime-workspace-2", "继续处理");

    let detail = get_session_sync(&db, "session-2").expect("get session");

    assert_eq!(detail.workspace_id.as_deref(), Some("workspace-2"));
    assert_eq!(detail.working_dir.as_deref(), Some("/tmp/lime-workspace-2"));
    assert!(detail.messages.is_empty());
}

#[test]
fn get_session_sync_with_full_timeline_without_messages_should_skip_messages() {
    use lime_core::database::dao::agent_timeline::{
        AgentThreadItem, AgentThreadItemPayload, AgentThreadItemStatus, AgentThreadTurn,
        AgentThreadTurnStatus, AgentTimelineDao,
    };

    let db = create_test_db();
    insert_test_workspace(&db, "workspace-light", "/tmp/lime-workspace-light");
    insert_test_session_with_message(
        &db,
        "session-light",
        "/tmp/lime-workspace-light",
        "这条消息不应被轻量 checkpoint 读取投影",
    );

    {
        let conn = db.lock().expect("lock db");
        AgentTimelineDao::create_turn(
            &conn,
            &AgentThreadTurn {
                id: "turn-light".to_string(),
                thread_id: "session-light".to_string(),
                prompt_text: "生成文件".to_string(),
                status: AgentThreadTurnStatus::Completed,
                started_at: "2026-06-02T10:00:00Z".to_string(),
                completed_at: Some("2026-06-02T10:00:01Z".to_string()),
                error_message: None,
                created_at: "2026-06-02T10:00:00Z".to_string(),
                updated_at: "2026-06-02T10:00:01Z".to_string(),
            },
        )
        .expect("create turn");
        AgentTimelineDao::upsert_item(
            &conn,
            &AgentThreadItem {
                id: "artifact-light".to_string(),
                thread_id: "session-light".to_string(),
                turn_id: "turn-light".to_string(),
                sequence: 1,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-06-02T10:00:00Z".to_string(),
                completed_at: Some("2026-06-02T10:00:01Z".to_string()),
                updated_at: "2026-06-02T10:00:01Z".to_string(),
                payload: AgentThreadItemPayload::FileArtifact {
                    path: ".lime/qc/code-runtime-fixture/src/greeting.ts".to_string(),
                    source: "tool_result".to_string(),
                    content: Some("export const ok = true;".to_string()),
                    metadata: None,
                },
            },
        )
        .expect("upsert item");
    }

    let detail = get_session_sync_with_full_timeline_without_messages(&db, "session-light")
        .expect("get lightweight detail");

    assert_eq!(detail.workspace_id.as_deref(), Some("workspace-light"));
    assert!(detail.messages.is_empty());
    assert_eq!(detail.turns.len(), 1);
    assert_eq!(detail.items.len(), 1);
}

#[test]
fn get_session_sync_with_history_limit_should_not_return_legacy_messages() {
    let db = create_test_db();
    insert_test_session_with_message(&db, "session-tail", "/tmp/lime-workspace-tail", "消息 1");

    {
        let conn = db.lock().expect("lock db");
        for index in 2..=4 {
            insert_legacy_agent_message(
                &conn,
                "session-tail",
                &AgentMessage {
                    role: if index % 2 == 0 {
                        "assistant".to_string()
                    } else {
                        "user".to_string()
                    },
                    content: MessageContent::Text(format!("消息 {index}")),
                    timestamp: format!("2026-03-18T08:00:0{index}Z"),
                    tool_calls: None,
                    tool_call_id: None,
                    reasoning_content: None,
                    usage: None,
                },
            )
            .expect("add message");
        }
    }

    let detail = get_session_sync_with_history_limit(&db, "session-tail", Some(2))
        .expect("get tail session");

    assert!(detail.messages.is_empty());

    let older_detail = get_session_sync_with_history_window(&db, "session-tail", Some(2), 2)
        .expect("get older session page");

    assert!(older_detail.messages.is_empty());

    let cursor_detail =
        get_session_sync_with_history_page(&db, "session-tail", Some(2), 0, Some(3))
            .expect("get cursor session page");

    assert!(cursor_detail.messages.is_empty());
}

#[tokio::test]
async fn get_runtime_session_detail_should_use_archived_fast_path() {
    let db = create_test_db();
    insert_test_session_with_message(
        &db,
        "session-archived-fast-path",
        "/tmp/lime-workspace-archived-fast-path",
        "查看归档",
    );
    update_session_archived_state_sync(&db, "session-archived-fast-path", true)
        .expect("archive session");

    let detail = get_runtime_session_detail(&db, "session-archived-fast-path")
        .await
        .expect("get archived session detail");

    assert!(detail.messages.is_empty());
    assert!(detail.execution_runtime.is_none());
    assert!(detail.child_subagent_sessions.is_empty());
    assert!(detail.subagent_parent_context.is_none());
}

#[tokio::test]
async fn get_runtime_session_detail_should_use_empty_persisted_fast_path() {
    let db = create_test_db();
    create_session_record_sync(
        &db,
        CreateSessionRecordInput {
            session_id: Some("session-empty-fast-path".to_string()),
            title: Some("空会话".to_string()),
            model: Some("agent:test".to_string()),
            working_dir: Some("/tmp/lime-workspace-empty-fast-path".to_string()),
            execution_strategy: Some("react".to_string()),
            ..CreateSessionRecordInput::default()
        },
    )
    .expect("create empty session");

    let detail = get_runtime_session_detail(&db, "session-empty-fast-path")
        .await
        .expect("get empty session detail");

    assert!(detail.is_persisted_empty());
    assert!(detail.execution_runtime.is_none());
    assert!(detail.child_subagent_sessions.is_empty());
    assert!(detail.subagent_parent_context.is_none());
}

#[test]
fn apply_current_runtime_conversation_should_read_current_store_messages() {
    let mut detail = build_empty_runtime_detail();
    let mut session = aster::session::Session {
        id: "session-current-runtime-history".to_string(),
        conversation: Some(aster::conversation::Conversation::new_unvalidated([
            aster::conversation::message::Message::user().with_text("第一条用户消息"),
            aster::conversation::message::Message::assistant().with_text("第一条助手消息"),
            aster::conversation::message::Message::assistant()
                .with_text("内部续跑消息")
                .agent_only(),
            aster::conversation::message::Message::user().with_text("第二条用户消息"),
        ])),
        ..aster::session::Session::default()
    };

    super::session_store_runtime_detail::apply_current_runtime_conversation(
        &mut detail,
        &session,
        Some(2),
        0,
        None,
    );

    assert_eq!(detail.messages.len(), 2);
    assert_eq!(detail.messages[0].role, "assistant");
    assert!(detail.messages[0].content.iter().any(|part| {
        matches!(part, RuntimeAgentMessageContent::Text { text } if text == "第一条助手消息")
    }));
    assert_eq!(detail.messages[1].role, "user");
    assert!(detail.messages[1].content.iter().any(|part| {
        matches!(part, RuntimeAgentMessageContent::Text { text } if text == "第二条用户消息")
    }));

    super::session_store_runtime_detail::apply_current_runtime_conversation(
        &mut detail,
        &session,
        Some(1),
        1,
        None,
    );
    assert_eq!(detail.messages.len(), 1);
    assert!(detail.messages[0].content.iter().any(|part| {
        matches!(part, RuntimeAgentMessageContent::Text { text } if text == "第一条助手消息")
    }));

    session.conversation = None;
    super::session_store_runtime_detail::apply_current_runtime_conversation(
        &mut detail,
        &session,
        None,
        0,
        None,
    );
    assert_eq!(detail.messages.len(), 1);
}

#[test]
fn update_session_working_dir_sync_should_refresh_workspace_binding() {
    let db = create_test_db();
    insert_test_workspace(&db, "workspace-3", "/tmp/lime-workspace-3");
    insert_test_workspace(&db, "workspace-4", "/tmp/lime-workspace-4");
    insert_test_session_with_message(&db, "session-3", "/tmp/lime-workspace-3", "切换目录");

    update_session_working_dir_sync(&db, "session-3", "/tmp/lime-workspace-4")
        .expect("update working_dir");

    let detail = get_session_sync(&db, "session-3").expect("get session");
    assert_eq!(detail.working_dir.as_deref(), Some("/tmp/lime-workspace-4"));
    assert_eq!(detail.workspace_id.as_deref(), Some("workspace-4"));
}

#[test]
fn update_session_provider_config_sync_should_persist_provider_and_model_config() {
    let db = create_test_db();
    insert_test_session_with_message(
        &db,
        "session-provider-config",
        "/tmp/lime-workspace-provider-config",
        "切换模型",
    );

    update_session_provider_config_sync(
        &db,
        "session-provider-config",
        Some("openai"),
        Some("gpt-5.4-mini"),
    )
    .expect("update provider config");

    let conn = db.lock().expect("lock db");
    let (provider_name, model_name, model_config_json): (Option<String>, String, Option<String>) =
        conn.query_row(
            "SELECT provider_name, model, model_config_json FROM agent_sessions WHERE id = ?",
            ["session-provider-config"],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("query session provider config");

    assert_eq!(provider_name.as_deref(), Some("openai"));
    assert_eq!(model_name, "gpt-5.4-mini");
    assert!(model_config_json
        .as_deref()
        .is_some_and(|value| value.contains("\"model_name\":\"gpt-5.4-mini\"")));
}

#[test]
fn rename_session_sync_should_update_session_title() {
    let db = create_test_db();
    insert_test_session_with_message(&db, "session-rename", "/tmp/lime-workspace-5", "原始消息");

    rename_session_sync(&db, "session-rename", "新的会话标题").expect("rename session");

    let session = get_session_sync(&db, "session-rename").expect("get session");
    assert_eq!(session.name, "新的会话标题");
}

#[test]
fn list_title_preview_messages_sync_should_not_read_legacy_agent_messages() {
    let db = create_test_db();
    create_session_record_sync(
        &db,
        CreateSessionRecordInput {
            session_id: Some("session-title".to_string()),
            title: Some("测试标题".to_string()),
            model: Some("agent:test".to_string()),
            execution_strategy: Some("react".to_string()),
            ..CreateSessionRecordInput::default()
        },
    )
    .expect("create session");

    let conn = db.lock().expect("lock db");
    insert_legacy_agent_message(
        &conn,
        "session-title",
        &AgentMessage {
            role: "system".to_string(),
            content: MessageContent::Text("忽略这条系统消息".to_string()),
            timestamp: "2026-03-18T08:00:00Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
    )
    .expect("add system message");
    insert_legacy_agent_message(
        &conn,
        "session-title",
        &AgentMessage {
            role: "user".to_string(),
            content: MessageContent::Text("第一条用户消息".to_string()),
            timestamp: "2026-03-18T08:01:00Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
    )
    .expect("add user message");
    insert_legacy_agent_message(
        &conn,
        "session-title",
        &AgentMessage {
            role: "assistant".to_string(),
            content: MessageContent::Text("第一条助手消息".to_string()),
            timestamp: "2026-03-18T08:02:00Z".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            usage: None,
        },
    )
    .expect("add assistant message");
    insert_legacy_agent_message(
        &conn,
        "session-title",
        &AgentMessage {
            role: "tool".to_string(),
            content: MessageContent::Text("忽略工具输出".to_string()),
            timestamp: "2026-03-18T08:03:00Z".to_string(),
            tool_calls: None,
            tool_call_id: Some("tool-1".to_string()),
            reasoning_content: None,
            usage: None,
        },
    )
    .expect("add tool message");
    drop(conn);

    let preview = list_title_preview_messages_sync(&db, "session-title", 4).expect("load preview");
    assert!(preview.is_empty());
}
