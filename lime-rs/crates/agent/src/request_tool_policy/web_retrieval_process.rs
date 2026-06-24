use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadItemPayload};
use std::collections::HashSet;

#[derive(Debug, Default)]
pub(crate) struct WebRetrievalProcessState {
    active_tool_ids: HashSet<String>,
    completed_tool_ids: HashSet<String>,
    pub(crate) observed_completed_count: usize,
    emitted_synthesis_status: bool,
    final_text_started: bool,
}

impl WebRetrievalProcessState {
    pub(crate) fn observe_text_delta(&mut self, text: &str) {
        if !text.trim().is_empty() {
            self.final_text_started = true;
        }
    }

    pub(crate) fn observe_tool_start(&mut self, tool_id: &str, tool_name: &str) {
        if !is_web_retrieval_tool_name(tool_name) || tool_id.trim().is_empty() {
            return;
        }
        self.active_tool_ids.insert(tool_id.to_string());
    }

    pub(crate) fn observe_tool_end(&mut self, tool_id: &str) {
        if self.active_tool_ids.remove(tool_id)
            && self.completed_tool_ids.insert(tool_id.to_string())
        {
            self.observed_completed_count += 1;
        }
    }

    pub(crate) fn observe_tool_item(&mut self, item: &AgentThreadItem, completed: bool) {
        let AgentThreadItemPayload::ToolCall { tool_name, .. } = &item.payload else {
            return;
        };
        if !is_web_retrieval_tool_name(tool_name) || item.id.trim().is_empty() {
            return;
        }

        if completed {
            self.active_tool_ids.remove(&item.id);
            if self.completed_tool_ids.insert(item.id.clone()) {
                self.observed_completed_count += 1;
            }
        } else {
            self.active_tool_ids.insert(item.id.clone());
        }
    }

    pub(crate) fn should_emit_synthesis_status(&self) -> bool {
        self.observed_completed_count > 0
            && self.active_tool_ids.is_empty()
            && !self.emitted_synthesis_status
            && !self.final_text_started
    }

    pub(crate) fn mark_synthesis_status_emitted(&mut self) {
        self.emitted_synthesis_status = true;
    }
}

fn is_web_retrieval_tool_name(tool_name: &str) -> bool {
    let normalized = normalize_tool_name(tool_name);
    normalized.contains("websearch") || normalized.contains("webfetch")
}

fn normalize_tool_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect::<String>()
}
