use super::*;
use crate::agent::runtime_queue_service::AgentRuntimeQueueContext;
use crate::database::{lock_db, DbConnection};
use lime_core::database::dao::agent_run::{AgentRun, AgentRunDao};
use lime_core::database::dao::agent_timeline::AgentThreadTurnStatus;
use lime_core::database::managed_objective_repository::{
    get_objective_by_owner, ManagedObjectiveRecord, ManagedObjectiveStatus,
    MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
};
use serde_json::{json, Value};

#[path = "objective_continuation_guard_audit.rs"]
mod objective_continuation_guard_audit;
#[cfg(test)]
use self::objective_continuation_guard_audit::build_auto_continuation_guard_audit_update;
use self::objective_continuation_guard_audit::persist_auto_continuation_guard_audit;

const DEFAULT_MAX_AUTO_TURNS: u32 = 3;
const DEFAULT_MAX_AUTO_ELAPSED_MS: i64 = 30 * 60 * 1_000;
const AUTO_CONTINUATION_RUN_SCAN_LIMIT: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ManagedObjectiveContinuationSource {
    ManualGui,
    AutoIdle,
}

impl ManagedObjectiveContinuationSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::ManualGui => "manual_gui",
            Self::AutoIdle => "auto_idle",
        }
    }

    fn audit_source(self) -> &'static str {
        match self {
            Self::ManualGui => "manual_gui_mvp",
            Self::AutoIdle => "auto_idle_guard",
        }
    }

    fn queue_if_busy(self) -> bool {
        matches!(self, Self::AutoIdle)
    }
}

#[derive(Debug, Clone, PartialEq)]
struct AutoContinuationPolicy {
    enabled: bool,
    max_auto_turns: u32,
    max_elapsed_ms: i64,
    max_estimated_total_cost: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq)]
struct AutoContinuationRunSummary {
    auto_turn_count: u32,
    estimated_total_cost: f64,
}

#[derive(Debug, Clone, PartialEq)]
enum AutoContinuationGuardDecision {
    Allow,
    Skip(&'static str),
    BudgetLimited(String),
}

#[derive(Debug, Clone)]
struct AutoContinuationGuardInput<'a> {
    objective: &'a ManagedObjectiveRecord,
    queued_turn_count: usize,
    pending_request_count: usize,
    running_turn_count: usize,
    interrupted: bool,
    run_summary: AutoContinuationRunSummary,
    now: chrono::DateTime<chrono::Utc>,
}

pub(crate) fn build_objective_continuation_request(
    objective: &ManagedObjectiveRecord,
    source: ManagedObjectiveContinuationSource,
) -> AsterChatRequest {
    let criteria = if objective.success_criteria.is_empty() {
        "未设置单独成功标准，请按目标本身判断下一步。".to_string()
    } else {
        objective
            .success_criteria
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let message = format!(
        "继续推进当前目标。\n\n目标：{}\n\n成功标准：\n{}\n\n请先检查当前会话事实、产物和待处理请求；只推进下一步，不要创建新的目标。",
        objective.objective_text, criteria
    );
    let metadata = json!({
        "harness": {
            "managed_objective": {
                "objective_id": objective.objective_id,
                "owner_type": objective.owner_kind,
                "owner_id": objective.owner_id,
                "objective_text": objective.objective_text,
                "success_criteria": objective.success_criteria,
                "continuation_source": source.as_str(),
                "completion_audit": {
                    "required": false,
                    "source": source.audit_source()
                }
            }
        }
    });

    AsterChatRequest {
        message,
        session_id: objective.owner_id.clone(),
        event_name: format!(
            "managed_objective:{}:{}:{}",
            objective.objective_id,
            source.as_str(),
            chrono::Utc::now().timestamp_millis()
        ),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: objective.workspace_id.clone().unwrap_or_default(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata: Some(metadata),
        turn_id: None,
        queue_if_busy: Some(source.queue_if_busy()),
        queued_turn_id: None,
    }
}

fn configure_provider_request_from_current_config(
    config: &ProviderConfig,
) -> ConfigureProviderRequest {
    ConfigureProviderRequest {
        provider_id: config.provider_selector.clone(),
        provider_name: config.provider_name.clone(),
        model_name: config.model_name.clone(),
        // 自动续跑请求可能进入持久化队列，不能把密钥写入 queued_turn_runtimes.payload_json。
        // Direct provider 的 API key 已在当前进程 provider 配置阶段写入运行时环境。
        api_key: None,
        base_url: config.base_url.clone(),
        model_capabilities: None,
        tool_call_strategy: config.toolshim.then_some(RuntimeToolCallStrategy::ToolShim),
        toolshim_model: config.toolshim_model.clone(),
    }
}

fn apply_provider_config_to_continuation_request(
    request: &mut AsterChatRequest,
    config: Option<ProviderConfig>,
) {
    let Some(config) = config else {
        return;
    };

    request.provider_preference = config
        .provider_selector
        .clone()
        .or_else(|| Some(config.provider_name.clone()));
    request.model_preference = Some(config.model_name.clone());
    request.provider_config = Some(configure_provider_request_from_current_config(&config));
}

fn insert_auto_continuation_guard_metadata(
    request: &mut AsterChatRequest,
    run_summary: &AutoContinuationRunSummary,
    policy: &AutoContinuationPolicy,
) {
    let Some(metadata) = request.metadata.as_mut() else {
        return;
    };
    let Some(managed_objective) = metadata
        .pointer_mut("/harness/managed_objective")
        .and_then(Value::as_object_mut)
    else {
        return;
    };

    managed_objective.insert(
        "auto_continuation_guard".to_string(),
        json!({
            "decision": "allow",
            "previous_auto_turn_count": run_summary.auto_turn_count,
            "next_auto_turn_count": run_summary.auto_turn_count + 1,
            "max_auto_turns": policy.max_auto_turns,
            "max_elapsed_ms": policy.max_elapsed_ms,
            "estimated_total_cost": run_summary.estimated_total_cost,
            "max_estimated_total_cost": policy.max_estimated_total_cost,
        }),
    );
}

pub(crate) async fn maybe_submit_managed_objective_auto_continuation(
    context: &AgentRuntimeQueueContext,
    session_id: &str,
) -> Result<Option<String>, String> {
    let objective = load_agent_session_objective(&context.db, session_id)?;
    let Some(objective) = objective else {
        return Ok(None);
    };

    let detail = AsterAgentWrapper::get_runtime_session_detail(&context.db, session_id).await?;
    let queued_turns = list_runtime_queue_snapshots_service(session_id).await?;
    let interrupted = context
        .state
        .get_interrupt_marker(session_id)
        .await
        .is_some();
    let run_summary = load_auto_continuation_run_summary(&context.db, session_id, &objective)?;
    let policy = resolve_auto_continuation_policy(
        objective.continuation_policy.as_ref(),
        objective.budget_policy.as_ref(),
    );
    let decision = resolve_auto_continuation_guard(AutoContinuationGuardInput {
        objective: &objective,
        queued_turn_count: queued_turns.len(),
        pending_request_count: build_pending_requests(&detail).len(),
        running_turn_count: detail
            .turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentThreadTurnStatus::Running))
            .count(),
        interrupted,
        run_summary: run_summary.clone(),
        now: chrono::Utc::now(),
    });

    match decision {
        AutoContinuationGuardDecision::Allow => {
            let mut request = build_objective_continuation_request(
                &objective,
                ManagedObjectiveContinuationSource::AutoIdle,
            );
            apply_provider_config_to_continuation_request(
                &mut request,
                context.state.get_provider_config().await,
            );
            insert_auto_continuation_guard_metadata(&mut request, &run_summary, &policy);
            let queued_task = build_queued_turn_task(request)?;
            let queued_turn_id = queued_task.queued_turn_id.clone();
            crate::agent::runtime_queue_service::submit_runtime_turn(
                context.app.clone(),
                &context.state,
                &context.db,
                &context.api_key_provider_service,
                &context.logs,
                &context.config_manager,
                &context.mcp_manager,
                &context.automation_state,
                queued_task,
                true,
                true,
                build_runtime_queue_executor(),
            )
            .await?;
            if let Err(error) = persist_auto_continuation_guard_audit(
                &context.db,
                session_id,
                &objective,
                &decision,
                &run_summary,
                &policy,
                Some(queued_turn_id.as_str()),
            ) {
                tracing::warn!(
                    "[AsterAgent][Objective] 写入目标自动续跑 guard 摘要失败，已保留已提交 turn: session_id={}, queued_turn_id={}, error={}",
                    session_id,
                    queued_turn_id,
                    error
                );
            }
            Ok(Some(queued_turn_id))
        }
        AutoContinuationGuardDecision::BudgetLimited(_) => {
            persist_auto_continuation_guard_audit(
                &context.db,
                session_id,
                &objective,
                &decision,
                &run_summary,
                &policy,
                None,
            )?;
            Ok(None)
        }
        AutoContinuationGuardDecision::Skip(_) => {
            if let Err(error) = persist_auto_continuation_guard_audit(
                &context.db,
                session_id,
                &objective,
                &decision,
                &run_summary,
                &policy,
                None,
            ) {
                tracing::warn!(
                    "[AsterAgent][Objective] 写入目标自动续跑 skip 摘要失败，已跳过: session_id={}, error={}",
                    session_id,
                    error
                );
            }
            Ok(None)
        }
    }
}

fn load_agent_session_objective(
    db: &DbConnection,
    session_id: &str,
) -> Result<Option<ManagedObjectiveRecord>, String> {
    let conn = lock_db(db)?;
    get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION, session_id)
}

fn load_auto_continuation_run_summary(
    db: &DbConnection,
    session_id: &str,
    objective: &ManagedObjectiveRecord,
) -> Result<AutoContinuationRunSummary, String> {
    let conn = lock_db(db)?;
    let runs = AgentRunDao::list_terminal_runs_by_session(
        &conn,
        session_id,
        AUTO_CONTINUATION_RUN_SCAN_LIMIT,
        0,
    )
    .map_err(|error| format!("读取目标自动续跑记录失败: {error}"))?;
    Ok(summarize_auto_continuation_runs(
        &runs,
        &objective.objective_id,
    ))
}

fn resolve_auto_continuation_guard(
    input: AutoContinuationGuardInput<'_>,
) -> AutoContinuationGuardDecision {
    if input.objective.status != ManagedObjectiveStatus::Active {
        return AutoContinuationGuardDecision::Skip("objective_not_active");
    }
    if input.objective.owner_kind != MANAGED_OBJECTIVE_OWNER_AGENT_SESSION {
        return AutoContinuationGuardDecision::Skip("unsupported_owner");
    }
    if input.running_turn_count > 0 {
        return AutoContinuationGuardDecision::Skip("runtime_turn_running");
    }
    if input.queued_turn_count > 0 {
        return AutoContinuationGuardDecision::Skip("queued_turn_exists");
    }
    if input.pending_request_count > 0 {
        return AutoContinuationGuardDecision::Skip("pending_request_exists");
    }
    if input.interrupted {
        return AutoContinuationGuardDecision::Skip("interrupt_pending");
    }
    if risk_policy_blocks_auto(input.objective.risk_policy.as_ref()) {
        return AutoContinuationGuardDecision::Skip("risk_policy_blocks_auto");
    }

    let policy = resolve_auto_continuation_policy(
        input.objective.continuation_policy.as_ref(),
        input.objective.budget_policy.as_ref(),
    );
    if !policy.enabled {
        return AutoContinuationGuardDecision::Skip("auto_continuation_not_enabled");
    }
    if policy.max_auto_turns == 0 || input.run_summary.auto_turn_count >= policy.max_auto_turns {
        return AutoContinuationGuardDecision::BudgetLimited(format!(
            "自动续跑已达到最大轮数 {}/{}",
            input.run_summary.auto_turn_count, policy.max_auto_turns
        ));
    }
    if objective_elapsed_ms(input.objective, input.now)
        .is_some_and(|elapsed_ms| elapsed_ms >= policy.max_elapsed_ms)
    {
        return AutoContinuationGuardDecision::BudgetLimited(format!(
            "自动续跑已达到最大耗时 {}ms",
            policy.max_elapsed_ms
        ));
    }
    if let Some(max_cost) = policy.max_estimated_total_cost {
        if input.run_summary.estimated_total_cost >= max_cost {
            return AutoContinuationGuardDecision::BudgetLimited(format!(
                "自动续跑已达到最大估算成本 {:.6}",
                max_cost
            ));
        }
    }

    AutoContinuationGuardDecision::Allow
}

fn resolve_auto_continuation_policy(
    continuation_policy: Option<&Value>,
    budget_policy: Option<&Value>,
) -> AutoContinuationPolicy {
    AutoContinuationPolicy {
        enabled: auto_idle_enabled(continuation_policy),
        max_auto_turns: integer_field(
            continuation_policy,
            &[
                "max_auto_turns",
                "maxAutoTurns",
                "max_idle_turns",
                "maxIdleTurns",
                "max_continuation_turns",
                "maxContinuationTurns",
            ],
        )
        .or_else(|| {
            integer_field(
                budget_policy,
                &["max_auto_turns", "maxAutoTurns", "max_turns", "maxTurns"],
            )
        })
        .unwrap_or(DEFAULT_MAX_AUTO_TURNS),
        max_elapsed_ms: integer_field(
            continuation_policy,
            &[
                "max_elapsed_ms",
                "maxElapsedMs",
                "max_duration_ms",
                "maxDurationMs",
                "max_runtime_ms",
                "maxRuntimeMs",
            ],
        )
        .or_else(|| {
            integer_field(
                budget_policy,
                &[
                    "max_elapsed_ms",
                    "maxElapsedMs",
                    "max_duration_ms",
                    "maxDurationMs",
                    "max_runtime_ms",
                    "maxRuntimeMs",
                ],
            )
        })
        .map(|value| value as i64)
        .unwrap_or(DEFAULT_MAX_AUTO_ELAPSED_MS),
        max_estimated_total_cost: number_field(
            continuation_policy,
            &[
                "max_estimated_total_cost",
                "maxEstimatedTotalCost",
                "max_total_cost",
                "maxTotalCost",
                "max_cost_usd",
                "maxCostUsd",
            ],
        )
        .or_else(|| {
            number_field(
                budget_policy,
                &[
                    "max_estimated_total_cost",
                    "maxEstimatedTotalCost",
                    "max_total_cost",
                    "maxTotalCost",
                    "max_cost_usd",
                    "maxCostUsd",
                ],
            )
        }),
    }
}

fn auto_idle_enabled(policy: Option<&Value>) -> bool {
    if bool_field(
        policy,
        &[
            "allow_auto_idle",
            "allowAutoIdle",
            "auto_idle",
            "autoIdle",
            "idle_continuation",
            "idleContinuation",
            "auto_continue",
            "autoContinue",
            "allow_auto_continuation",
            "allowAutoContinuation",
            "enabled",
        ],
    ) == Some(true)
    {
        return true;
    }

    matches!(
        string_field(policy, &["mode", "strategy", "source"]).as_deref(),
        Some("auto" | "auto_idle" | "idle" | "controlled_auto")
    )
}

fn risk_policy_blocks_auto(policy: Option<&Value>) -> bool {
    if bool_field(
        policy,
        &[
            "allow_auto_continuation",
            "allowAutoContinuation",
            "allow_auto_idle",
            "allowAutoIdle",
        ],
    ) == Some(false)
    {
        return true;
    }
    if bool_field(
        policy,
        &[
            "requires_manual_approval",
            "requiresManualApproval",
            "manual_approval_required",
            "manualApprovalRequired",
        ],
    ) == Some(true)
    {
        return true;
    }

    matches!(
        string_field(policy, &["risk_level", "riskLevel", "level"]).as_deref(),
        Some("high" | "critical")
    )
}

fn objective_elapsed_ms(
    objective: &ManagedObjectiveRecord,
    now: chrono::DateTime<chrono::Utc>,
) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(&objective.created_at)
        .ok()
        .map(|created_at| now.signed_duration_since(created_at.with_timezone(&chrono::Utc)))
        .map(|duration| duration.num_milliseconds().max(0))
}

fn summarize_auto_continuation_runs(
    runs: &[AgentRun],
    objective_id: &str,
) -> AutoContinuationRunSummary {
    runs.iter()
        .fold(AutoContinuationRunSummary::default(), |mut summary, run| {
            let Some(metadata) = run
                .metadata
                .as_deref()
                .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
            else {
                return summary;
            };
            let Some(managed_objective) = managed_objective_metadata(&metadata) else {
                return summary;
            };
            if string_field_from_value(managed_objective, &["objective_id", "objectiveId"])
                .as_deref()
                != Some(objective_id)
            {
                return summary;
            }
            if string_field_from_value(
                managed_objective,
                &["continuation_source", "continuationSource"],
            )
            .as_deref()
                == Some(ManagedObjectiveContinuationSource::AutoIdle.as_str())
            {
                summary.auto_turn_count += 1;
            }
            if let Some(cost) = estimated_total_cost_from_metadata(&metadata) {
                summary.estimated_total_cost += cost;
            }
            summary
        })
}

fn managed_objective_metadata(metadata: &Value) -> Option<&Value> {
    metadata
        .pointer("/request_metadata/harness/managed_objective")
        .or_else(|| metadata.pointer("/request_metadata/managed_objective"))
        .or_else(|| metadata.pointer("/harness/managed_objective"))
        .or_else(|| metadata.get("managed_objective"))
}

fn estimated_total_cost_from_metadata(metadata: &Value) -> Option<f64> {
    metadata
        .pointer("/cost_state/estimatedTotalCost")
        .or_else(|| metadata.pointer("/cost_state/estimated_total_cost"))
        .or_else(|| {
            metadata.pointer("/request_metadata/lime_runtime/cost_state/estimatedTotalCost")
        })
        .or_else(|| {
            metadata.pointer("/request_metadata/lime_runtime/cost_state/estimated_total_cost")
        })
        .and_then(Value::as_f64)
}

fn bool_field(value: Option<&Value>, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| value?.get(*key))
        .find_map(Value::as_bool)
}

fn integer_field(value: Option<&Value>, keys: &[&str]) -> Option<u32> {
    keys.iter()
        .filter_map(|key| value?.get(*key))
        .find_map(|value| {
            value
                .as_u64()
                .and_then(|number| u32::try_from(number).ok())
                .or_else(|| {
                    value
                        .as_i64()
                        .filter(|number| *number >= 0)
                        .and_then(|number| u32::try_from(number).ok())
                })
        })
}

fn number_field(value: Option<&Value>, keys: &[&str]) -> Option<f64> {
    keys.iter()
        .filter_map(|key| value?.get(*key))
        .find_map(Value::as_f64)
}

fn string_field(value: Option<&Value>, keys: &[&str]) -> Option<String> {
    let value = value?;
    string_field_from_value(value, keys)
}

fn string_field_from_value(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
#[path = "objective_continuation_tests.rs"]
mod tests;
