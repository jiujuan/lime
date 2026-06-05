//! Agent Scheduler 核心实现
//!
//! 提供任务调度的核心功能

use super::dao::SchedulerDao;
use super::types::{
    ScheduledTask, TaskFilter, DEFAULT_TASK_COOLDOWN_SECS, DEFAULT_TASK_FAILURE_THRESHOLD,
};
use async_trait::async_trait;
use lime_core::database::DbConnection;

/// 调度器 Trait
///
/// 定义调度器的核心接口
#[async_trait]
pub trait SchedulerTrait: Send + Sync {
    /// 创建新任务
    async fn create_task(&self, task: ScheduledTask) -> Result<String, String>;

    /// 获取任务
    async fn get_task(&self, id: &str) -> Result<Option<ScheduledTask>, String>;

    /// 查询任务列表
    async fn list_tasks(&self, filter: TaskFilter) -> Result<Vec<ScheduledTask>, String>;

    /// 更新任务
    async fn update_task(&self, task: ScheduledTask) -> Result<(), String>;

    /// 删除任务
    async fn delete_task(&self, id: &str) -> Result<bool, String>;

    /// 获取到期任务
    async fn get_due_tasks(&self, limit: usize) -> Result<Vec<ScheduledTask>, String>;

    /// 标记任务为运行中
    async fn mark_task_running(&self, id: &str) -> Result<(), String>;

    /// 标记任务为完成
    async fn mark_task_completed(
        &self,
        id: &str,
        result: Option<serde_json::Value>,
    ) -> Result<(), String>;

    /// 标记任务为失败
    async fn mark_task_failed(&self, id: &str, error: String) -> Result<(), String>;

    /// 标记任务为取消
    async fn mark_task_cancelled(&self, id: &str) -> Result<(), String>;
}

/// Agent Scheduler 实现
pub struct AgentScheduler {
    db: DbConnection,
    governance_config: SchedulerGovernanceConfig,
}

/// 调度任务治理配置
#[derive(Debug, Clone)]
pub struct SchedulerGovernanceConfig {
    /// 连续失败阈值，达到后进入冷却停用
    pub failure_threshold: u32,
    /// 冷却时长（秒）
    pub cooldown_secs: i64,
}

impl Default for SchedulerGovernanceConfig {
    fn default() -> Self {
        Self {
            failure_threshold: DEFAULT_TASK_FAILURE_THRESHOLD,
            cooldown_secs: DEFAULT_TASK_COOLDOWN_SECS,
        }
    }
}

impl SchedulerGovernanceConfig {
    fn normalized(&self) -> Self {
        Self {
            failure_threshold: self.failure_threshold.max(1),
            cooldown_secs: self.cooldown_secs.max(30),
        }
    }
}

impl AgentScheduler {
    /// 创建新的调度器实例
    pub fn new(db: DbConnection) -> Self {
        Self {
            db,
            governance_config: SchedulerGovernanceConfig::default(),
        }
    }

    /// 使用指定治理配置创建调度器
    pub fn with_governance_config(db: DbConnection, config: SchedulerGovernanceConfig) -> Self {
        Self {
            db,
            governance_config: config.normalized(),
        }
    }

    /// 初始化数据库表
    pub fn init_tables(db: &DbConnection) -> Result<(), String> {
        let conn = lime_core::database::lock_db(db)?;
        SchedulerDao::create_tables(&conn).map_err(|e| format!("创建调度器表失败: {e}"))
    }
}

#[async_trait]
impl SchedulerTrait for AgentScheduler {
    async fn create_task(&self, task: ScheduledTask) -> Result<String, String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        let task_id = task.id.clone();
        SchedulerDao::create_task(&conn, &task).map_err(|e| format!("创建任务失败: {e}"))?;
        tracing::info!("[AgentScheduler] 创建任务: {} ({})", task.name, task_id);
        Ok(task_id)
    }

    async fn get_task(&self, id: &str) -> Result<Option<ScheduledTask>, String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        SchedulerDao::get_task(&conn, id).map_err(|e| format!("获取任务失败: {e}"))
    }

    async fn list_tasks(&self, filter: TaskFilter) -> Result<Vec<ScheduledTask>, String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        SchedulerDao::list_tasks(&conn, &filter).map_err(|e| format!("查询任务列表失败: {e}"))
    }

    async fn update_task(&self, task: ScheduledTask) -> Result<(), String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        SchedulerDao::update_task(&conn, &task).map_err(|e| format!("更新任务失败: {e}"))
    }

    async fn delete_task(&self, id: &str) -> Result<bool, String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        let deleted =
            SchedulerDao::delete_task(&conn, id).map_err(|e| format!("删除任务失败: {e}"))?;
        if deleted {
            tracing::info!("[AgentScheduler] 删除任务: {}", id);
        }
        Ok(deleted)
    }

    async fn get_due_tasks(&self, limit: usize) -> Result<Vec<ScheduledTask>, String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        SchedulerDao::get_due_tasks(&conn, limit).map_err(|e| format!("获取到期任务失败: {e}"))
    }

    async fn mark_task_running(&self, id: &str) -> Result<(), String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        let mut task = SchedulerDao::get_task(&conn, id)
            .map_err(|e| format!("获取任务失败: {e}"))?
            .ok_or_else(|| format!("任务不存在: {id}"))?;

        if task.is_in_cooldown() {
            let until = task
                .auto_disabled_until
                .clone()
                .unwrap_or_else(|| "未知时间".to_string());
            return Err(format!("任务处于冷却停用中，截止时间: {until}"));
        }

        task.mark_running();
        SchedulerDao::update_task(&conn, &task).map_err(|e| format!("更新任务状态失败: {e}"))?;
        tracing::info!("[AgentScheduler] 任务开始执行: {}", id);
        Ok(())
    }

    async fn mark_task_completed(
        &self,
        id: &str,
        result: Option<serde_json::Value>,
    ) -> Result<(), String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        let mut task = SchedulerDao::get_task(&conn, id)
            .map_err(|e| format!("获取任务失败: {e}"))?
            .ok_or_else(|| format!("任务不存在: {id}"))?;

        task.mark_completed(result);
        SchedulerDao::update_task(&conn, &task).map_err(|e| format!("更新任务状态失败: {e}"))?;
        tracing::info!("[AgentScheduler] 任务执行成功: {}", id);
        Ok(())
    }

    async fn mark_task_failed(&self, id: &str, error: String) -> Result<(), String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        let mut task = SchedulerDao::get_task(&conn, id)
            .map_err(|e| format!("获取任务失败: {e}"))?
            .ok_or_else(|| format!("任务不存在: {id}"))?;

        task.mark_failed(error.clone());
        let triggered_cooldown = task.apply_failure_governance(
            self.governance_config.failure_threshold,
            self.governance_config.cooldown_secs,
        );
        SchedulerDao::update_task(&conn, &task).map_err(|e| format!("更新任务状态失败: {e}"))?;
        if triggered_cooldown {
            tracing::warn!(
                "[AgentScheduler] 任务执行失败并触发自动停用: {} - {} (consecutive_failures={})",
                id,
                error,
                task.consecutive_failures
            );
        } else {
            tracing::warn!(
                "[AgentScheduler] 任务执行失败: {} - {} (consecutive_failures={})",
                id,
                error,
                task.consecutive_failures
            );
        }
        Ok(())
    }

    async fn mark_task_cancelled(&self, id: &str) -> Result<(), String> {
        let conn = lime_core::database::lock_db(&self.db)?;
        let mut task = SchedulerDao::get_task(&conn, id)
            .map_err(|e| format!("获取任务失败: {e}"))?
            .ok_or_else(|| format!("任务不存在: {id}"))?;

        task.mark_cancelled();
        SchedulerDao::update_task(&conn, &task).map_err(|e| format!("更新任务状态失败: {e}"))?;
        tracing::info!("[AgentScheduler] 任务已取消: {}", id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TaskStatus;
    use chrono::Utc;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn setup_test_scheduler() -> AgentScheduler {
        let conn = Connection::open_in_memory().unwrap();
        SchedulerDao::create_tables(&conn).unwrap();
        let db = Arc::new(Mutex::new(conn));
        AgentScheduler::with_governance_config(
            db,
            SchedulerGovernanceConfig {
                failure_threshold: 2,
                cooldown_secs: 120,
            },
        )
    }

    #[tokio::test]
    async fn test_create_and_get_task() {
        let scheduler = setup_test_scheduler();

        let task = ScheduledTask::new(
            "Test Task".to_string(),
            "test_type".to_string(),
            serde_json::json!({"key": "value"}),
            "openai".to_string(),
            "gpt-4".to_string(),
            Utc::now(),
        );

        let task_id = scheduler.create_task(task.clone()).await.unwrap();
        let retrieved = scheduler.get_task(&task_id).await.unwrap().unwrap();

        assert_eq!(retrieved.id, task_id);
        assert_eq!(retrieved.name, task.name);
    }

    #[tokio::test]
    async fn test_mark_task_running() {
        let scheduler = setup_test_scheduler();

        let task = ScheduledTask::new(
            "Test".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            Utc::now(),
        );

        let task_id = scheduler.create_task(task).await.unwrap();
        scheduler.mark_task_running(&task_id).await.unwrap();

        let updated = scheduler.get_task(&task_id).await.unwrap().unwrap();
        assert_eq!(updated.status, TaskStatus::Running);
        assert!(updated.started_at.is_some());
    }

    #[tokio::test]
    async fn test_mark_task_completed() {
        let scheduler = setup_test_scheduler();

        let task = ScheduledTask::new(
            "Test".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            Utc::now(),
        );

        let task_id = scheduler.create_task(task).await.unwrap();
        scheduler.mark_task_running(&task_id).await.unwrap();
        scheduler
            .mark_task_completed(&task_id, Some(serde_json::json!("success")))
            .await
            .unwrap();

        let updated = scheduler.get_task(&task_id).await.unwrap().unwrap();
        assert_eq!(updated.status, TaskStatus::Completed);
        assert_eq!(updated.result, Some(serde_json::json!("success")));
    }

    #[tokio::test]
    async fn test_get_due_tasks() {
        let scheduler = setup_test_scheduler();

        let past = Utc::now() - chrono::Duration::hours(1);
        let future = Utc::now() + chrono::Duration::hours(1);

        let past_task = ScheduledTask::new(
            "Past".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            past,
        );

        let future_task = ScheduledTask::new(
            "Future".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            future,
        );

        scheduler.create_task(past_task).await.unwrap();
        scheduler.create_task(future_task).await.unwrap();

        let due_tasks = scheduler.get_due_tasks(10).await.unwrap();
        assert_eq!(due_tasks.len(), 1);
        assert_eq!(due_tasks[0].name, "Past");
    }

    #[tokio::test]
    async fn test_mark_task_failed_should_trigger_cooldown() {
        let scheduler = setup_test_scheduler();
        let task = ScheduledTask::new(
            "Failing Task".to_string(),
            "agent_chat".to_string(),
            serde_json::json!({"prompt": "fail"}),
            "openai".to_string(),
            "gpt-4".to_string(),
            Utc::now(),
        );

        let task_id = scheduler.create_task(task).await.unwrap();
        scheduler
            .mark_task_failed(&task_id, "error1".to_string())
            .await
            .unwrap();
        scheduler
            .mark_task_failed(&task_id, "error2".to_string())
            .await
            .unwrap();

        let updated = scheduler.get_task(&task_id).await.unwrap().unwrap();
        assert_eq!(updated.consecutive_failures, 2);
        assert!(updated.auto_disabled_until.is_some());
        assert!(updated.is_in_cooldown());
    }
}
