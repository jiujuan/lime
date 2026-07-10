use super::{
    build_session_execution_runtime, SessionExecutionRuntimeAccessMode,
    SessionExecutionRuntimePreferences, SessionExecutionRuntimeRecentTeamRole,
    SessionExecutionRuntimeRecentTeamSelection, SessionExecutionRuntimeSource,
};
use aster::{
    ExtensionData, Session, SessionRuntimeSnapshot, ThreadRuntime, ThreadRuntimeSnapshot,
    TurnContextOverride, TurnRuntime, TurnStatus,
};
use chrono::{Duration, Utc};
use serde_json::json;
use std::path::PathBuf;

fn set_recent_extension_state<T: serde::Serialize>(
    extension_data: &mut ExtensionData,
    extension_name: &str,
    state: &T,
) {
    extension_data.set_extension_state(
        extension_name,
        "v0",
        serde_json::to_value(state).expect("extension state should serialize"),
    );
}

#[test]
fn keeps_recent_preferences_from_latest_turn_metadata() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-pref".to_string(),
        session_id: "session-3".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride {
            metadata: std::collections::HashMap::from([(
                "harness".to_string(),
                json!({
                    "preferences": {
                        "webSearch": true,
                        "thinking": true,
                        "task": false,
                        "subagent": true,
                    }
                }),
            )]),
            ..TurnContextOverride::default()
        }),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now - Duration::seconds(1)),
        updated_at: now,
    };
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-3".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new("thread-1", "session-3", PathBuf::from("/tmp/workspace")),
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime = build_session_execution_runtime("session-3", None, None, Some(&snapshot), None)
        .expect("runtime");

    assert_eq!(
        runtime.source,
        SessionExecutionRuntimeSource::RuntimeSnapshot
    );
    assert_eq!(
        runtime.recent_preferences,
        Some(SessionExecutionRuntimePreferences {
            web_search: Some(true),
            thinking: Some(true),
            task: false,
            subagent: true,
        })
    );
}

#[test]
fn keeps_recent_access_mode_from_latest_turn_context_override() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-access".to_string(),
        session_id: "session-access".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride {
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("danger-full-access".to_string()),
            ..TurnContextOverride::default()
        }),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now - Duration::seconds(1)),
        updated_at: now,
    };
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-access".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new(
                "thread-1",
                "session-access",
                PathBuf::from("/tmp/workspace"),
            ),
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime =
        build_session_execution_runtime("session-access", None, None, Some(&snapshot), None)
            .expect("runtime");

    assert_eq!(
        runtime.recent_access_mode,
        Some(SessionExecutionRuntimeAccessMode::FullAccess)
    );
}

#[test]
fn falls_back_to_session_recent_access_mode_when_runtime_snapshot_missing() {
    let mut session = Session {
        id: "session-access-fallback".to_string(),
        ..Session::default()
    };
    set_recent_extension_state(
        &mut session.extension_data,
        "lime_recent_access_mode",
        &SessionExecutionRuntimeAccessMode::ReadOnly,
    );

    let runtime = build_session_execution_runtime(
        "session-access-fallback",
        Some(&session),
        Some("react".to_string()),
        None,
        None,
    )
    .expect("runtime");

    assert_eq!(
        runtime.recent_access_mode,
        Some(SessionExecutionRuntimeAccessMode::ReadOnly)
    );
}

#[test]
fn access_mode_serde_prefers_kebab_case_and_accepts_legacy_snake_case() {
    assert_eq!(
        serde_json::to_value(SessionExecutionRuntimeAccessMode::FullAccess)
            .expect("serialize access mode"),
        json!("full-access")
    );
    assert_eq!(
        serde_json::from_value::<SessionExecutionRuntimeAccessMode>(json!("full-access"))
            .expect("deserialize kebab-case access mode"),
        SessionExecutionRuntimeAccessMode::FullAccess
    );
    assert_eq!(
        serde_json::from_value::<SessionExecutionRuntimeAccessMode>(json!("full_access"))
            .expect("deserialize legacy snake_case access mode"),
        SessionExecutionRuntimeAccessMode::FullAccess
    );
}

#[test]
fn default_session_access_mode_is_full_access() {
    assert_eq!(
        SessionExecutionRuntimeAccessMode::default_for_session(),
        SessionExecutionRuntimeAccessMode::FullAccess
    );
}

#[test]
fn keeps_recent_team_selection_from_latest_turn_metadata() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-team".to_string(),
        session_id: "session-5".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride {
            metadata: std::collections::HashMap::from([(
                "harness".to_string(),
                json!({
                    "theme": "general",
                    "preferred_team_preset_id": "code-triage-team",
                    "selected_team_id": "custom-team-1",
                    "selected_team_source": "custom",
                    "selected_team_label": "前端联调团队",
                    "selected_team_description": "分析、实现、验证三段式推进。",
                    "selected_team_summary": "分析、实现、验证三段式推进。 角色分工：分析：负责定位问题与影响范围。",
                    "selected_team_roles": [
                        {
                            "id": "explorer",
                            "label": "分析",
                            "summary": "负责定位问题与影响范围。",
                            "profile_id": "code-explorer",
                            "role_key": "explorer",
                            "skill_ids": ["repo-exploration"]
                        }
                    ]
                }),
            )]),
            ..TurnContextOverride::default()
        }),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now - Duration::seconds(1)),
        updated_at: now,
    };
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-5".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new("thread-1", "session-5", PathBuf::from("/tmp/workspace")),
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime = build_session_execution_runtime("session-5", None, None, Some(&snapshot), None)
        .expect("runtime");

    assert_eq!(
        runtime.recent_team_selection,
        Some(SessionExecutionRuntimeRecentTeamSelection {
            disabled: false,
            theme: Some("general".to_string()),
            preferred_team_preset_id: Some("code-triage-team".to_string()),
            selected_team_id: Some("custom-team-1".to_string()),
            selected_team_source: Some("custom".to_string()),
            selected_team_label: Some("前端联调团队".to_string()),
            selected_team_description: Some("分析、实现、验证三段式推进。".to_string()),
            selected_team_summary: Some(
                "分析、实现、验证三段式推进。 角色分工：分析：负责定位问题与影响范围。".to_string(),
            ),
            selected_team_roles: Some(vec![SessionExecutionRuntimeRecentTeamRole {
                id: "explorer".to_string(),
                label: "分析".to_string(),
                summary: "负责定位问题与影响范围。".to_string(),
                profile_id: Some("code-explorer".to_string()),
                role_key: Some("explorer".to_string()),
                skill_ids: vec!["repo-exploration".to_string()],
            }]),
        })
    );
}

#[test]
fn keeps_recent_content_id_from_latest_turn_metadata() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-content".to_string(),
        session_id: "session-content".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride {
            metadata: std::collections::HashMap::from([(
                "harness".to_string(),
                json!({
                    "content_id": "content-current",
                    "agent_response_language": "en-US"
                }),
            )]),
            ..TurnContextOverride::default()
        }),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now - Duration::seconds(1)),
        updated_at: now,
    };
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-content".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new(
                "thread-1",
                "session-content",
                PathBuf::from("/tmp/workspace"),
            ),
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime =
        build_session_execution_runtime("session-content", None, None, Some(&snapshot), None)
            .expect("runtime");

    assert_eq!(
        runtime.source,
        SessionExecutionRuntimeSource::RuntimeSnapshot
    );
    assert_eq!(
        runtime.recent_content_id.as_deref(),
        Some("content-current")
    );
    assert_eq!(runtime.recent_response_language.as_deref(), Some("en-US"));
}

#[test]
fn keeps_recent_theme_and_session_mode_from_latest_turn_metadata() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-harness".to_string(),
        session_id: "session-harness".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride {
            metadata: std::collections::HashMap::from([(
                "harness".to_string(),
                json!({
                    "theme": "general",
                    "session_mode": "general_workbench",
                    "gate_key": "write_mode",
                    "run_title": "社媒初稿",
                    "content_id": "content-current",
                    "response_language": "auto"
                }),
            )]),
            ..TurnContextOverride::default()
        }),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now - Duration::seconds(1)),
        updated_at: now,
    };
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-harness".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread: ThreadRuntime::new(
                "thread-1",
                "session-harness",
                PathBuf::from("/tmp/workspace"),
            ),
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime =
        build_session_execution_runtime("session-harness", None, None, Some(&snapshot), None)
            .expect("runtime");

    assert_eq!(runtime.recent_theme.as_deref(), Some("general"));
    assert_eq!(
        runtime.recent_session_mode.as_deref(),
        Some("general_workbench")
    );
    assert_eq!(runtime.recent_gate_key.as_deref(), Some("write_mode"));
    assert_eq!(runtime.recent_run_title.as_deref(), Some("社媒初稿"));
    assert_eq!(
        runtime.recent_content_id.as_deref(),
        Some("content-current")
    );
    assert_eq!(runtime.recent_response_language.as_deref(), Some("auto"));
}

#[test]
fn falls_back_to_thread_metadata_recent_content_id() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-without-content".to_string(),
        session_id: "session-thread-content".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride::default()),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now - Duration::seconds(1)),
        updated_at: now,
    };
    let mut thread = ThreadRuntime::new(
        "thread-1",
        "session-thread-content",
        PathBuf::from("/tmp/workspace"),
    );
    thread
        .metadata
        .insert("content_id".to_string(), json!("content-from-thread"));
    thread
        .metadata
        .insert("agent_response_language".to_string(), json!("ja-JP"));
    thread.updated_at = now;
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-thread-content".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread,
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime = build_session_execution_runtime(
        "session-thread-content",
        None,
        None,
        Some(&snapshot),
        None,
    )
    .expect("runtime");

    assert_eq!(
        runtime.recent_content_id.as_deref(),
        Some("content-from-thread")
    );
    assert_eq!(runtime.recent_response_language.as_deref(), Some("ja-JP"));
}

#[test]
fn falls_back_to_thread_metadata_recent_theme_and_session_mode() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-without-harness".to_string(),
        session_id: "session-thread-harness".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride::default()),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now - Duration::seconds(1)),
        updated_at: now,
    };
    let mut thread = ThreadRuntime::new(
        "thread-1",
        "session-thread-harness",
        PathBuf::from("/tmp/workspace"),
    );
    thread
        .metadata
        .insert("theme".to_string(), json!("document"));
    thread
        .metadata
        .insert("session_mode".to_string(), json!("general_workbench"));
    thread
        .metadata
        .insert("gate_key".to_string(), json!("publish_confirm"));
    thread
        .metadata
        .insert("run_title".to_string(), json!("发布确认"));
    thread
        .metadata
        .insert("content_id".to_string(), json!("content-from-thread"));
    thread.updated_at = now;
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-thread-harness".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread,
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime = build_session_execution_runtime(
        "session-thread-harness",
        None,
        None,
        Some(&snapshot),
        None,
    )
    .expect("runtime");

    assert_eq!(runtime.recent_theme.as_deref(), Some("document"));
    assert_eq!(
        runtime.recent_session_mode.as_deref(),
        Some("general_workbench")
    );
    assert_eq!(runtime.recent_gate_key.as_deref(), Some("publish_confirm"));
    assert_eq!(runtime.recent_run_title.as_deref(), Some("发布确认"));
    assert_eq!(
        runtime.recent_content_id.as_deref(),
        Some("content-from-thread")
    );
}

#[test]
fn falls_back_to_thread_metadata_recent_response_language() {
    let now = Utc::now();
    let latest_turn = TurnRuntime {
        id: "turn-without-response-language".to_string(),
        session_id: "session-thread-response-language".to_string(),
        thread_id: "thread-1".to_string(),
        status: TurnStatus::Completed,
        input_text: Some("hello".to_string()),
        error_message: None,
        context_override: Some(TurnContextOverride::default()),
        output_schema_runtime: None,
        created_at: now - Duration::seconds(10),
        started_at: Some(now - Duration::seconds(10)),
        completed_at: Some(now - Duration::seconds(1)),
        updated_at: now,
    };
    let mut thread = ThreadRuntime::new(
        "thread-1",
        "session-thread-response-language",
        PathBuf::from("/tmp/workspace"),
    );
    thread
        .metadata
        .insert("response_language".to_string(), json!("ko-KR"));
    thread.updated_at = now;
    let snapshot = SessionRuntimeSnapshot {
        session_id: "session-thread-response-language".to_string(),
        threads: vec![ThreadRuntimeSnapshot {
            thread,
            turns: vec![latest_turn],
            items: Vec::new(),
        }],
    };

    let runtime = build_session_execution_runtime(
        "session-thread-response-language",
        None,
        None,
        Some(&snapshot),
        None,
    )
    .expect("runtime");

    assert_eq!(runtime.recent_response_language.as_deref(), Some("ko-KR"));
}

#[test]
fn falls_back_to_session_extension_data_recent_preferences() {
    let mut extension_data = ExtensionData::default();
    set_recent_extension_state(
        &mut extension_data,
        "lime_recent_preferences",
        &SessionExecutionRuntimePreferences {
            web_search: Some(false),
            thinking: Some(true),
            task: true,
            subagent: false,
        },
    );
    let session = Session {
        id: "session-4".to_string(),
        extension_data,
        ..Session::default()
    };

    let runtime = build_session_execution_runtime("session-4", Some(&session), None, None, None)
        .expect("runtime");

    assert_eq!(runtime.source, SessionExecutionRuntimeSource::Session);
    assert_eq!(
        runtime.recent_preferences,
        Some(SessionExecutionRuntimePreferences {
            web_search: Some(false),
            thinking: Some(true),
            task: true,
            subagent: false,
        })
    );
}

#[test]
fn falls_back_to_session_extension_data_recent_team_selection() {
    let mut extension_data = ExtensionData::default();
    set_recent_extension_state(
        &mut extension_data,
        "lime_recent_team_selection",
        &SessionExecutionRuntimeRecentTeamSelection {
            disabled: true,
            theme: Some("general".to_string()),
            preferred_team_preset_id: None,
            selected_team_id: None,
            selected_team_source: None,
            selected_team_label: None,
            selected_team_description: None,
            selected_team_summary: None,
            selected_team_roles: None,
        },
    );
    let session = Session {
        id: "session-6".to_string(),
        extension_data,
        ..Session::default()
    };

    let runtime = build_session_execution_runtime("session-6", Some(&session), None, None, None)
        .expect("runtime");

    assert_eq!(
        runtime.recent_team_selection,
        Some(SessionExecutionRuntimeRecentTeamSelection {
            disabled: true,
            theme: Some("general".to_string()),
            preferred_team_preset_id: None,
            selected_team_id: None,
            selected_team_source: None,
            selected_team_label: None,
            selected_team_description: None,
            selected_team_summary: None,
            selected_team_roles: None,
        })
    );
}
