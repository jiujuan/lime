//! Agent Scheduler 数据模型
//!
//! 定义调度任务相关的数据结构

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 默认连续失败阈值
pub const DEFAULT_TASK_FAILURE_THRESHOLD: u32 = 3;
/// 默认冷却时长（秒）
pub const DEFAULT_TASK_COOLDOWN_SECS: i64 = 300;

/// 任务状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    /// 等待执行
    Pending,
    /// 正在执行
    Running,
    /// 执行成功
    Completed,
    /// 执行失败
    Failed,
    /// 已取消
    Cancelled,
}

impl Default for TaskStatus {
    fn default() -> Self {
        Self::Pending
    }
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Running => write!(f, "running"),
            Self::Completed => write!(f, "completed"),
            Self::Failed => write!(f, "failed"),
            Self::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// 调度任务
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    /// 任务 UUID
    pub id: String,
    /// 任务名称
    pub name: String,
    /// 任务描述
    pub description: Option<String>,
    /// 任务类型（标识要执行的操作）
    pub task_type: String,
    /// 任务参数（JSON 格式）
    pub params: serde_json::Value,
    /// Provider 类型
    pub provider_type: String,
    /// 模型名称
    pub model: String,
    /// 任务状态
    pub status: TaskStatus,
    /// 计划执行时间（RFC3339 格式）
    pub scheduled_at: String,
    /// 实际执行开始时间（可选）
    pub started_at: Option<String>,
    /// 实际执行完成时间（可选）
    pub completed_at: Option<String>,
    /// 执行结果（可选）
    pub result: Option<serde_json::Value>,
    /// 错误信息（如果执行失败）
    pub error_message: Option<String>,
    /// 重试次数
    pub retry_count: u32,
    /// 最大重试次数
    pub max_retries: u32,
    /// 连续失败次数
    pub consecutive_failures: u32,
    /// 自动停用冷却截止时间（RFC3339）
    pub auto_disabled_until: Option<String>,
    /// 创建时间
    pub created_at: String,
    /// 更新时间
    pub updated_at: String,
}

impl ScheduledTask {
    /// 创建新任务
    pub fn new(
        name: String,
        task_type: String,
        params: serde_json::Value,
        provider_type: String,
        model: String,
        scheduled_at: DateTime<Utc>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            description: None,
            task_type,
            params,
            provider_type,
            model,
            status: TaskStatus::Pending,
            scheduled_at: scheduled_at.to_rfc3339(),
            started_at: None,
            completed_at: None,
            result: None,
            error_message: None,
            retry_count: 0,
            max_retries: 3,
            consecutive_failures: 0,
            auto_disabled_until: None,
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
        }
    }

    /// 检查任务是否到期
    pub fn is_due(&self) -> bool {
        if self.status != TaskStatus::Pending {
            return false;
        }

        match DateTime::parse_from_rfc3339(&self.scheduled_at) {
            Ok(scheduled_time) => {
                let now = Utc::now();
                scheduled_time <= now.with_timezone(&chrono::FixedOffset::east_opt(0).unwrap())
            }
            Err(_) => false,
        }
    }

    /// 检查是否可以重试
    pub fn can_retry(&self) -> bool {
        self.status == TaskStatus::Failed && self.retry_count < self.max_retries
    }

    /// 增加重试计数
    pub fn increment_retry(&mut self) {
        self.retry_count += 1;
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 标记为运行中
    pub fn mark_running(&mut self) {
        self.status = TaskStatus::Running;
        self.started_at = Some(Utc::now().to_rfc3339());
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 标记为完成
    pub fn mark_completed(&mut self, result: Option<serde_json::Value>) {
        self.status = TaskStatus::Completed;
        self.completed_at = Some(Utc::now().to_rfc3339());
        self.result = result;
        self.error_message = None;
        self.retry_count = 0;
        self.consecutive_failures = 0;
        self.auto_disabled_until = None;
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 标记为失败
    pub fn mark_failed(&mut self, error: String) {
        self.status = TaskStatus::Failed;
        self.completed_at = Some(Utc::now().to_rfc3339());
        self.error_message = Some(error);
        self.consecutive_failures = self.consecutive_failures.saturating_add(1);
        self.retry_count = self.retry_count.saturating_add(1);
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 标记为取消
    pub fn mark_cancelled(&mut self) {
        self.status = TaskStatus::Cancelled;
        self.completed_at = Some(Utc::now().to_rfc3339());
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 是否处于自动停用冷却期
    pub fn is_in_cooldown(&self) -> bool {
        self.cooldown_until_utc()
            .map(|until| until > Utc::now())
            .unwrap_or(false)
    }

    /// 获取冷却截止时间
    pub fn cooldown_until_utc(&self) -> Option<DateTime<Utc>> {
        self.auto_disabled_until
            .as_deref()
            .and_then(parse_rfc3339_utc)
    }

    /// 设置冷却截止时间
    pub fn activate_cooldown(&mut self, cooldown_secs: i64) {
        let cooldown_secs = cooldown_secs.max(30);
        let until = Utc::now() + chrono::Duration::seconds(cooldown_secs);
        self.auto_disabled_until = Some(until.to_rfc3339());
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// 根据连续失败策略尝试触发自动停用
    pub fn apply_failure_governance(&mut self, failure_threshold: u32, cooldown_secs: i64) -> bool {
        let threshold = failure_threshold.max(1);
        if self.consecutive_failures >= threshold {
            self.activate_cooldown(cooldown_secs);
            true
        } else {
            false
        }
    }
}

fn parse_rfc3339_utc(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

/// 任务查询过滤器
#[derive(Debug, Clone, Default)]
pub struct TaskFilter {
    /// 任务状态
    pub status: Option<TaskStatus>,
    /// Provider 类型
    pub provider_type: Option<String>,
    /// 任务类型
    pub task_type: Option<String>,
    /// 是否只查询到期的任务
    pub only_due: bool,
    /// 限制返回数量
    pub limit: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_status_display() {
        assert_eq!(TaskStatus::Pending.to_string(), "pending");
        assert_eq!(TaskStatus::Running.to_string(), "running");
        assert_eq!(TaskStatus::Completed.to_string(), "completed");
        assert_eq!(TaskStatus::Failed.to_string(), "failed");
        assert_eq!(TaskStatus::Cancelled.to_string(), "cancelled");
    }

    #[test]
    fn test_scheduled_task_creation() {
        let task = ScheduledTask::new(
            "Test Task".to_string(),
            "test_type".to_string(),
            serde_json::json!({"key": "value"}),
            "openai".to_string(),
            "gpt-4".to_string(),
            Utc::now(),
        );

        assert_eq!(task.name, "Test Task");
        assert_eq!(task.status, TaskStatus::Pending);
        assert_eq!(task.retry_count, 0);
        assert_eq!(task.max_retries, 3);
        assert_eq!(task.consecutive_failures, 0);
        assert!(task.auto_disabled_until.is_none());
    }

    #[test]
    fn test_task_is_due() {
        let past = Utc::now() - chrono::Duration::hours(1);
        let future = Utc::now() + chrono::Duration::hours(1);

        let mut past_task = ScheduledTask::new(
            "Past Task".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            past,
        );

        let future_task = ScheduledTask::new(
            "Future Task".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            future,
        );

        assert!(past_task.is_due());
        assert!(!future_task.is_due());

        // 非 pending 状态的任务不应被判定为到期
        past_task.status = TaskStatus::Running;
        assert!(!past_task.is_due());
    }

    #[test]
    fn test_task_can_retry() {
        let mut task = ScheduledTask::new(
            "Test".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            Utc::now(),
        );

        task.status = TaskStatus::Failed;
        assert!(task.can_retry());

        task.retry_count = 3;
        assert!(!task.can_retry());

        task.status = TaskStatus::Completed;
        assert!(!task.can_retry());
    }

    #[test]
    fn test_task_status_transitions() {
        let mut task = ScheduledTask::new(
            "Test".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            Utc::now(),
        );

        task.mark_running();
        assert_eq!(task.status, TaskStatus::Running);
        assert!(task.started_at.is_some());

        task.mark_completed(Some(serde_json::json!("success")));
        assert_eq!(task.status, TaskStatus::Completed);
        assert!(task.completed_at.is_some());
        assert_eq!(task.result, Some(serde_json::json!("success")));

        // 重置状态测试失败
        task.status = TaskStatus::Pending;
        task.started_at = None;
        task.completed_at = None;
        task.result = None;

        task.mark_running();
        task.mark_failed("error message".to_string());
        assert_eq!(task.status, TaskStatus::Failed);
        assert!(task.completed_at.is_some());
        assert_eq!(task.error_message, Some("error message".to_string()));
        assert_eq!(task.consecutive_failures, 1);
    }

    #[test]
    fn test_task_failure_governance_should_trigger_cooldown() {
        let mut task = ScheduledTask::new(
            "Test".to_string(),
            "test".to_string(),
            serde_json::json!(null),
            "openai".to_string(),
            "gpt-4".to_string(),
            Utc::now(),
        );

        task.mark_failed("error-1".to_string());
        task.mark_failed("error-2".to_string());
        task.mark_failed("error-3".to_string());
        let triggered = task.apply_failure_governance(3, 120);
        assert!(triggered);
        assert!(task.auto_disabled_until.is_some());
        assert!(task.is_in_cooldown());

        task.mark_completed(Some(serde_json::json!("ok")));
        assert_eq!(task.consecutive_failures, 0);
        assert!(task.auto_disabled_until.is_none());
    }
}
