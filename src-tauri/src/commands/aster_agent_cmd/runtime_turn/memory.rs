use super::*;

pub(super) fn normalize_runtime_memory_capture_text(input: &str) -> String {
    input.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(super) fn contains_runtime_memory_capture_signal(text: &str) -> bool {
    [
        "记住",
        "偏好",
        "喜欢",
        "不喜欢",
        "习惯",
        "以后",
        "规则",
        "流程",
        "workflow",
        "prefer",
        "always",
        "never",
        "计划",
        "待办",
        "todo",
        "下一步",
        "错误",
        "失败",
        "报错",
        "修复",
        "fix",
        "bug",
    ]
    .iter()
    .any(|keyword| text.contains(keyword))
}

pub(super) fn should_auto_capture_runtime_memory_turn(
    user_message: &str,
    assistant_output: &str,
) -> bool {
    let normalized_user = normalize_runtime_memory_capture_text(user_message);
    let normalized_assistant = normalize_runtime_memory_capture_text(assistant_output);
    let total_chars = normalized_user.chars().count() + normalized_assistant.chars().count();

    if normalized_user.chars().count() >= AUTO_RUNTIME_MEMORY_MIN_USER_CHARS
        && normalized_assistant.chars().count() >= AUTO_RUNTIME_MEMORY_MIN_ASSISTANT_CHARS
        && total_chars >= AUTO_RUNTIME_MEMORY_MIN_TOTAL_CHARS
    {
        return true;
    }

    let signal_text = format!(
        "{} {}",
        normalized_user.to_lowercase(),
        normalized_assistant.to_lowercase()
    );
    contains_runtime_memory_capture_signal(signal_text.as_str())
}

pub(super) fn spawn_runtime_memory_capture_task(
    app: &AppHandle,
    db: &DbConnection,
    memory_config: lime_core::config::MemoryConfig,
    session_id: &str,
    user_message: &str,
    assistant_output: &str,
) {
    if !memory_config.enabled || !memory_config.auto.enabled {
        return;
    }

    if !should_auto_capture_runtime_memory_turn(user_message, assistant_output) {
        return;
    }

    let context_memory_service = app
        .state::<crate::commands::context_memory::ContextMemoryServiceState>()
        .inner()
        .0
        .clone();
    let db = db.clone();
    let session_id = session_id.to_string();

    // 自动沉淀走后台任务，避免延长主回合完成时间。
    tokio::spawn(async move {
        let candidates = {
            let conn = match db.lock() {
                Ok(guard) => guard,
                Err(error) => {
                    tracing::warn!(
                        "[AsterAgent] 后台自动记忆无法获取数据库锁: session_id={}, error={}",
                        session_id,
                        error
                    );
                    return;
                }
            };

            match crate::services::chat_history_service::load_session_memory_source_candidates(
                &conn,
                &session_id,
                AUTO_RUNTIME_MEMORY_SESSION_MESSAGE_LIMIT,
                AUTO_RUNTIME_MEMORY_SESSION_MIN_MESSAGE_LENGTH,
            ) {
                Ok(candidates) => candidates,
                Err(error) => {
                    tracing::warn!(
                        "[AsterAgent] 后台自动记忆读取候选失败: session_id={}, error={}",
                        session_id,
                        error
                    );
                    return;
                }
            }
        };

        if candidates.is_empty() {
            return;
        }

        match crate::commands::memory_management_cmd::analyze_memory_candidates(
            context_memory_service.as_ref(),
            &memory_config,
            &candidates,
        ) {
            Ok(result) => {
                if result.generated_entries > 0 {
                    tracing::info!(
                        "[AsterAgent] 已自动沉淀工作记忆: session_id={}, generated={}, dedup={}",
                        session_id,
                        result.generated_entries,
                        result.deduplicated_entries
                    );
                }
            }
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent] 后台自动沉淀工作记忆失败: session_id={}, error={}",
                    session_id,
                    error
                );
            }
        }

        match crate::commands::unified_memory_cmd::analyze_unified_memory_candidates(
            &db,
            &memory_config,
            &candidates,
        )
        .await
        {
            Ok(result) => {
                if result.generated_entries > 0 {
                    tracing::info!(
                        "[AsterAgent] 已自动沉淀长期记忆: session_id={}, generated={}, dedup={}",
                        session_id,
                        result.generated_entries,
                        result.deduplicated_entries
                    );
                }
            }
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent] 后台自动沉淀长期记忆失败: session_id={}, error={}",
                    session_id,
                    error
                );
            }
        }
    });
}
