use super::policy_config::{is_same_tool, matches_tool_list};
use super::RequestToolPolicy;
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadItemPayload};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ToolAttemptRecord {
    pub(crate) tool_id: String,
    pub(crate) tool_name: String,
    pub(crate) success: Option<bool>,
    pub(crate) error: Option<String>,
    pub(crate) observed_item_lifecycle: bool,
}

#[derive(Debug, Default)]
pub struct WebSearchExecutionTracker {
    ordered_tool_ids: Vec<String>,
    attempts_by_id: HashMap<String, ToolAttemptRecord>,
}

impl WebSearchExecutionTracker {
    pub fn record_tool_start(
        &mut self,
        policy: &RequestToolPolicy,
        tool_id: &str,
        tool_name: &str,
    ) {
        if !policy.effective_web_search || tool_id.trim().is_empty() || tool_name.trim().is_empty()
        {
            return;
        }

        if !self.attempts_by_id.contains_key(tool_id) {
            self.ordered_tool_ids.push(tool_id.to_string());
            self.attempts_by_id.insert(
                tool_id.to_string(),
                ToolAttemptRecord {
                    tool_id: tool_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: None,
                    error: None,
                    observed_item_lifecycle: false,
                },
            );
        }
    }

    pub fn record_tool_end(
        &mut self,
        policy: &RequestToolPolicy,
        tool_id: &str,
        success: bool,
        error: Option<&str>,
    ) {
        if !policy.effective_web_search || tool_id.trim().is_empty() {
            return;
        }
        if let Some(record) = self.attempts_by_id.get_mut(tool_id) {
            if record.observed_item_lifecycle && record.success.is_some() {
                return;
            }
            record.success = Some(success);
            record.error = error
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string());
        }
    }

    pub fn record_tool_item(
        &mut self,
        policy: &RequestToolPolicy,
        item: &AgentThreadItem,
        completed: bool,
    ) {
        let AgentThreadItemPayload::ToolCall {
            tool_name,
            success,
            error,
            ..
        } = &item.payload
        else {
            return;
        };
        if !policy.effective_web_search || item.id.trim().is_empty() || tool_name.trim().is_empty()
        {
            return;
        }

        if !self.attempts_by_id.contains_key(&item.id) {
            self.ordered_tool_ids.push(item.id.clone());
            self.attempts_by_id.insert(
                item.id.clone(),
                ToolAttemptRecord {
                    tool_id: item.id.clone(),
                    tool_name: tool_name.clone(),
                    success: None,
                    error: None,
                    observed_item_lifecycle: true,
                },
            );
        }

        if let Some(record) = self.attempts_by_id.get_mut(&item.id) {
            record.observed_item_lifecycle = true;
            record.tool_name = tool_name.clone();
            if completed {
                record.success = Some(success.unwrap_or(true));
                record.error = error
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| value.to_string());
            }
        }
    }

    pub fn validate_web_search_requirement(
        &self,
        policy: &RequestToolPolicy,
    ) -> Result<(), String> {
        if !policy.requires_web_search() {
            return Ok(());
        }

        let disallowed_attempts: Vec<&ToolAttemptRecord> = self
            .ordered_tool_ids
            .iter()
            .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
            .filter(|record| matches_tool_list(&record.tool_name, &policy.disallowed_tools))
            .collect();
        if !disallowed_attempts.is_empty() {
            let disallowed_names = disallowed_attempts
                .iter()
                .map(|record| record.tool_name.clone())
                .collect::<Vec<_>>()
                .join(", ");
            return Err(format!(
                "联网搜索策略阻止了禁止工具调用: {}。\n尝试记录: {}",
                disallowed_names,
                self.format_attempts()
            ));
        }

        let all_attempts = self
            .ordered_tool_ids
            .iter()
            .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
            .collect::<Vec<_>>();

        let missing_required_tools = policy
            .required_tools
            .iter()
            .filter(|required_tool| {
                !all_attempts
                    .iter()
                    .any(|record| is_same_tool(&record.tool_name, required_tool))
            })
            .cloned()
            .collect::<Vec<_>>();

        if !missing_required_tools.is_empty() {
            return Err(format!(
                "联网搜索已开启，但未检测到必需工具调用。必须先调用 {} 至少一次后再给出最终答复。\n尝试记录: {}",
                missing_required_tools.join(", "),
                self.format_attempts()
            ));
        }

        let failed_required_tools = policy
            .required_tools
            .iter()
            .filter(|required_tool| {
                !all_attempts.iter().any(|record| {
                    is_same_tool(&record.tool_name, required_tool)
                        && record.success.unwrap_or(false)
                })
            })
            .cloned()
            .collect::<Vec<_>>();

        if failed_required_tools.is_empty() {
            return Ok(());
        }

        if all_attempts
            .iter()
            .filter(|record| policy.matches_any_required_tool(&record.tool_name))
            .any(|record| record.success.is_none())
        {
            return Err(format!(
                "联网搜索已开启，但仍有必需工具未完成。未完成工具: {}。\n尝试记录: {}",
                failed_required_tools.join(", "),
                self.format_attempts()
            ));
        }

        Err(format!(
            "联网搜索已开启，但必需工具调用失败，无法给出符合约束的最终答复。失败工具: {}。\n失败原因与尝试记录: {}",
            failed_required_tools.join(", "),
            self.format_attempts()
        ))
    }

    pub fn format_attempts(&self) -> String {
        if self.ordered_tool_ids.is_empty() {
            return "无工具调用".to_string();
        }

        self.ordered_tool_ids
            .iter()
            .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
            .map(|record| {
                let status = match record.success {
                    Some(true) => "success".to_string(),
                    Some(false) => {
                        format!("failed({})", record.error.as_deref().unwrap_or("unknown"))
                    }
                    None => "pending".to_string(),
                };
                format!("{}#{}:{}", record.tool_name, record.tool_id, status)
            })
            .collect::<Vec<_>>()
            .join("; ")
    }

    pub(crate) fn has_attempts(&self) -> bool {
        !self.ordered_tool_ids.is_empty()
    }

    pub(crate) fn completed_attempt_count_for_policy(&self, policy: &RequestToolPolicy) -> usize {
        self.ordered_tool_ids
            .iter()
            .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
            .filter(|record| {
                policy.matches_any_allowed_tool(&record.tool_name) && record.success.is_some()
            })
            .count()
    }

    pub(crate) fn successful_attempt_count_for_policy(&self, policy: &RequestToolPolicy) -> usize {
        self.ordered_tool_ids
            .iter()
            .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
            .filter(|record| {
                policy.matches_any_allowed_tool(&record.tool_name)
                    && record.success.unwrap_or(false)
            })
            .count()
    }

    pub(crate) fn has_successful_required_attempt(&self, policy: &RequestToolPolicy) -> bool {
        policy.required_tools.iter().all(|required_tool| {
            self.ordered_tool_ids
                .iter()
                .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
                .any(|record| {
                    is_same_tool(&record.tool_name, required_tool)
                        && record.success.unwrap_or(false)
                })
        })
    }
}
