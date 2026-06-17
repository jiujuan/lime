//! Managed Objective 数据访问边界。
//!
//! 目标状态只记录“为什么继续、何时停止”，执行历史仍由 Agent session、
//! runtime queue 与 evidence pack 维护。

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub const MANAGED_OBJECTIVES_TABLE: &str = "managed_objectives";
pub const MANAGED_OBJECTIVE_OWNER_AGENT_SESSION: &str = "agent_session";
pub const MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB: &str = "automation_job";

const ACTIVE: &str = "active";
const VERIFYING: &str = "verifying";
const NEEDS_INPUT: &str = "needs_input";
const BLOCKED: &str = "blocked";
const BUDGET_LIMITED: &str = "budget_limited";
const PAUSED: &str = "paused";
const COMPLETED: &str = "completed";
const FAILED: &str = "failed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ManagedObjectiveStatus {
    Active,
    Verifying,
    NeedsInput,
    Blocked,
    BudgetLimited,
    Paused,
    Completed,
    Failed,
}

impl ManagedObjectiveStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Active => ACTIVE,
            Self::Verifying => VERIFYING,
            Self::NeedsInput => NEEDS_INPUT,
            Self::Blocked => BLOCKED,
            Self::BudgetLimited => BUDGET_LIMITED,
            Self::Paused => PAUSED,
            Self::Completed => COMPLETED,
            Self::Failed => FAILED,
        }
    }

    pub fn allows_manual_continue(self) -> bool {
        matches!(self, Self::Active)
    }
}

impl TryFrom<&str> for ManagedObjectiveStatus {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            ACTIVE => Ok(Self::Active),
            VERIFYING => Ok(Self::Verifying),
            NEEDS_INPUT => Ok(Self::NeedsInput),
            BLOCKED => Ok(Self::Blocked),
            BUDGET_LIMITED => Ok(Self::BudgetLimited),
            PAUSED => Ok(Self::Paused),
            COMPLETED => Ok(Self::Completed),
            FAILED => Ok(Self::Failed),
            other => Err(format!("未知目标状态: {other}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ManagedObjectiveRecord {
    pub objective_id: String,
    pub workspace_id: Option<String>,
    pub owner_kind: String,
    pub owner_id: String,
    pub objective_text: String,
    pub success_criteria: Vec<String>,
    pub status: ManagedObjectiveStatus,
    pub budget_policy: Option<Value>,
    pub risk_policy: Option<Value>,
    pub approval_policy: Option<Value>,
    pub continuation_policy: Option<Value>,
    pub last_audit_summary: Option<String>,
    pub last_evidence_pack_ref: Option<String>,
    pub last_artifact_refs: Vec<String>,
    pub blocker_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct ManagedObjectiveUpsert {
    pub workspace_id: Option<String>,
    pub owner_kind: String,
    pub owner_id: String,
    pub objective_text: String,
    pub success_criteria: Vec<String>,
    pub budget_policy: Option<Value>,
    pub risk_policy: Option<Value>,
    pub approval_policy: Option<Value>,
    pub continuation_policy: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct ManagedObjectiveAuditUpdate {
    pub status: ManagedObjectiveStatus,
    pub last_audit_summary: Option<String>,
    pub last_evidence_pack_ref: Option<String>,
    pub last_artifact_refs: Vec<String>,
    pub blocker_reason: Option<String>,
}

pub fn create_managed_objectives_table(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS managed_objectives (
            objective_id TEXT PRIMARY KEY,
            workspace_id TEXT,
            owner_kind TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            objective_text TEXT NOT NULL,
            success_criteria_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL,
            budget_policy_json TEXT,
            risk_policy_json TEXT,
            approval_policy_json TEXT,
            continuation_policy_json TEXT,
            last_audit_summary TEXT,
            last_evidence_pack_ref TEXT,
            last_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
            blocker_reason TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(owner_kind, owner_id),
            CHECK(status IN (
                'active',
                'verifying',
                'needs_input',
                'blocked',
                'budget_limited',
                'paused',
                'completed',
                'failed'
            ))
        );
        CREATE INDEX IF NOT EXISTS idx_managed_objectives_workspace
            ON managed_objectives(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_managed_objectives_owner
            ON managed_objectives(owner_kind, owner_id);",
    )
}

pub fn get_agent_session_workspace_id(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<String>, String> {
    let working_dir = conn
        .query_row(
            "SELECT working_dir FROM agent_sessions WHERE id = ?1 LIMIT 1",
            params![session_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|error| format!("读取目标 owner 会话失败: {error}"))?
        .unwrap_or(None);

    let Some(working_dir) = working_dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    conn.query_row(
        "SELECT id FROM workspaces WHERE root_path = ?1 LIMIT 1",
        params![working_dir],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|error| format!("解析目标 workspace 失败: {error}"))
}

pub fn get_objective_by_owner(
    conn: &Connection,
    owner_kind: &str,
    owner_id: &str,
) -> Result<Option<ManagedObjectiveRecord>, String> {
    conn.query_row(
        "SELECT
            objective_id,
            workspace_id,
            owner_kind,
            owner_id,
            objective_text,
            success_criteria_json,
            status,
            budget_policy_json,
            risk_policy_json,
            approval_policy_json,
            continuation_policy_json,
            last_audit_summary,
            last_evidence_pack_ref,
            last_artifact_refs_json,
            blocker_reason,
            created_at,
            updated_at
         FROM managed_objectives
         WHERE owner_kind = ?1 AND owner_id = ?2
         LIMIT 1",
        params![owner_kind, owner_id],
        managed_objective_from_row,
    )
    .optional()
    .map_err(|error| format!("读取目标状态失败: {error}"))
}

pub fn upsert_objective(
    conn: &Connection,
    input: ManagedObjectiveUpsert,
) -> Result<ManagedObjectiveRecord, String> {
    validate_objective_text(&input.objective_text)?;
    let success_criteria = normalize_success_criteria(input.success_criteria);
    let now = Utc::now().to_rfc3339();
    let objective_id = format!("objective-{}", Uuid::new_v4().simple());
    let success_criteria_json = serialize_json(&success_criteria)?;
    let budget_policy_json = serialize_optional_json(input.budget_policy.as_ref())?;
    let risk_policy_json = serialize_optional_json(input.risk_policy.as_ref())?;
    let approval_policy_json = serialize_optional_json(input.approval_policy.as_ref())?;
    let continuation_policy_json = serialize_optional_json(input.continuation_policy.as_ref())?;

    conn.execute(
        "INSERT INTO managed_objectives (
            objective_id,
            workspace_id,
            owner_kind,
            owner_id,
            objective_text,
            success_criteria_json,
            status,
            budget_policy_json,
            risk_policy_json,
            approval_policy_json,
            continuation_policy_json,
            last_artifact_refs_json,
            created_at,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, '[]', ?12, ?12)
        ON CONFLICT(owner_kind, owner_id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            objective_text = excluded.objective_text,
            success_criteria_json = excluded.success_criteria_json,
            status = excluded.status,
            budget_policy_json = excluded.budget_policy_json,
            risk_policy_json = excluded.risk_policy_json,
            approval_policy_json = excluded.approval_policy_json,
            continuation_policy_json = excluded.continuation_policy_json,
            last_audit_summary = NULL,
            last_evidence_pack_ref = NULL,
            last_artifact_refs_json = '[]',
            blocker_reason = NULL,
            updated_at = excluded.updated_at",
        params![
            objective_id,
            input.workspace_id,
            input.owner_kind,
            input.owner_id,
            input.objective_text.trim(),
            success_criteria_json,
            ManagedObjectiveStatus::Active.as_str(),
            budget_policy_json,
            risk_policy_json,
            approval_policy_json,
            continuation_policy_json,
            now,
        ],
    )
    .map_err(|error| format!("保存目标状态失败: {error}"))?;

    get_objective_by_owner(conn, &input.owner_kind, &input.owner_id)?
        .ok_or_else(|| "保存目标后读取失败".to_string())
}

pub fn update_objective_status_by_owner(
    conn: &Connection,
    owner_kind: &str,
    owner_id: &str,
    status: ManagedObjectiveStatus,
    blocker_reason: Option<&str>,
) -> Result<Option<ManagedObjectiveRecord>, String> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE managed_objectives
         SET status = ?1,
             blocker_reason = ?2,
             updated_at = ?3
         WHERE owner_kind = ?4 AND owner_id = ?5",
        params![status.as_str(), blocker_reason, now, owner_kind, owner_id],
    )
    .map_err(|error| format!("更新目标状态失败: {error}"))?;

    get_objective_by_owner(conn, owner_kind, owner_id)
}

pub fn update_objective_audit_by_owner(
    conn: &Connection,
    owner_kind: &str,
    owner_id: &str,
    update: ManagedObjectiveAuditUpdate,
) -> Result<Option<ManagedObjectiveRecord>, String> {
    let now = Utc::now().to_rfc3339();
    let last_audit_summary = normalize_optional_text(update.last_audit_summary);
    let last_evidence_pack_ref = normalize_optional_text(update.last_evidence_pack_ref);
    let blocker_reason = normalize_optional_text(update.blocker_reason);
    let last_artifact_refs = normalize_text_vec(update.last_artifact_refs);
    let last_artifact_refs_json = serialize_json(&last_artifact_refs)?;

    conn.execute(
        "UPDATE managed_objectives
         SET status = ?1,
             blocker_reason = ?2,
             last_audit_summary = ?3,
             last_evidence_pack_ref = ?4,
             last_artifact_refs_json = ?5,
             updated_at = ?6
         WHERE owner_kind = ?7 AND owner_id = ?8",
        params![
            update.status.as_str(),
            blocker_reason,
            last_audit_summary,
            last_evidence_pack_ref,
            last_artifact_refs_json,
            now,
            owner_kind,
            owner_id,
        ],
    )
    .map_err(|error| format!("更新目标审计结果失败: {error}"))?;

    get_objective_by_owner(conn, owner_kind, owner_id)
}

pub fn clear_objective_by_owner(
    conn: &Connection,
    owner_kind: &str,
    owner_id: &str,
) -> Result<bool, String> {
    let affected = conn
        .execute(
            "DELETE FROM managed_objectives WHERE owner_kind = ?1 AND owner_id = ?2",
            params![owner_kind, owner_id],
        )
        .map_err(|error| format!("清除目标失败: {error}"))?;
    Ok(affected > 0)
}

fn managed_objective_from_row(row: &Row<'_>) -> Result<ManagedObjectiveRecord, rusqlite::Error> {
    let success_criteria_json: String = row.get(5)?;
    let status: String = row.get(6)?;
    let last_artifact_refs_json: String = row.get(13)?;
    Ok(ManagedObjectiveRecord {
        objective_id: row.get(0)?,
        workspace_id: row.get(1)?,
        owner_kind: row.get(2)?,
        owner_id: row.get(3)?,
        objective_text: row.get(4)?,
        success_criteria: deserialize_string_vec(&success_criteria_json),
        status: ManagedObjectiveStatus::try_from(status.as_str()).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                6,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
            )
        })?,
        budget_policy: deserialize_optional_json(row.get::<_, Option<String>>(7)?),
        risk_policy: deserialize_optional_json(row.get::<_, Option<String>>(8)?),
        approval_policy: deserialize_optional_json(row.get::<_, Option<String>>(9)?),
        continuation_policy: deserialize_optional_json(row.get::<_, Option<String>>(10)?),
        last_audit_summary: row.get(11)?,
        last_evidence_pack_ref: row.get(12)?,
        last_artifact_refs: deserialize_string_vec(&last_artifact_refs_json),
        blocker_reason: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

fn validate_objective_text(value: &str) -> Result<(), String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("目标不能为空".to_string());
    }
    if trimmed.chars().count() > 4_000 {
        return Err("目标过长，请控制在 4000 字以内".to_string());
    }
    Ok(())
}

fn normalize_success_criteria(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .take(20)
        .collect()
}

fn normalize_text_vec(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn serialize_json<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| format!("序列化目标 JSON 失败: {error}"))
}

fn serialize_optional_json(value: Option<&Value>) -> Result<Option<String>, String> {
    value.map(serialize_json).transpose()
}

fn deserialize_optional_json(raw: Option<String>) -> Option<Value> {
    raw.and_then(|value| serde_json::from_str::<Value>(&value).ok())
}

fn deserialize_string_vec(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        create_managed_objectives_table(&conn).unwrap();
        conn.execute_batch(
            "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                working_dir TEXT
            );
            CREATE TABLE workspaces (
                id TEXT PRIMARY KEY,
                root_path TEXT NOT NULL
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn upsert_edits_owner_objective_and_keeps_single_row() {
        let conn = setup_db();
        let first = upsert_objective(
            &conn,
            ManagedObjectiveUpsert {
                workspace_id: Some("workspace-1".to_string()),
                owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                owner_id: "session-1".to_string(),
                objective_text: "完成第一版".to_string(),
                success_criteria: vec!["通过验证".to_string()],
                budget_policy: None,
                risk_policy: None,
                approval_policy: None,
                continuation_policy: None,
            },
        )
        .unwrap();
        let second = upsert_objective(
            &conn,
            ManagedObjectiveUpsert {
                workspace_id: Some("workspace-1".to_string()),
                owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                owner_id: "session-1".to_string(),
                objective_text: "完成第二版".to_string(),
                success_criteria: vec!["冒烟通过".to_string()],
                budget_policy: None,
                risk_policy: None,
                approval_policy: None,
                continuation_policy: None,
            },
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM managed_objectives", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(first.objective_id, second.objective_id);
        assert_eq!(second.objective_text, "完成第二版");
        assert_eq!(second.status, ManagedObjectiveStatus::Active);
    }

    #[test]
    fn upsert_edits_existing_goal_and_reactivates_without_new_goal_id() {
        let conn = setup_db();
        let first = upsert_objective(
            &conn,
            ManagedObjectiveUpsert {
                workspace_id: Some("workspace-1".to_string()),
                owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                owner_id: "session-1".to_string(),
                objective_text: "完成第一版".to_string(),
                success_criteria: vec!["通过验证".to_string()],
                budget_policy: None,
                risk_policy: None,
                approval_policy: None,
                continuation_policy: None,
            },
        )
        .unwrap();
        update_objective_audit_by_owner(
            &conn,
            MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
            "session-1",
            ManagedObjectiveAuditUpdate {
                status: ManagedObjectiveStatus::Completed,
                last_audit_summary: Some("decision=completed".to_string()),
                last_evidence_pack_ref: Some(".lime/evidence/pack".to_string()),
                last_artifact_refs: vec!["artifact.md".to_string()],
                blocker_reason: None,
            },
        )
        .unwrap();

        let edited = upsert_objective(
            &conn,
            ManagedObjectiveUpsert {
                workspace_id: Some("workspace-1".to_string()),
                owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                owner_id: "session-1".to_string(),
                objective_text: "完成第二版".to_string(),
                success_criteria: Vec::new(),
                budget_policy: None,
                risk_policy: None,
                approval_policy: None,
                continuation_policy: None,
            },
        )
        .unwrap();

        assert_eq!(edited.objective_id, first.objective_id);
        assert_eq!(edited.created_at, first.created_at);
        assert_eq!(edited.objective_text, "完成第二版");
        assert_eq!(edited.status, ManagedObjectiveStatus::Active);
        assert_eq!(edited.last_audit_summary, None);
        assert_eq!(edited.last_evidence_pack_ref, None);
        assert!(edited.last_artifact_refs.is_empty());
        assert_eq!(edited.blocker_reason, None);
    }

    #[test]
    fn missing_agent_session_workspace_resolves_to_none() {
        let conn = setup_db();

        let workspace_id =
            get_agent_session_workspace_id(&conn, "session-not-yet-persisted").unwrap();

        assert_eq!(workspace_id, None);
    }

    #[test]
    fn status_update_and_clear_are_owner_scoped() {
        let conn = setup_db();
        upsert_objective(
            &conn,
            ManagedObjectiveUpsert {
                workspace_id: None,
                owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                owner_id: "session-1".to_string(),
                objective_text: "目标".to_string(),
                success_criteria: Vec::new(),
                budget_policy: None,
                risk_policy: None,
                approval_policy: None,
                continuation_policy: None,
            },
        )
        .unwrap();

        let paused = update_objective_status_by_owner(
            &conn,
            MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
            "session-1",
            ManagedObjectiveStatus::Paused,
            Some("用户暂停"),
        )
        .unwrap()
        .unwrap();
        assert_eq!(paused.status, ManagedObjectiveStatus::Paused);
        assert_eq!(paused.blocker_reason.as_deref(), Some("用户暂停"));

        assert!(clear_objective_by_owner(
            &conn,
            MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
            "session-1"
        )
        .unwrap());
        assert!(
            get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION, "session-1")
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn audit_update_persists_evidence_fields() {
        let conn = setup_db();
        upsert_objective(
            &conn,
            ManagedObjectiveUpsert {
                workspace_id: None,
                owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
                owner_id: "session-1".to_string(),
                objective_text: "目标".to_string(),
                success_criteria: Vec::new(),
                budget_policy: None,
                risk_policy: None,
                approval_policy: None,
                continuation_policy: None,
            },
        )
        .unwrap();

        let updated = update_objective_audit_by_owner(
            &conn,
            MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
            "session-1",
            ManagedObjectiveAuditUpdate {
                status: ManagedObjectiveStatus::Completed,
                last_audit_summary: Some(" decision=completed ".to_string()),
                last_evidence_pack_ref: Some(" .lime/harness/evidence ".to_string()),
                last_artifact_refs: vec![
                    " .lime/harness/evidence/artifacts/result.md ".to_string(),
                    " ".to_string(),
                ],
                blocker_reason: None,
            },
        )
        .unwrap()
        .unwrap();

        assert_eq!(updated.status, ManagedObjectiveStatus::Completed);
        assert_eq!(
            updated.last_audit_summary.as_deref(),
            Some("decision=completed")
        );
        assert_eq!(
            updated.last_evidence_pack_ref.as_deref(),
            Some(".lime/harness/evidence")
        );
        assert_eq!(
            updated.last_artifact_refs,
            vec![".lime/harness/evidence/artifacts/result.md".to_string()]
        );
        assert_eq!(updated.blocker_reason, None);
    }
}
