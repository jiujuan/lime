use chrono::Utc;
use lime_agent::AgentEvent as RuntimeAgentEvent;
use lime_core::database::dao::agent_timeline::{
    AgentRequestQuestion, AgentThreadItem, AgentThreadItemPayload, AgentThreadItemStatus,
    AgentThreadTurn, AgentThreadTurnStatus, AgentTimelineDao,
};
use lime_core::database::{lock_db, DbConnection};
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

mod tool_events;
use self::tool_events::{build_tool_end_payload, build_tool_start_payload};

fn emit_event(app: &AppHandle, event_name: &str, event: &RuntimeAgentEvent) {
    if let Err(error) = app.emit(event_name, event) {
        tracing::error!("[AgentTimeline] 发送事件失败: {}", error);
    }
}

fn resolve_artifact_item_status(metadata: Option<&Value>) -> AgentThreadItemStatus {
    let write_phase = metadata
        .and_then(|value| value.get("writePhase"))
        .and_then(Value::as_str);
    if matches!(write_phase, Some("failed")) {
        return AgentThreadItemStatus::Failed;
    }

    match metadata
        .and_then(|value| value.get("complete"))
        .and_then(Value::as_bool)
    {
        Some(false) => AgentThreadItemStatus::InProgress,
        _ => AgentThreadItemStatus::Completed,
    }
}

fn resolve_artifact_item_source(metadata: Option<&Value>) -> String {
    metadata
        .and_then(|value| value.get("lastUpdateSource"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| "artifact_snapshot".to_string())
}

pub fn abort_running_turn_by_id(
    db: &DbConnection,
    thread_id: &str,
    turn_id: &str,
    message: &str,
) -> Result<bool, String> {
    let normalized_turn_id = turn_id.trim();
    if thread_id.trim().is_empty() || normalized_turn_id.is_empty() {
        return Ok(false);
    }

    let now = Utc::now().to_rfc3339();
    let conn = lock_db(db)?;
    let turns = AgentTimelineDao::list_turns_by_thread(&conn, thread_id)
        .map_err(|e| format!("读取 turn 失败: {e}"))?;
    let Some(turn) = turns.iter().find(|turn| turn.id == normalized_turn_id) else {
        return Ok(false);
    };
    if !matches!(turn.status, AgentThreadTurnStatus::Running) {
        return Ok(false);
    }

    AgentTimelineDao::update_turn_status(
        &conn,
        normalized_turn_id,
        AgentThreadTurnStatus::Aborted,
        Some(&now),
        Some(message),
        &now,
    )
    .map_err(|e| format!("更新 turn 中断状态失败: {e}"))?;

    let items = AgentTimelineDao::list_items_by_thread(&conn, thread_id)
        .map_err(|e| format!("读取 turn item 失败: {e}"))?;
    for mut item in items
        .into_iter()
        .filter(|item| item.turn_id == normalized_turn_id)
        .filter(|item| matches!(item.status, AgentThreadItemStatus::InProgress))
    {
        item.status = AgentThreadItemStatus::Completed;
        item.completed_at = Some(now.clone());
        item.updated_at = now.clone();
        AgentTimelineDao::upsert_item(&conn, &item)
            .map_err(|e| format!("更新 turn item 中断状态失败: {e}"))?;
    }

    Ok(true)
}

#[derive(Debug)]
pub struct AgentTimelineRecorder {
    db: DbConnection,
    thread_id: String,
    turn_id: String,
    turn: AgentThreadTurn,
    sequence_counter: i64,
    item_sequences: HashMap<String, i64>,
    item_statuses: HashMap<String, AgentThreadItemStatus>,
    plan_text: Option<String>,
}

impl AgentTimelineRecorder {
    pub fn create(
        db: DbConnection,
        thread_id: impl Into<String>,
        turn_id: impl Into<String>,
        prompt_text: impl Into<String>,
    ) -> Result<Self, String> {
        let thread_id = thread_id.into();
        let turn_id = turn_id.into();
        let prompt_text = prompt_text.into();
        let now = Utc::now().to_rfc3339();
        let turn = AgentThreadTurn {
            id: turn_id.clone(),
            thread_id: thread_id.clone(),
            prompt_text,
            status: AgentThreadTurnStatus::Running,
            started_at: now.clone(),
            completed_at: None,
            error_message: None,
            created_at: now.clone(),
            updated_at: now,
        };

        {
            let conn = lock_db(&db)?;
            AgentTimelineDao::create_turn(&conn, &turn)
                .map_err(|e| format!("创建 turn 失败: {e}"))?;
        }

        Ok(Self {
            db,
            thread_id,
            turn_id,
            turn,
            sequence_counter: 0,
            item_sequences: HashMap::new(),
            item_statuses: HashMap::new(),
            plan_text: None,
        })
    }

    pub fn from_started_turn(db: DbConnection, turn: AgentThreadTurn) -> Result<Self, String> {
        let mut sequence_counter = 0;
        let mut item_sequences = HashMap::new();
        let mut item_statuses = HashMap::new();
        let mut plan_text = None;

        {
            let conn = lock_db(&db)?;
            AgentTimelineDao::upsert_turn(&conn, &turn)
                .map_err(|e| format!("同步 turn 启动态失败: {e}"))?;
            let items = AgentTimelineDao::list_items_by_thread(&conn, &turn.thread_id)
                .map_err(|e| format!("读取 turn item 失败: {e}"))?;
            for item in items.into_iter().filter(|item| item.turn_id == turn.id) {
                sequence_counter = sequence_counter.max(item.sequence);
                item_sequences.insert(item.id.clone(), item.sequence);
                item_statuses.insert(item.id.clone(), item.status.clone());
                if let AgentThreadItemPayload::Plan { text } = item.payload {
                    plan_text = Some(text);
                }
            }
        }

        Ok(Self {
            db,
            thread_id: turn.thread_id.clone(),
            turn_id: turn.id.clone(),
            turn,
            sequence_counter,
            item_sequences,
            item_statuses,
            plan_text,
        })
    }

    pub fn thread_id(&self) -> &str {
        &self.thread_id
    }

    pub fn turn_id(&self) -> &str {
        &self.turn_id
    }

    pub fn record_runtime_event(
        &mut self,
        app: &AppHandle,
        event_name: &str,
        event: &RuntimeAgentEvent,
        _workspace_root: &str,
    ) -> Result<(), String> {
        match event {
            RuntimeAgentEvent::ThreadStarted { .. } => {}
            RuntimeAgentEvent::TurnStarted { turn } => {
                self.thread_id = turn.thread_id.clone();
                self.turn_id = turn.id.clone();
                self.turn = turn.clone();

                let conn = lock_db(&self.db)?;
                AgentTimelineDao::upsert_turn(&conn, &self.turn)
                    .map_err(|e| format!("同步 turn 启动态失败: {e}"))?;
            }
            RuntimeAgentEvent::ItemStarted { item } => {
                self.persist_runtime_item(
                    app,
                    event_name,
                    item.clone(),
                    RuntimeAgentEvent::ItemStarted { item: item.clone() },
                )?;
            }
            RuntimeAgentEvent::ItemUpdated { item } => {
                self.persist_runtime_item(
                    app,
                    event_name,
                    item.clone(),
                    RuntimeAgentEvent::ItemUpdated { item: item.clone() },
                )?;
            }
            RuntimeAgentEvent::ItemCompleted { item } => {
                self.persist_runtime_item(
                    app,
                    event_name,
                    item.clone(),
                    RuntimeAgentEvent::ItemCompleted { item: item.clone() },
                )?;
            }
            RuntimeAgentEvent::RuntimeStatus { .. } => {}
            RuntimeAgentEvent::TurnContext { .. } => {}
            RuntimeAgentEvent::ToolStart {
                tool_name,
                tool_id,
                arguments,
            } => {
                let event =
                    self.record_tool_start_event(tool_name, tool_id, arguments.as_deref())?;
                emit_event(app, event_name, &event);
            }
            RuntimeAgentEvent::ToolEnd { tool_id, result } => {
                let event = self.record_tool_end_event(tool_id, result)?;
                emit_event(app, event_name, &event);
            }
            RuntimeAgentEvent::ArtifactSnapshot { artifact } => {
                let metadata_value = artifact
                    .metadata
                    .as_ref()
                    .and_then(|metadata| serde_json::to_value(metadata).ok());
                let status = resolve_artifact_item_status(metadata_value.as_ref());
                let item = self.build_item(
                    artifact.artifact_id.clone(),
                    status.clone(),
                    if matches!(status, AgentThreadItemStatus::InProgress) {
                        None
                    } else {
                        Some(Utc::now().to_rfc3339())
                    },
                    AgentThreadItemPayload::FileArtifact {
                        path: artifact.file_path.clone(),
                        source: resolve_artifact_item_source(metadata_value.as_ref()),
                        content: artifact.content.clone(),
                        metadata: metadata_value,
                    },
                );
                self.persist_and_emit_item(app, event_name, item)?;
            }
            RuntimeAgentEvent::ActionRequired { .. } => {}
            RuntimeAgentEvent::ContextCompactionStarted {
                item_id,
                trigger,
                detail,
            } => {
                let item = self.build_item(
                    item_id.clone(),
                    AgentThreadItemStatus::InProgress,
                    None,
                    AgentThreadItemPayload::ContextCompaction {
                        stage: "started".to_string(),
                        trigger: Some(trigger.clone()),
                        detail: detail.clone(),
                    },
                );
                self.persist_and_emit_item(app, event_name, item)?;
            }
            RuntimeAgentEvent::ContextCompactionCompleted {
                item_id,
                trigger,
                detail,
            } => {
                let item = self.build_item(
                    item_id.clone(),
                    AgentThreadItemStatus::Completed,
                    Some(Utc::now().to_rfc3339()),
                    AgentThreadItemPayload::ContextCompaction {
                        stage: "completed".to_string(),
                        trigger: Some(trigger.clone()),
                        detail: detail.clone(),
                    },
                );
                self.persist_and_emit_item(app, event_name, item)?;
            }
            RuntimeAgentEvent::Warning { code, message } => {
                let item = self.build_item(
                    format!("warning:{}:{}", self.turn_id, self.sequence_counter + 1),
                    AgentThreadItemStatus::Completed,
                    Some(Utc::now().to_rfc3339()),
                    AgentThreadItemPayload::Warning {
                        message: message.clone(),
                        code: code.clone(),
                    },
                );
                self.persist_and_emit_item(app, event_name, item)?;
            }
            RuntimeAgentEvent::Error { message } => {
                let item = self.build_item(
                    format!("error:{}", self.turn_id),
                    AgentThreadItemStatus::Failed,
                    Some(Utc::now().to_rfc3339()),
                    AgentThreadItemPayload::Error {
                        message: message.clone(),
                    },
                );
                self.persist_and_emit_item(app, event_name, item)?;
            }
            _ => {}
        }

        Ok(())
    }

    pub fn record_request_user_input(
        &mut self,
        app: &AppHandle,
        event_name: &str,
        request_id: String,
        action_type: String,
        prompt: Option<String>,
        questions: Option<Vec<AgentRequestQuestion>>,
    ) -> Result<(), String> {
        let item = self.build_item(
            request_id.clone(),
            AgentThreadItemStatus::InProgress,
            None,
            AgentThreadItemPayload::RequestUserInput {
                request_id,
                action_type,
                prompt,
                questions,
                response: None,
            },
        );
        self.persist_and_emit_item(app, event_name, item)
    }

    pub fn complete_turn_success(&mut self) -> Result<Vec<RuntimeAgentEvent>, String> {
        let now = Utc::now().to_rfc3339();
        self.turn.status = AgentThreadTurnStatus::Completed;
        self.turn.completed_at = Some(now.clone());
        self.turn.updated_at = now.clone();

        let conn = lock_db(&self.db)?;
        AgentTimelineDao::update_turn_status(
            &conn,
            &self.turn_id,
            AgentThreadTurnStatus::Completed,
            Some(&now),
            None,
            &now,
        )
        .map_err(|e| format!("更新 turn 完成状态失败: {e}"))?;
        drop(conn);

        let mut events = self.complete_projection_items(AgentThreadItemStatus::Completed)?;
        events.push(RuntimeAgentEvent::TurnCompleted {
            turn: self.turn.clone(),
        });
        Ok(events)
    }

    pub fn fail_turn(&mut self, message: &str) -> Result<Vec<RuntimeAgentEvent>, String> {
        let now = Utc::now().to_rfc3339();
        self.turn.status = AgentThreadTurnStatus::Failed;
        self.turn.completed_at = Some(now.clone());
        self.turn.error_message = Some(message.to_string());
        self.turn.updated_at = now.clone();

        let conn = lock_db(&self.db)?;
        AgentTimelineDao::update_turn_status(
            &conn,
            &self.turn_id,
            AgentThreadTurnStatus::Failed,
            Some(&now),
            Some(message),
            &now,
        )
        .map_err(|e| format!("更新 turn 失败状态失败: {e}"))?;
        drop(conn);

        let mut events = self.complete_projection_items(AgentThreadItemStatus::Completed)?;
        let error_item = self.build_item(
            format!("error:{}", self.turn_id),
            AgentThreadItemStatus::Failed,
            Some(Utc::now().to_rfc3339()),
            AgentThreadItemPayload::Error {
                message: message.to_string(),
            },
        );
        events.push(self.persist_item_and_build_event(error_item)?);
        events.push(RuntimeAgentEvent::TurnFailed {
            turn: self.turn.clone(),
        });
        Ok(events)
    }

    pub fn abort_turn(&mut self, message: &str) -> Result<Vec<RuntimeAgentEvent>, String> {
        let now = Utc::now().to_rfc3339();
        self.turn.status = AgentThreadTurnStatus::Aborted;
        self.turn.completed_at = Some(now.clone());
        self.turn.error_message = Some(message.to_string());
        self.turn.updated_at = now.clone();

        let conn = lock_db(&self.db)?;
        AgentTimelineDao::update_turn_status(
            &conn,
            &self.turn_id,
            AgentThreadTurnStatus::Aborted,
            Some(&now),
            Some(message),
            &now,
        )
        .map_err(|e| format!("更新 turn 中断状态失败: {e}"))?;
        drop(conn);

        let mut events = self.complete_projection_items(AgentThreadItemStatus::Completed)?;
        events.push(RuntimeAgentEvent::TurnFailed {
            turn: self.turn.clone(),
        });
        Ok(events)
    }

    pub fn record_synthetic_item(
        &mut self,
        app: &AppHandle,
        event_name: &str,
        id: String,
        status: AgentThreadItemStatus,
        completed_at: Option<String>,
        payload: AgentThreadItemPayload,
    ) -> Result<AgentThreadItem, String> {
        let event = self.record_synthetic_item_event(id, status, completed_at, payload)?;
        let item = match &event {
            RuntimeAgentEvent::ItemStarted { item }
            | RuntimeAgentEvent::ItemUpdated { item }
            | RuntimeAgentEvent::ItemCompleted { item } => item.clone(),
            _ => return Err("synthetic item 写入后产生了非 item 事件".to_string()),
        };
        emit_event(app, event_name, &event);
        Ok(item)
    }

    pub fn record_synthetic_item_event(
        &mut self,
        id: String,
        status: AgentThreadItemStatus,
        completed_at: Option<String>,
        payload: AgentThreadItemPayload,
    ) -> Result<RuntimeAgentEvent, String> {
        let item = self.build_item(id, status, completed_at, payload);
        self.persist_item_and_build_event(item)
    }

    fn record_tool_start_event(
        &mut self,
        tool_name: &str,
        tool_id: &str,
        arguments: Option<&str>,
    ) -> Result<RuntimeAgentEvent, String> {
        let item = self.build_item(
            tool_id.to_string(),
            AgentThreadItemStatus::InProgress,
            None,
            build_tool_start_payload(tool_name, arguments),
        );
        self.persist_item_and_build_event(item)
    }

    fn record_tool_end_event(
        &mut self,
        tool_id: &str,
        result: &lime_agent::AgentToolResult,
    ) -> Result<RuntimeAgentEvent, String> {
        let (previous_tool_name, previous_arguments) = self.previous_tool_call_snapshot(tool_id);
        let item = self.build_item(
            tool_id.to_string(),
            if result.success {
                AgentThreadItemStatus::Completed
            } else {
                AgentThreadItemStatus::Failed
            },
            Some(Utc::now().to_rfc3339()),
            build_tool_end_payload(tool_id, result, previous_tool_name, previous_arguments),
        );
        self.persist_item_and_build_event(item)
    }

    fn previous_tool_call_snapshot(&self, tool_id: &str) -> (Option<String>, Option<Value>) {
        let Ok(conn) = lock_db(&self.db) else {
            return (None, None);
        };
        let Ok(Some(item)) = AgentTimelineDao::get_item(&conn, tool_id) else {
            return (None, None);
        };
        match item.payload {
            AgentThreadItemPayload::ToolCall {
                tool_name,
                arguments,
                ..
            } => (Some(tool_name), arguments),
            _ => (None, None),
        }
    }

    fn complete_projection_items(
        &mut self,
        status: AgentThreadItemStatus,
    ) -> Result<Vec<RuntimeAgentEvent>, String> {
        let mut events = Vec::new();
        if let Some(plan_text) = self.plan_text.clone() {
            let item = self.build_item(
                format!("plan:{}", self.turn_id),
                status.clone(),
                Some(Utc::now().to_rfc3339()),
                AgentThreadItemPayload::Plan { text: plan_text },
            );
            events.push(self.persist_item_and_build_event(item)?);
        }

        Ok(events)
    }

    fn build_item(
        &mut self,
        id: String,
        status: AgentThreadItemStatus,
        completed_at: Option<String>,
        payload: AgentThreadItemPayload,
    ) -> AgentThreadItem {
        let now = Utc::now().to_rfc3339();
        let started_at = self
            .item_statuses
            .get(&id)
            .map(|_| {
                let conn = lock_db(&self.db).ok()?;
                AgentTimelineDao::get_item(&conn, &id)
                    .ok()
                    .flatten()
                    .map(|item| item.started_at)
            })
            .flatten()
            .unwrap_or_else(|| now.clone());

        let sequence = if let Some(existing) = self.item_sequences.get(&id) {
            *existing
        } else {
            self.sequence_counter += 1;
            self.item_sequences
                .insert(id.clone(), self.sequence_counter);
            self.sequence_counter
        };

        AgentThreadItem {
            id,
            thread_id: self.thread_id.clone(),
            turn_id: self.turn_id.clone(),
            sequence,
            status,
            started_at,
            completed_at,
            updated_at: now,
            payload,
        }
    }

    fn persist_and_emit_item(
        &mut self,
        app: &AppHandle,
        event_name: &str,
        item: AgentThreadItem,
    ) -> Result<(), String> {
        let event = self.persist_item_and_build_event(item)?;
        emit_event(app, event_name, &event);
        Ok(())
    }

    fn persist_item_and_build_event(
        &mut self,
        item: AgentThreadItem,
    ) -> Result<RuntimeAgentEvent, String> {
        {
            let conn = lock_db(&self.db)?;
            AgentTimelineDao::upsert_item(&conn, &item)
                .map_err(|e| format!("保存 item 失败: {e}"))?;
        }

        let previous_status = self
            .item_statuses
            .insert(item.id.clone(), item.status.clone());
        let event = match (&previous_status, &item.status) {
            (None, AgentThreadItemStatus::InProgress) => {
                RuntimeAgentEvent::ItemStarted { item: item.clone() }
            }
            (None, _) => RuntimeAgentEvent::ItemCompleted { item: item.clone() },
            (_, AgentThreadItemStatus::Completed | AgentThreadItemStatus::Failed) => {
                RuntimeAgentEvent::ItemCompleted { item: item.clone() }
            }
            _ => RuntimeAgentEvent::ItemUpdated { item: item.clone() },
        };
        Ok(event)
    }

    fn persist_runtime_item(
        &mut self,
        app: &AppHandle,
        event_name: &str,
        mut item: AgentThreadItem,
        event: RuntimeAgentEvent,
    ) -> Result<(), String> {
        self.normalize_runtime_item_sequence(&mut item);
        let event = match event {
            RuntimeAgentEvent::ItemStarted { .. } => {
                RuntimeAgentEvent::ItemStarted { item: item.clone() }
            }
            RuntimeAgentEvent::ItemUpdated { .. } => {
                RuntimeAgentEvent::ItemUpdated { item: item.clone() }
            }
            RuntimeAgentEvent::ItemCompleted { .. } => {
                RuntimeAgentEvent::ItemCompleted { item: item.clone() }
            }
            other => other,
        };
        self.sync_runtime_item_state(&item);
        {
            let conn = lock_db(&self.db)?;
            AgentTimelineDao::upsert_item(&conn, &item)
                .map_err(|e| format!("保存 runtime item 失败: {e}"))?;
        }
        emit_event(app, event_name, &event);
        Ok(())
    }

    fn normalize_runtime_item_sequence(&mut self, item: &mut AgentThreadItem) {
        if let Some(existing_sequence) = self.item_sequences.get(&item.id) {
            item.sequence = *existing_sequence;
            return;
        }

        self.sequence_counter = self.sequence_counter.max(item.sequence);
        if !self.sequence_is_used_by_other_item(&item.id, item.sequence) {
            return;
        }

        item.sequence = self.next_available_sequence();
    }

    fn sequence_is_used_by_other_item(&self, item_id: &str, sequence: i64) -> bool {
        self.item_sequences
            .iter()
            .any(|(existing_id, existing_sequence)| {
                existing_id != item_id && *existing_sequence == sequence
            })
    }

    fn next_available_sequence(&mut self) -> i64 {
        loop {
            self.sequence_counter += 1;
            if !self
                .item_sequences
                .values()
                .any(|sequence| *sequence == self.sequence_counter)
            {
                return self.sequence_counter;
            }
        }
    }

    fn sync_runtime_item_state(&mut self, item: &AgentThreadItem) {
        self.thread_id = item.thread_id.clone();
        self.turn_id = item.turn_id.clone();
        self.sequence_counter = self.sequence_counter.max(item.sequence);
        self.item_sequences.insert(item.id.clone(), item.sequence);
        self.item_statuses
            .insert(item.id.clone(), item.status.clone());

        if let AgentThreadItemPayload::Plan { text } = &item.payload {
            self.plan_text = Some(text.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::dao::agent_timeline::{
        AgentThreadItem, AgentThreadItemPayload, AgentThreadItemStatus, AgentThreadTurnStatus,
        AgentTimelineDao,
    };
    use lime_core::database::schema::create_tables;
    use rusqlite::Connection;
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    fn setup_db() -> DbConnection {
        let conn = Connection::open_in_memory().expect("创建内存数据库失败");
        create_tables(&conn).expect("创建 agent timeline 表失败");
        conn.execute(
            "INSERT INTO agent_sessions (id, model, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "thread-1",
                "general:test",
                "2026-03-13T00:00:00Z",
                "2026-03-13T00:00:00Z"
            ],
        )
        .expect("创建测试 session");
        Arc::new(Mutex::new(conn))
    }

    fn running_turn(id: &str) -> AgentThreadTurn {
        AgentThreadTurn {
            id: id.to_string(),
            thread_id: "thread-1".to_string(),
            prompt_text: "@analysis 帮我分析一下今天的国际形势".to_string(),
            status: AgentThreadTurnStatus::Running,
            started_at: "2026-03-13T00:00:00Z".to_string(),
            completed_at: None,
            error_message: None,
            created_at: "2026-03-13T00:00:00Z".to_string(),
            updated_at: "2026-03-13T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn from_started_turn_should_upsert_turn_and_seed_existing_items() {
        let db = setup_db();
        {
            let conn = lock_db(&db).expect("获取数据库锁");
            AgentTimelineDao::upsert_turn(&conn, &running_turn("turn-skill-1"))
                .expect("写入测试 turn");
            AgentTimelineDao::upsert_item(
                &conn,
                &AgentThreadItem {
                    id: "reasoning:assistant-1".to_string(),
                    thread_id: "thread-1".to_string(),
                    turn_id: "turn-skill-1".to_string(),
                    sequence: 3,
                    status: AgentThreadItemStatus::InProgress,
                    started_at: "2026-03-13T00:00:01Z".to_string(),
                    completed_at: None,
                    updated_at: "2026-03-13T00:00:01Z".to_string(),
                    payload: AgentThreadItemPayload::Reasoning {
                        text: "先确认可用范围".to_string(),
                        summary: Some(vec!["先确认可用范围".to_string()]),
                    },
                },
            )
            .expect("写入测试 item");
        }

        let recorder =
            AgentTimelineRecorder::from_started_turn(db.clone(), running_turn("turn-skill-1"))
                .expect("应从 turn_started 创建 recorder");

        assert_eq!(recorder.thread_id(), "thread-1");
        assert_eq!(recorder.turn_id(), "turn-skill-1");

        let conn = lock_db(&db).expect("获取数据库锁");
        let turns = AgentTimelineDao::list_turns_by_thread(&conn, "thread-1").expect("读取 turn");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].id, "turn-skill-1");
        assert_eq!(turns[0].status, AgentThreadTurnStatus::Running);
    }

    #[test]
    fn synthetic_skill_item_should_keep_recorder_sequence_and_payload() {
        let db = setup_db();
        {
            let conn = lock_db(&db).expect("获取数据库锁");
            AgentTimelineDao::upsert_turn(&conn, &running_turn("turn-skill-1"))
                .expect("写入测试 turn");
            AgentTimelineDao::upsert_item(
                &conn,
                &AgentThreadItem {
                    id: "reasoning:assistant-1".to_string(),
                    thread_id: "thread-1".to_string(),
                    turn_id: "turn-skill-1".to_string(),
                    sequence: 3,
                    status: AgentThreadItemStatus::Completed,
                    started_at: "2026-03-13T00:00:01Z".to_string(),
                    completed_at: Some("2026-03-13T00:00:02Z".to_string()),
                    updated_at: "2026-03-13T00:00:02Z".to_string(),
                    payload: AgentThreadItemPayload::Reasoning {
                        text: "已完成思考".to_string(),
                        summary: Some(vec!["已完成思考".to_string()]),
                    },
                },
            )
            .expect("写入测试 item");
        }

        let mut recorder =
            AgentTimelineRecorder::from_started_turn(db.clone(), running_turn("turn-skill-1"))
                .expect("应从 turn_started 创建 recorder");
        let item_id = "skill:exec-1".to_string();
        let start_event = recorder
            .record_synthetic_item_event(
                item_id.clone(),
                AgentThreadItemStatus::InProgress,
                None,
                AgentThreadItemPayload::ToolCall {
                    tool_name: "Skill".to_string(),
                    arguments: Some(json!({
                        "skill": "analysis",
                        "source": "SKILL.md"
                    })),
                    output: Some("正在从 SKILL.md 读取并执行 Skill：Analysis".to_string()),
                    success: None,
                    error: None,
                    metadata: Some(json!({
                        "tool_family": "skill",
                        "skill_source": "SKILL.md",
                        "markdown_content_bytes": 1024
                    })),
                },
            )
            .expect("应记录 synthetic Skill item");

        let RuntimeAgentEvent::ItemStarted { item } = start_event else {
            panic!("首次 synthetic item 应发出 ItemStarted");
        };
        assert_eq!(item.sequence, 4);
        assert!(matches!(item.status, AgentThreadItemStatus::InProgress));
        match &item.payload {
            AgentThreadItemPayload::ToolCall {
                tool_name,
                arguments,
                metadata,
                ..
            } => {
                assert_eq!(tool_name, "Skill");
                assert_eq!(
                    arguments
                        .as_ref()
                        .and_then(|v| v.get("source"))
                        .and_then(serde_json::Value::as_str),
                    Some("SKILL.md")
                );
                assert_eq!(
                    metadata
                        .as_ref()
                        .and_then(|v| v.get("markdown_content_bytes"))
                        .and_then(serde_json::Value::as_u64),
                    Some(1024)
                );
            }
            _ => panic!("Skill invocation 应保存为 tool_call item"),
        }

        let completed_event = recorder
            .record_synthetic_item_event(
                item_id,
                AgentThreadItemStatus::Completed,
                Some("2026-03-13T00:00:03Z".to_string()),
                AgentThreadItemPayload::ToolCall {
                    tool_name: "Skill".to_string(),
                    arguments: Some(json!({
                        "skill": "analysis",
                        "source": "SKILL.md"
                    })),
                    output: Some("已从 SKILL.md 读取并执行 Skill：Analysis".to_string()),
                    success: Some(true),
                    error: None,
                    metadata: Some(json!({
                        "tool_family": "skill",
                        "skill_source": "SKILL.md",
                        "markdown_content_bytes": 1024
                    })),
                },
            )
            .expect("应完成 synthetic Skill item");

        let RuntimeAgentEvent::ItemCompleted { item } = completed_event else {
            panic!("完成 synthetic item 应发出 ItemCompleted");
        };
        assert_eq!(item.sequence, 4);
        assert_eq!(item.completed_at.as_deref(), Some("2026-03-13T00:00:03Z"));
        assert!(matches!(item.status, AgentThreadItemStatus::Completed));
    }

    #[test]
    fn side_tool_events_should_persist_workspace_skill_metadata() {
        let db = setup_db();
        let mut recorder =
            AgentTimelineRecorder::from_started_turn(db.clone(), running_turn("turn-skill-1"))
                .expect("应从 turn_started 创建 recorder");
        let tool_id = "agent-app-required-skill:turn-skill-1:0:capability-report";

        let start_event = recorder
            .record_tool_start_event(
                "Skill(project:capability-report)",
                tool_id,
                Some(r#"{"skill":"project:capability-report"}"#),
            )
            .expect("应记录 side tool start");
        assert!(
            matches!(start_event, RuntimeAgentEvent::ItemStarted { item } if item.id == tool_id)
        );

        let end_event = recorder
            .record_tool_end_event(
                tool_id,
                &lime_agent::AgentToolResult {
                    success: true,
                    output: "ok".to_string(),
                    error: None,
                    images: None,
                    metadata: Some(HashMap::from([
                        (
                            "toolName".to_string(),
                            json!("Skill(project:capability-report)"),
                        ),
                        (
                            "workspace_skill_source".to_string(),
                            json!({
                                "sourceDraftId": "capdraft-1",
                                "sourceVerificationReportId": "capver-1",
                            }),
                        ),
                        (
                            "workspace_skill_runtime_enable".to_string(),
                            json!({
                                "source": "agent_envelope_scheduled_run",
                                "skill": "project:capability-report",
                            }),
                        ),
                    ])),
                },
            )
            .expect("应记录 side tool end");

        let RuntimeAgentEvent::ItemCompleted { item } = end_event else {
            panic!("side tool end 应完成 timeline item");
        };
        assert_eq!(item.id, tool_id);
        assert_eq!(item.sequence, 1);
        assert!(matches!(item.status, AgentThreadItemStatus::Completed));

        let AgentThreadItemPayload::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            metadata,
            ..
        } = item.payload
        else {
            panic!("side tool event 应保存为 tool_call item");
        };
        assert_eq!(tool_name, "Skill(project:capability-report)");
        assert_eq!(
            arguments
                .as_ref()
                .and_then(|value| value.get("skill"))
                .and_then(Value::as_str),
            Some("project:capability-report")
        );
        assert_eq!(output.as_deref(), Some("ok"));
        assert_eq!(success, Some(true));
        assert_eq!(
            metadata
                .as_ref()
                .and_then(|value| value.pointer("/workspace_skill_source/sourceDraftId")),
            Some(&json!("capdraft-1"))
        );
        assert_eq!(
            metadata
                .as_ref()
                .and_then(|value| value.pointer("/workspace_skill_runtime_enable/skill")),
            Some(&json!("project:capability-report"))
        );

        let conn = lock_db(&db).expect("获取数据库锁");
        let persisted = AgentTimelineDao::get_item(&conn, tool_id)
            .expect("读取 item")
            .expect("item 应已持久化");
        assert!(matches!(persisted.status, AgentThreadItemStatus::Completed));
    }

    #[test]
    fn runtime_items_after_synthetic_skill_should_not_reuse_sequence() {
        let db = setup_db();
        {
            let conn = lock_db(&db).expect("获取数据库锁");
            AgentTimelineDao::upsert_turn(&conn, &running_turn("turn-skill-1"))
                .expect("写入测试 turn");
            AgentTimelineDao::upsert_item(
                &conn,
                &AgentThreadItem {
                    id: "user:1".to_string(),
                    thread_id: "thread-1".to_string(),
                    turn_id: "turn-skill-1".to_string(),
                    sequence: 1,
                    status: AgentThreadItemStatus::Completed,
                    started_at: "2026-03-13T00:00:01Z".to_string(),
                    completed_at: Some("2026-03-13T00:00:01Z".to_string()),
                    updated_at: "2026-03-13T00:00:01Z".to_string(),
                    payload: AgentThreadItemPayload::UserMessage {
                        content: "@analysis 请分析".to_string(),
                    },
                },
            )
            .expect("写入测试 user item");
        }

        let mut recorder =
            AgentTimelineRecorder::from_started_turn(db.clone(), running_turn("turn-skill-1"))
                .expect("应从 turn_started 创建 recorder");
        recorder
            .record_synthetic_item_event(
                "skill:exec-1".to_string(),
                AgentThreadItemStatus::InProgress,
                None,
                AgentThreadItemPayload::ToolCall {
                    tool_name: "Skill".to_string(),
                    arguments: Some(json!({
                        "skill": "analysis",
                        "source": "SKILL.md"
                    })),
                    output: Some("正在从 SKILL.md 读取并执行 Skill：analysis".to_string()),
                    success: None,
                    error: None,
                    metadata: Some(json!({
                        "tool_family": "skill",
                        "skill_source": "SKILL.md",
                        "markdown_content_bytes": 1024
                    })),
                },
            )
            .expect("应记录 synthetic Skill item");

        let mut reasoning_item = AgentThreadItem {
            id: "reasoning:1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-skill-1".to_string(),
            sequence: 2,
            status: AgentThreadItemStatus::InProgress,
            started_at: "2026-03-13T00:00:02Z".to_string(),
            completed_at: None,
            updated_at: "2026-03-13T00:00:02Z".to_string(),
            payload: AgentThreadItemPayload::Reasoning {
                text: "先读取 Skill".to_string(),
                summary: Some(vec!["先读取 Skill".to_string()]),
            },
        };

        recorder.normalize_runtime_item_sequence(&mut reasoning_item);

        assert_eq!(reasoning_item.sequence, 3);
        let conn = lock_db(&db).expect("获取数据库锁");
        let items = AgentTimelineDao::list_items_by_thread(&conn, "thread-1").expect("读取 item");
        let skill_item = items.iter().find(|item| item.id == "skill:exec-1").unwrap();
        assert_eq!(skill_item.sequence, 2);
    }

    #[test]
    fn fail_turn_should_persist_failed_turn_before_emitting_events() {
        let db = setup_db();
        let mut recorder = AgentTimelineRecorder::create(db.clone(), "thread-1", "turn-1", "hello")
            .expect("创建 recorder");

        let events = recorder.fail_turn("boom").expect("写入失败终态");

        let conn = lock_db(&db).expect("获取数据库锁");
        let turns = AgentTimelineDao::list_turns_by_thread(&conn, "thread-1").expect("读取 turn");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].status, AgentThreadTurnStatus::Failed);
        assert_eq!(turns[0].error_message.as_deref(), Some("boom"));
        drop(conn);

        assert!(events
            .iter()
            .any(|event| matches!(event, RuntimeAgentEvent::TurnFailed { .. })));
        assert!(events
            .iter()
            .any(|event| matches!(event, RuntimeAgentEvent::ItemCompleted { item } if item.id == "error:turn-1")));
    }

    #[test]
    fn abort_turn_should_persist_aborted_turn_without_error_item() {
        let db = setup_db();
        let mut recorder = AgentTimelineRecorder::create(db.clone(), "thread-1", "turn-1", "hello")
            .expect("创建 recorder");

        let events = recorder
            .abort_turn("用户已停止当前执行")
            .expect("写入中断终态");

        let conn = lock_db(&db).expect("获取数据库锁");
        let turns = AgentTimelineDao::list_turns_by_thread(&conn, "thread-1").expect("读取 turn");
        let items = AgentTimelineDao::list_items_by_thread(&conn, "thread-1").expect("读取 item");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].status, AgentThreadTurnStatus::Aborted);
        assert_eq!(
            turns[0].error_message.as_deref(),
            Some("用户已停止当前执行")
        );
        assert!(items.iter().all(|item| item.id != "error:turn-1"));
        drop(conn);

        assert!(events
            .iter()
            .any(|event| matches!(event, RuntimeAgentEvent::TurnFailed { turn } if turn.status == AgentThreadTurnStatus::Aborted)));
    }

    #[test]
    fn abort_running_turn_by_id_should_complete_in_progress_items_without_error_item() {
        let db = setup_db();
        AgentTimelineRecorder::create(db.clone(), "thread-1", "turn-1", "hello")
            .expect("创建 recorder");
        {
            let conn = lock_db(&db).expect("获取数据库锁");
            AgentTimelineDao::upsert_item(
                &conn,
                &AgentThreadItem {
                    id: "item-1".to_string(),
                    thread_id: "thread-1".to_string(),
                    turn_id: "turn-1".to_string(),
                    sequence: 0,
                    status: AgentThreadItemStatus::InProgress,
                    started_at: "2026-03-29T00:00:00.000Z".to_string(),
                    completed_at: None,
                    updated_at: "2026-03-29T00:00:00.000Z".to_string(),
                    payload: AgentThreadItemPayload::TurnSummary {
                        text: "running".to_string(),
                        metadata: None,
                    },
                },
            )
            .expect("写入测试 item");
        }

        let aborted = abort_running_turn_by_id(&db, "thread-1", "turn-1", "用户已停止当前执行")
            .expect("应中断 running turn");

        let conn = lock_db(&db).expect("获取数据库锁");
        let turns = AgentTimelineDao::list_turns_by_thread(&conn, "thread-1").expect("读取 turn");
        let items = AgentTimelineDao::list_items_by_thread(&conn, "thread-1").expect("读取 item");
        assert!(aborted);
        assert_eq!(turns[0].status, AgentThreadTurnStatus::Aborted);
        assert_eq!(items[0].status, AgentThreadItemStatus::Completed);
        assert!(items[0].completed_at.is_some());
        assert!(items.iter().all(|item| item.id != "error:turn-1"));
    }

    #[test]
    fn complete_turn_success_should_persist_completed_turn_before_emitting_events() {
        let db = setup_db();
        let mut recorder = AgentTimelineRecorder::create(db.clone(), "thread-1", "turn-1", "hello")
            .expect("创建 recorder");

        let events = recorder.complete_turn_success().expect("写入完成终态");

        let conn = lock_db(&db).expect("获取数据库锁");
        let turns = AgentTimelineDao::list_turns_by_thread(&conn, "thread-1").expect("读取 turn");
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].status, AgentThreadTurnStatus::Completed);
        assert!(turns[0].completed_at.is_some());
        drop(conn);

        assert!(events
            .iter()
            .any(|event| matches!(event, RuntimeAgentEvent::TurnCompleted { .. })));
    }
}
