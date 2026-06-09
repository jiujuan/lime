use super::data_error;
use super::workspaces;
use crate::RuntimeCoreError;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionListResponse;
use app_server_protocol::AgentSessionOverview;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentSessionUpdateParams;
use app_server_protocol::AgentSessionUpdateResponse;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::BusinessObjectRef;
use chrono::DateTime;
use chrono::Utc;
use lime_core::database;
use lime_core::database::dao::agent_timeline::AgentThreadItem;
use lime_core::database::dao::agent_timeline::AgentThreadTurn;
use lime_core::database::dao::agent_timeline::AgentThreadTurnStatus;
use lime_core::database::dao::agent_timeline::AgentTimelineDao;
use lime_core::database::DbConnection;
use rusqlite::params;
use rusqlite::OptionalExtension;
use rusqlite::Row;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;

const CURRENT_TIMELINE_LIST_MAX_LIMIT: usize = 1_000;
const CURRENT_TIMELINE_HISTORY_DEFAULT_LIMIT: usize = 320;
const CURRENT_TIMELINE_HISTORY_MAX_LIMIT: usize = 1_000;
const APP_ID_AGENT_RUNTIME: &str = "agent-runtime";

pub(crate) fn list_current_timeline_sessions(
    db: &DbConnection,
    params: AgentSessionListParams,
) -> Result<AgentSessionListResponse, RuntimeCoreError> {
    let workspace_id = workspaces::normalize_workspace_filter(params.workspace_id.as_deref());
    let include_archived = params.include_archived.unwrap_or(false);
    let archived_only = params.archived_only.unwrap_or(false);
    let limit = params
        .limit
        .map(|value| (value as usize).min(CURRENT_TIMELINE_LIST_MAX_LIMIT));
    let conn = database::lock_db(db).map_err(data_error)?;
    let sessions = query_current_timeline_session_overviews(
        &conn,
        include_archived,
        archived_only,
        workspace_id,
        limit,
    )
    .map_err(data_error)?;
    Ok(AgentSessionListResponse { sessions })
}

pub(crate) fn read_current_timeline_session(
    db: &DbConnection,
    params: AgentSessionReadParams,
) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
    let history_limit = params
        .history_limit
        .map(|value| (value as usize).min(CURRENT_TIMELINE_HISTORY_MAX_LIMIT))
        .unwrap_or(CURRENT_TIMELINE_HISTORY_DEFAULT_LIMIT);
    let history_offset = params.history_offset.unwrap_or(0) as usize;
    let current_response = {
        let conn = database::lock_db(db).map_err(data_error)?;
        let Some(session) =
            query_current_timeline_session(&conn, &params.session_id).map_err(data_error)?
        else {
            return Ok(None);
        };
        let has_timeline =
            current_timeline_session_has_entries(&conn, &params.session_id).map_err(data_error)?;
        if !has_timeline {
            return Ok(None);
        } else {
            let timeline_turns = AgentTimelineDao::list_turns_by_thread_tail_page(
                &conn,
                &params.session_id,
                history_limit,
                history_offset,
            )
            .map_err(data_error)?;
            let turns = timeline_turns
                .iter()
                .cloned()
                .map(agent_thread_turn_to_protocol)
                .collect::<Vec<_>>();
            let items = AgentTimelineDao::list_items_by_thread_tail_page(
                &conn,
                &params.session_id,
                history_limit,
                history_offset,
            )
            .map_err(data_error)?;
            let messages_count =
                current_timeline_item_count(&conn, &params.session_id).map_err(data_error)?;
            let detail = current_timeline_detail_value(
                &session,
                &timeline_turns,
                &items,
                messages_count,
                history_limit,
                history_offset,
            )?;

            Some(AgentSessionReadResponse {
                session: current_timeline_session_to_protocol(&session),
                turns,
                detail: Some(detail),
            })
        }
    };

    if let Some(response) = current_response {
        return Ok(Some(response));
    }

    Ok(None)
}

pub(crate) fn update_current_timeline_session(
    db: &DbConnection,
    params: AgentSessionUpdateParams,
) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
    let session_id = params.session_id.trim();
    if session_id.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "sessionId is required for agentSession/update".to_string(),
        ));
    }

    let title = params
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let provider_selector = params
        .provider_selector
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let provider_name = params
        .provider_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let model_name = params
        .model_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let execution_strategy = params
        .execution_strategy
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let recent_access_mode = params
        .recent_access_mode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let conn = database::lock_db(db).map_err(data_error)?;
    update_current_timeline_session_row(
        &conn,
        session_id,
        title,
        provider_selector,
        provider_name,
        model_name,
        execution_strategy,
        params.archived,
        recent_access_mode,
        params.recent_preferences.as_ref(),
        params.recent_team_selection.as_ref(),
    )
    .map_err(data_error)?;
    let session = query_current_timeline_session(&conn, session_id)
        .map_err(data_error)?
        .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;

    Ok(AgentSessionUpdateResponse {
        session: current_timeline_session_overview(session),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CurrentTimelineSessionRow {
    id: String,
    model: String,
    title: Option<String>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
    working_dir: Option<String>,
    execution_strategy: Option<String>,
    provider_name: Option<String>,
    model_config_json: Option<String>,
    session_type: String,
    extension_data_json: String,
    workspace_id: Option<String>,
    timeline_item_count: usize,
    timeline_turn_count: usize,
    latest_turn_status: Option<AgentThreadTurnStatus>,
}

fn query_current_timeline_session_overviews(
    conn: &rusqlite::Connection,
    include_archived: bool,
    archived_only: bool,
    workspace_id: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<AgentSessionOverview>, String> {
    let limit = limit.unwrap_or(CURRENT_TIMELINE_LIST_MAX_LIMIT);
    let mut stmt = conn
        .prepare(
            "SELECT
                s.id,
                s.model,
                s.title,
                s.created_at,
                COALESCE(
                    (
                        SELECT activity.updated_at
                        FROM (
                            SELECT i.updated_at
                            FROM agent_thread_items i
                            WHERE i.session_id = s.id
                            UNION ALL
                            SELECT t.updated_at
                            FROM agent_thread_turns t
                            WHERE t.session_id = s.id
                        ) activity
                        ORDER BY activity.updated_at DESC
                        LIMIT 1
                    ),
                    s.updated_at
                ) AS updated_at,
                s.archived_at,
                s.working_dir,
                s.execution_strategy,
                s.provider_name,
                s.model_config_json,
                s.session_type,
                s.extension_data_json,
                w.id AS workspace_id,
                (SELECT COUNT(1) FROM agent_thread_items i WHERE i.session_id = s.id)
                    AS timeline_item_count,
                (SELECT COUNT(1) FROM agent_thread_turns t WHERE t.session_id = s.id)
                    AS timeline_turn_count,
                (
                    SELECT t.status
                    FROM agent_thread_turns t
                    WHERE t.session_id = s.id
                    ORDER BY t.started_at DESC, t.id DESC
                    LIMIT 1
                ) AS latest_turn_status
             FROM agent_sessions s
             LEFT JOIN workspaces w ON w.root_path = s.working_dir
             WHERE (
                    (?1 = 1 AND s.archived_at IS NOT NULL)
                    OR (?1 = 0 AND (?2 = 1 OR s.archived_at IS NULL))
                )
               AND (?3 IS NULL OR w.id = ?3)
               AND (
                    EXISTS (SELECT 1 FROM agent_thread_turns t WHERE t.session_id = s.id)
                    OR EXISTS (SELECT 1 FROM agent_thread_items i WHERE i.session_id = s.id)
                )
               AND NOT (
                    s.model = 'lime-fixture-chat'
                    OR s.title LIKE 'Agent QC approval %'
                    OR s.title LIKE 'Code runtime fixture %'
                    OR s.title LIKE 'Tool execution fixture %'
                    OR CASE
                        WHEN json_valid(s.extension_data_json) THEN
                            COALESCE(json_extract(s.extension_data_json, '$.\"lime_harness.v0\".hiddenFromUserRecents') = 1, 0)
                            OR COALESCE(json_extract(s.extension_data_json, '$.\"lime_harness.v0\".hidden_from_user_recents') = 1, 0)
                        ELSE 0
                    END
                )
             ORDER BY updated_at DESC, s.id DESC
             LIMIT ?4",
        )
        .map_err(|error| format!("prepare current timeline session list failed: {error}"))?;

    let rows = stmt
        .query_map(
            params![archived_only, include_archived, workspace_id, limit as i64,],
            current_timeline_session_row,
        )
        .map_err(|error| format!("query current timeline session list failed: {error}"))?;
    rows.map(|row| row.map(current_timeline_session_overview))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read current timeline session list failed: {error}"))
}

fn query_current_timeline_session(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<Option<CurrentTimelineSessionRow>, String> {
    conn.query_row(
        "SELECT
            s.id,
            s.model,
            s.title,
            s.created_at,
                COALESCE(
                    (
                        SELECT activity.updated_at
                        FROM (
                            SELECT i.updated_at
                            FROM agent_thread_items i
                            WHERE i.session_id = s.id
                            UNION ALL
                            SELECT t.updated_at
                            FROM agent_thread_turns t
                            WHERE t.session_id = s.id
                        ) activity
                        ORDER BY activity.updated_at DESC
                        LIMIT 1
                    ),
                s.updated_at
            ) AS updated_at,
            s.archived_at,
            s.working_dir,
            s.execution_strategy,
            s.provider_name,
            s.model_config_json,
            s.session_type,
            s.extension_data_json,
            w.id AS workspace_id,
            (SELECT COUNT(1) FROM agent_thread_items i WHERE i.session_id = s.id)
                AS timeline_item_count,
            (SELECT COUNT(1) FROM agent_thread_turns t WHERE t.session_id = s.id)
                AS timeline_turn_count,
            (
                SELECT t.status
                FROM agent_thread_turns t
                WHERE t.session_id = s.id
                ORDER BY t.started_at DESC, t.id DESC
                LIMIT 1
            ) AS latest_turn_status
         FROM agent_sessions s
         LEFT JOIN workspaces w ON w.root_path = s.working_dir
         WHERE s.id = ?1",
        params![session_id],
        current_timeline_session_row,
    )
    .optional()
    .map_err(|error| format!("read current timeline session failed: {error}"))
}

fn current_timeline_session_row(
    row: &Row<'_>,
) -> Result<CurrentTimelineSessionRow, rusqlite::Error> {
    let latest_turn_status = row
        .get::<_, Option<String>>(15)?
        .as_deref()
        .map(AgentThreadTurnStatus::try_from)
        .transpose()
        .map_err(|_| {
            rusqlite::Error::InvalidColumnType(
                15,
                "latest_turn_status".into(),
                rusqlite::types::Type::Text,
            )
        })?;
    let timeline_item_count = row.get::<_, i64>(13)?.max(0) as usize;
    let timeline_turn_count = row.get::<_, i64>(14)?.max(0) as usize;

    Ok(CurrentTimelineSessionRow {
        id: row.get(0)?,
        model: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived_at: row.get(5)?,
        working_dir: row.get(6)?,
        execution_strategy: row.get(7)?,
        provider_name: row.get(8)?,
        model_config_json: row.get(9)?,
        session_type: row.get(10)?,
        extension_data_json: row.get(11)?,
        workspace_id: row.get(12)?,
        timeline_item_count,
        timeline_turn_count,
        latest_turn_status,
    })
}

fn current_timeline_session_overview(row: CurrentTimelineSessionRow) -> AgentSessionOverview {
    let messages_count = timeline_message_count(&row);
    AgentSessionOverview {
        session_id: row.id.clone(),
        thread_id: Some(row.id),
        title: normalized_title(row.title),
        model: row.model,
        created_at: row.created_at,
        updated_at: row.updated_at,
        archived_at: row.archived_at,
        workspace_id: row.workspace_id,
        working_dir: row.working_dir,
        execution_strategy: row.execution_strategy,
        messages_count,
    }
}

fn update_current_timeline_session_row(
    conn: &rusqlite::Connection,
    session_id: &str,
    title: Option<&str>,
    provider_selector: Option<&str>,
    provider_name: Option<&str>,
    model_name: Option<&str>,
    execution_strategy: Option<&str>,
    archived: Option<bool>,
    recent_access_mode: Option<&str>,
    recent_preferences: Option<&Value>,
    recent_team_selection: Option<&Value>,
) -> Result<(), String> {
    let Some(existing) = query_current_timeline_session(conn, session_id)? else {
        return Err(format!("session not found: {session_id}"));
    };

    let now = Utc::now().to_rfc3339();
    if let Some(title) = title {
        conn.execute(
            "UPDATE agent_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![title, now, session_id],
        )
        .map_err(|error| format!("update current timeline session title failed: {error}"))?;
    }
    if let Some(execution_strategy) = execution_strategy {
        conn.execute(
            "UPDATE agent_sessions SET execution_strategy = ?1, updated_at = ?2 WHERE id = ?3",
            params![execution_strategy, now, session_id],
        )
        .map_err(|error| {
            format!("update current timeline session execution strategy failed: {error}")
        })?;
    }
    if provider_name.is_some() || model_name.is_some() {
        let model_config_json =
            model_name.map(|model_name| json!({ "model_name": model_name }).to_string());
        conn.execute(
            "UPDATE agent_sessions SET
                provider_name = COALESCE(?1, provider_name),
                model = COALESCE(?2, model),
                model_config_json = CASE WHEN ?3 IS NULL THEN model_config_json ELSE ?3 END,
                updated_at = ?4
             WHERE id = ?5",
            params![
                provider_name,
                model_name,
                model_config_json,
                now,
                session_id
            ],
        )
        .map_err(|error| {
            format!("update current timeline session provider/model failed: {error}")
        })?;
    }
    if let Some(archived) = archived {
        let archived_at = archived.then_some(now.as_str());
        conn.execute(
            "UPDATE agent_sessions SET archived_at = ?1, updated_at = ?2 WHERE id = ?3",
            params![archived_at, now, session_id],
        )
        .map_err(|error| {
            format!("update current timeline session archive state failed: {error}")
        })?;
    }
    let routing_provider_selector = provider_selector.or(provider_name);
    if routing_provider_selector.is_some()
        || recent_access_mode.is_some()
        || recent_preferences.is_some()
        || recent_team_selection.is_some()
    {
        let extension_data_json = merge_session_runtime_extension_data(
            &existing.extension_data_json,
            routing_provider_selector,
            recent_access_mode,
            recent_preferences,
            recent_team_selection,
        )?;
        conn.execute(
            "UPDATE agent_sessions SET extension_data_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![extension_data_json, now, session_id],
        )
        .map_err(|error| {
            format!("update current timeline session extension data failed: {error}")
        })?;
    }
    Ok(())
}

fn merge_session_runtime_extension_data(
    existing: &str,
    provider_selector: Option<&str>,
    recent_access_mode: Option<&str>,
    recent_preferences: Option<&Value>,
    recent_team_selection: Option<&Value>,
) -> Result<String, String> {
    let mut extension_data = match serde_json::from_str::<Value>(existing) {
        Ok(Value::Object(map)) => map,
        Ok(_) | Err(_) => Map::new(),
    };
    if let Some(provider_selector) = normalized_text(provider_selector) {
        extension_data.insert(
            "lime_provider_routing.v0".to_string(),
            json!({ "providerSelector": provider_selector }),
        );
    }
    if let Some(recent_access_mode) = normalized_text(recent_access_mode) {
        extension_data.insert(
            "lime_recent_access_mode.v0".to_string(),
            Value::String(recent_access_mode),
        );
    }
    if let Some(recent_preferences) = recent_preferences {
        extension_data.insert(
            "lime_recent_preferences.v0".to_string(),
            recent_preferences.clone(),
        );
    }
    if let Some(recent_team_selection) = recent_team_selection {
        extension_data.insert(
            "lime_recent_team_selection.v0".to_string(),
            recent_team_selection.clone(),
        );
    }
    serde_json::to_string(&Value::Object(extension_data))
        .map_err(|error| format!("serialize current timeline extension data failed: {error}"))
}

fn normalized_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn current_timeline_session_has_entries(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM agent_thread_turns WHERE session_id = ?1)
                OR EXISTS(SELECT 1 FROM agent_thread_items WHERE session_id = ?1)",
        params![session_id],
        |row| row.get::<_, bool>(0),
    )
    .map_err(|error| format!("check current timeline entries failed: {error}"))
}

fn current_timeline_item_count(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Result<usize, String> {
    conn.query_row(
        "SELECT
            (SELECT COUNT(1) FROM agent_thread_items WHERE session_id = ?1),
            (SELECT COUNT(1) FROM agent_thread_turns WHERE session_id = ?1)",
        params![session_id],
        |row| {
            let item_count = row.get::<_, i64>(0)?.max(0) as usize;
            let turn_count = row.get::<_, i64>(1)?.max(0) as usize;
            Ok(if item_count > 0 {
                item_count
            } else {
                turn_count
            })
        },
    )
    .map_err(|error| format!("count current timeline items failed: {error}"))
}

fn current_timeline_session_to_protocol(row: &CurrentTimelineSessionRow) -> AgentSession {
    let metadata = json!({
        "title": normalized_title(row.title.clone()),
        "model": row.model,
        "workingDir": row.working_dir,
        "executionStrategy": row.execution_strategy,
        "sessionType": row.session_type,
        "extensionData": extension_data_json_value(&row.extension_data_json),
        "timelineItemCount": row.timeline_item_count,
        "timelineTurnCount": row.timeline_turn_count,
    });
    AgentSession {
        session_id: row.id.clone(),
        thread_id: row.id.clone(),
        app_id: APP_ID_AGENT_RUNTIME.to_string(),
        workspace_id: row.workspace_id.clone(),
        business_object_ref: Some(BusinessObjectRef {
            kind: "agent_session".to_string(),
            id: row.id.clone(),
            title: normalized_title(row.title.clone()),
            uri: None,
            metadata: Some(metadata),
        }),
        status: current_timeline_session_status(row.latest_turn_status.as_ref()),
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
    }
}

fn extension_data_json_value(value: &str) -> Value {
    serde_json::from_str(value).unwrap_or_else(|_| json!({}))
}

fn current_timeline_session_status(status: Option<&AgentThreadTurnStatus>) -> AgentSessionStatus {
    match status {
        Some(AgentThreadTurnStatus::Running) => AgentSessionStatus::Running,
        Some(AgentThreadTurnStatus::Failed) => AgentSessionStatus::Failed,
        Some(AgentThreadTurnStatus::Aborted) => AgentSessionStatus::Canceled,
        _ => AgentSessionStatus::Idle,
    }
}

fn agent_thread_turn_to_protocol(turn: AgentThreadTurn) -> AgentTurn {
    AgentTurn {
        turn_id: turn.id,
        session_id: turn.thread_id.clone(),
        thread_id: turn.thread_id,
        status: match turn.status {
            AgentThreadTurnStatus::Running => AgentTurnStatus::Running,
            AgentThreadTurnStatus::Completed => AgentTurnStatus::Completed,
            AgentThreadTurnStatus::Failed => AgentTurnStatus::Failed,
            AgentThreadTurnStatus::Aborted => AgentTurnStatus::Canceled,
        },
        started_at: Some(turn.started_at),
        completed_at: turn.completed_at,
    }
}

fn current_timeline_detail_value(
    session: &CurrentTimelineSessionRow,
    turns: &[AgentThreadTurn],
    items: &[AgentThreadItem],
    messages_count: usize,
    history_limit: usize,
    history_offset: usize,
) -> Result<Value, RuntimeCoreError> {
    let loaded_count = items.len();
    let start_index = messages_count.saturating_sub(history_offset + loaded_count);
    let execution_runtime = current_timeline_execution_runtime(session);
    Ok(json!({
        "id": session.id,
        "thread_id": session.id,
        "name": normalized_title(session.title.clone()),
        "created_at": timestamp_millis(&session.created_at),
        "updated_at": timestamp_millis(&session.updated_at),
        "model": session.model,
        "workspace_id": session.workspace_id,
        "working_dir": session.working_dir,
        "execution_strategy": session.execution_strategy,
        "execution_runtime": execution_runtime,
        "messages_count": messages_count,
        "history_limit": history_limit,
        "history_offset": history_offset,
        "history_cursor": {
            "oldest_message_id": null,
            "start_index": start_index,
            "loaded_count": loaded_count,
        },
        "history_truncated": history_offset + loaded_count < messages_count,
        "messages": [],
        "turns": serde_json::to_value(turns).map_err(data_error)?,
        "items": serde_json::to_value(items).map_err(data_error)?,
        "queued_turns": [],
        "thread_read": null,
        "todo_items": [],
        "child_subagent_sessions": [],
    }))
}

fn current_timeline_execution_runtime(session: &CurrentTimelineSessionRow) -> Value {
    let extension_data = extension_data_json_value(&session.extension_data_json);
    let provider_selector = extension_data
        .pointer("/lime_provider_routing.v0/providerSelector")
        .and_then(Value::as_str)
        .or_else(|| {
            extension_data
                .pointer("/lime_provider_routing.v0/provider_selector")
                .and_then(Value::as_str)
        });
    let recent_access_mode = extension_data
        .get("lime_recent_access_mode.v0")
        .and_then(Value::as_str);
    json!({
        "session_id": session.id,
        "provider_selector": normalized_text(provider_selector),
        "provider_name": normalized_text(session.provider_name.as_deref()),
        "model_name": current_timeline_model_name(session),
        "execution_strategy": normalized_text(session.execution_strategy.as_deref()),
        "source": "session",
        "recent_access_mode": normalized_text(recent_access_mode),
        "recent_preferences": extension_data
            .get("lime_recent_preferences.v0")
            .cloned()
            .unwrap_or(Value::Null),
        "recent_team_selection": extension_data
            .get("lime_recent_team_selection.v0")
            .cloned()
            .unwrap_or(Value::Null),
    })
}

fn current_timeline_model_name(session: &CurrentTimelineSessionRow) -> Option<String> {
    session
        .model_config_json
        .as_deref()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .and_then(|value| model_name_from_config_value(&value))
        .or_else(|| normalized_text(Some(&session.model)))
}

fn model_name_from_config_value(value: &Value) -> Option<String> {
    value
        .get("modelName")
        .or_else(|| value.get("model_name"))
        .or_else(|| value.get("model"))
        .or_else(|| value.get("name"))
        .and_then(Value::as_str)
        .and_then(|value| normalized_text(Some(value)))
}

fn normalized_title(value: Option<String>) -> Option<String> {
    value
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
}

fn timeline_message_count(row: &CurrentTimelineSessionRow) -> usize {
    if row.timeline_item_count > 0 {
        row.timeline_item_count
    } else {
        row.timeline_turn_count
    }
}

fn timestamp_millis(value: &str) -> i64 {
    if let Ok(timestamp) = DateTime::parse_from_rfc3339(value) {
        return timestamp.timestamp_millis();
    }
    if let Ok(timestamp) = value.parse::<i64>() {
        return if timestamp.abs() < 10_000_000_000 {
            timestamp.saturating_mul(1000)
        } else {
            timestamp
        };
    }
    0
}
