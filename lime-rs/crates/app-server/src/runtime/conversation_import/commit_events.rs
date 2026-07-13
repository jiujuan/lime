use super::codex::events::{
    ImportedRuntimeEvent, ImportedToolDraft, ImportedToolPhase, ImportedToolSource,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

#[cfg(test)]
mod tests;
mod tool_lowering;

pub(super) use tool_lowering::lower_imported_runtime_events_for_commit;

const DEFAULT_MATERIALIZED_COMMAND_TOOL_CALLS_PER_THREAD: usize = 80;
const DEFAULT_MATERIALIZED_OTHER_TOOL_CALLS_PER_THREAD: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ImportedRuntimeEventProjectionSummary {
    pub(super) source_runtime_events: usize,
    pub(super) materialized_runtime_events: usize,
    pub(super) sidecar_runtime_events: usize,
    pub(super) materialized_command_tool_calls: usize,
    pub(super) materialized_other_tool_calls: usize,
    pub(super) skipped_command_tool_calls: usize,
    pub(super) skipped_other_tool_calls: usize,
    pub(super) command_tool_call_limit: usize,
    pub(super) other_tool_call_limit: usize,
}

impl Default for ImportedRuntimeEventProjectionSummary {
    fn default() -> Self {
        Self {
            source_runtime_events: 0,
            materialized_runtime_events: 0,
            sidecar_runtime_events: 0,
            materialized_command_tool_calls: 0,
            materialized_other_tool_calls: 0,
            skipped_command_tool_calls: 0,
            skipped_other_tool_calls: 0,
            command_tool_call_limit: DEFAULT_MATERIALIZED_COMMAND_TOOL_CALLS_PER_THREAD,
            other_tool_call_limit: DEFAULT_MATERIALIZED_OTHER_TOOL_CALLS_PER_THREAD,
        }
    }
}

impl ImportedRuntimeEventProjectionSummary {
    pub(super) fn merge(&mut self, turn: &ImportedRuntimeEventProjectionSummary) {
        self.source_runtime_events += turn.source_runtime_events;
        self.materialized_runtime_events += turn.materialized_runtime_events;
        self.sidecar_runtime_events += turn.sidecar_runtime_events;
        self.materialized_command_tool_calls += turn.materialized_command_tool_calls;
        self.materialized_other_tool_calls += turn.materialized_other_tool_calls;
        self.skipped_command_tool_calls += turn.skipped_command_tool_calls;
        self.skipped_other_tool_calls += turn.skipped_other_tool_calls;
    }
}

pub(super) fn materialize_imported_runtime_events_for_default_projection(
    events: &[ImportedRuntimeEvent],
    selector: &mut ImportedRuntimeEventProjectionSelector,
) -> (
    Vec<ImportedRuntimeEvent>,
    ImportedRuntimeEventProjectionSummary,
) {
    let before = selector.counts();
    let source_runtime_events = events.len();
    let events = events
        .iter()
        .filter(|event| selector.should_materialize(event))
        .cloned()
        .collect::<Vec<_>>();
    let after = selector.counts();
    let mut summary = ImportedRuntimeEventProjectionSummary::default();
    summary.command_tool_call_limit = selector.command_tool_call_limit;
    summary.other_tool_call_limit = selector.other_tool_call_limit;
    summary.materialized_command_tool_calls = after
        .materialized_command_tool_calls
        .saturating_sub(before.materialized_command_tool_calls);
    summary.materialized_other_tool_calls = after
        .materialized_other_tool_calls
        .saturating_sub(before.materialized_other_tool_calls);
    summary.skipped_command_tool_calls = after
        .skipped_command_tool_calls
        .saturating_sub(before.skipped_command_tool_calls);
    summary.skipped_other_tool_calls = after
        .skipped_other_tool_calls
        .saturating_sub(before.skipped_other_tool_calls);
    summary.source_runtime_events = source_runtime_events;
    summary.materialized_runtime_events = events.len();
    summary.sidecar_runtime_events = source_runtime_events.saturating_sub(events.len());
    (events, summary)
}

#[derive(Debug, Clone, Copy, Default)]
struct ImportedRuntimeEventProjectionSelectorCounts {
    materialized_command_tool_calls: usize,
    materialized_other_tool_calls: usize,
    skipped_command_tool_calls: usize,
    skipped_other_tool_calls: usize,
}

pub(super) struct ImportedRuntimeEventProjectionSelector {
    command_tool_call_limit: usize,
    other_tool_call_limit: usize,
    materialized_command_tool_calls: usize,
    materialized_other_tool_calls: usize,
    skipped_command_tool_calls: usize,
    skipped_other_tool_calls: usize,
    materialized_tool_call_ids: BTreeSet<String>,
    skipped_tool_call_ids: BTreeSet<String>,
    materialized_patch_ids: BTreeSet<String>,
    materialized_action_ids: BTreeSet<String>,
}

impl ImportedRuntimeEventProjectionSelector {
    pub(super) fn new(command_tool_call_limit: usize, other_tool_call_limit: usize) -> Self {
        Self {
            command_tool_call_limit,
            other_tool_call_limit,
            materialized_command_tool_calls: 0,
            materialized_other_tool_calls: 0,
            skipped_command_tool_calls: 0,
            skipped_other_tool_calls: 0,
            materialized_tool_call_ids: BTreeSet::new(),
            skipped_tool_call_ids: BTreeSet::new(),
            materialized_patch_ids: BTreeSet::new(),
            materialized_action_ids: BTreeSet::new(),
        }
    }

    fn counts(&self) -> ImportedRuntimeEventProjectionSelectorCounts {
        ImportedRuntimeEventProjectionSelectorCounts {
            materialized_command_tool_calls: self.materialized_command_tool_calls,
            materialized_other_tool_calls: self.materialized_other_tool_calls,
            skipped_command_tool_calls: self.skipped_command_tool_calls,
            skipped_other_tool_calls: self.skipped_other_tool_calls,
        }
    }

    fn should_materialize(&mut self, event: &ImportedRuntimeEvent) -> bool {
        if let Some(tool) = event.tool_draft() {
            return self.should_materialize_tool_draft(tool);
        }
        match event.event_type() {
            "command.started" | "command.output" | "command.exited" => {
                self.should_materialize_command_event(event)
            }
            "patch.started" | "patch.applied" | "patch.failed" => {
                self.should_materialize_patch_event(event)
            }
            "action.required" | "action.resolved" | "action.cancelled" | "action.canceled"
            | "action.expired" => self.should_materialize_action_event(event),
            _ => true,
        }
    }

    fn should_materialize_tool_draft(&mut self, tool: &ImportedToolDraft) -> bool {
        let tool_call_id = tool
            .call_id
            .clone()
            .expect("normalized imported tool draft must have call id");
        if self.materialized_tool_call_ids.contains(&tool_call_id) {
            return true;
        }
        if self.skipped_tool_call_ids.contains(&tool_call_id) {
            return false;
        }

        let tool_name = tool.name.as_deref();
        if tool_name.is_some_and(is_web_search_tool_name) {
            self.materialized_tool_call_ids.insert(tool_call_id);
            return true;
        }

        let is_command = tool_name.is_some_and(is_command_tool_name);
        if is_command {
            if self.materialized_command_tool_calls < self.command_tool_call_limit {
                self.materialized_command_tool_calls += 1;
                self.materialized_tool_call_ids.insert(tool_call_id);
                true
            } else {
                self.skipped_command_tool_calls += 1;
                self.skipped_tool_call_ids.insert(tool_call_id);
                false
            }
        } else if self.materialized_other_tool_calls < self.other_tool_call_limit {
            self.materialized_other_tool_calls += 1;
            self.materialized_tool_call_ids.insert(tool_call_id);
            true
        } else {
            self.skipped_other_tool_calls += 1;
            self.skipped_tool_call_ids.insert(tool_call_id);
            false
        }
    }

    fn should_materialize_command_event(&self, event: &ImportedRuntimeEvent) -> bool {
        match event.payload().and_then(command_payload_id) {
            Some(command_id) => self.materialized_tool_call_ids.contains(&command_id),
            None => true,
        }
    }

    fn should_materialize_patch_event(&mut self, event: &ImportedRuntimeEvent) -> bool {
        let Some(payload) = event.payload() else {
            return false;
        };
        let Some(patch_id) = string_payload(payload, &["patchId", "patch_id"]) else {
            return true;
        };
        if self.materialized_patch_ids.contains(&patch_id) {
            return true;
        }
        if string_payload(payload, &["toolCallId", "tool_call_id"])
            .is_some_and(|tool_call_id| self.skipped_tool_call_ids.contains(&tool_call_id))
        {
            return false;
        }
        self.materialized_patch_ids.insert(patch_id);
        true
    }

    fn should_materialize_action_event(&mut self, event: &ImportedRuntimeEvent) -> bool {
        let Some(payload) = event.payload() else {
            return false;
        };
        let Some(action_id) = string_payload(
            payload,
            &["actionId", "action_id", "requestId", "request_id"],
        ) else {
            return true;
        };
        if self.materialized_action_ids.contains(&action_id) {
            return true;
        }
        if self.skipped_tool_call_ids.contains(&action_id) {
            return false;
        }
        self.materialized_action_ids.insert(action_id);
        true
    }
}

pub(super) struct ImportedRuntimeEventNormalizer {
    active_tools: BTreeMap<String, ImportedToolDraft>,
    completed_tools: BTreeSet<String>,
    active_patches: BTreeSet<String>,
    active_actions: BTreeSet<String>,
    active_commands: BTreeSet<String>,
    synthetic_tool_call_sequence: usize,
    pending_terminal_event: Option<ImportedRuntimeEvent>,
    saw_terminal_event: bool,
}

impl ImportedRuntimeEventNormalizer {
    pub(super) fn new() -> Self {
        Self {
            active_tools: BTreeMap::new(),
            completed_tools: BTreeSet::new(),
            active_patches: BTreeSet::new(),
            active_actions: BTreeSet::new(),
            active_commands: BTreeSet::new(),
            synthetic_tool_call_sequence: 0,
            pending_terminal_event: None,
            saw_terminal_event: false,
        }
    }

    pub(super) fn push(&mut self, event: ImportedRuntimeEvent) -> Vec<ImportedRuntimeEvent> {
        if let Some(tool) = event.tool_draft().cloned() {
            return self.push_tool(tool);
        }
        let mut normalized = Vec::new();
        match event.event_type() {
            "patch.started" => {
                if let Some(patch_id) = event
                    .payload()
                    .and_then(|payload| string_payload(payload, &["patchId", "patch_id"]))
                {
                    self.active_patches.insert(patch_id);
                }
                normalized.push(event);
            }
            "patch.applied" | "patch.failed" => {
                let patch_id = event
                    .payload()
                    .and_then(|payload| string_payload(payload, &["patchId", "patch_id"]));
                if let Some(patch_id) = patch_id.as_deref() {
                    if !self.active_patches.remove(patch_id) {
                        normalized.push(imported_patch_start_from_terminal(patch_id, &event));
                    }
                }
                normalized.push(event);
            }
            "command.started" => {
                if let Some(command_id) = event
                    .payload()
                    .and_then(|payload| string_payload(payload, &["commandId"]))
                {
                    self.active_commands.insert(command_id);
                }
                normalized.push(event);
            }
            "command.output" => normalized.push(event),
            "command.exited" => {
                if let Some(command_id) = event
                    .payload()
                    .and_then(|payload| string_payload(payload, &["commandId"]))
                {
                    self.active_commands.remove(&command_id);
                }
                normalized.push(event);
            }
            "action.required" => {
                let action_id = event.payload().and_then(|payload| {
                    string_payload(payload, &["actionId", "action_id", "requestId"])
                });
                if let Some(action_id) = action_id.as_deref() {
                    self.active_actions.insert(action_id.to_string());
                }
                normalized.push(event);
                if let Some(action_id) = action_id {
                    normalized.push(imported_action_resolved(&action_id));
                    self.active_actions.remove(&action_id);
                }
            }
            "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired" => {
                if let Some(action_id) = event.payload().and_then(|payload| {
                    string_payload(payload, &["actionId", "action_id", "requestId"])
                }) {
                    self.active_actions.remove(&action_id);
                }
                normalized.push(event);
            }
            "turn.completed" | "turn.failed" | "turn.canceled" => {
                self.saw_terminal_event = true;
                if self.pending_terminal_event.is_none()
                    || event.event_type() == "turn.failed"
                    || event.event_type() == "turn.canceled"
                {
                    self.pending_terminal_event = Some(event);
                }
            }
            _ => normalized.push(event),
        }
        normalized
    }

    fn push_tool(&mut self, mut tool: ImportedToolDraft) -> Vec<ImportedRuntimeEvent> {
        let call_id = self.ensure_imported_tool_call_id(&mut tool);
        let mut normalized = Vec::new();
        match tool.phase {
            ImportedToolPhase::Started => {
                if self.completed_tools.contains(&call_id) {
                    return normalized;
                }
                if let Some(active) = self.active_tools.get_mut(&call_id) {
                    if active.name.is_none() {
                        active.name = tool.name;
                    }
                    if active.arguments.is_none() {
                        active.arguments = tool.arguments;
                    }
                    return normalized;
                }
                self.active_tools.insert(call_id, tool.clone());
                normalized.push(ImportedRuntimeEvent::Tool(tool));
            }
            ImportedToolPhase::Completed | ImportedToolPhase::Failed => {
                if !self.completed_tools.insert(call_id.clone()) {
                    return normalized;
                }
                if let Some(start) = self.active_tools.remove(&call_id) {
                    if tool.name.is_none() {
                        tool.name = start.name.clone();
                    }
                    if tool.arguments.is_none() {
                        tool.arguments = start.arguments.clone();
                    }
                } else {
                    normalized.push(ImportedRuntimeEvent::Tool(
                        imported_tool_start_from_terminal(&call_id, &tool),
                    ));
                }
                if self.active_commands.remove(&call_id) {
                    normalized.push(imported_command_output_from_tool_terminal(&call_id, &tool));
                    normalized.push(imported_command_exited_from_tool_terminal(&call_id, &tool));
                }
                normalized.push(ImportedRuntimeEvent::Tool(tool));
            }
        }
        normalized
    }

    fn ensure_imported_tool_call_id(&mut self, tool: &mut ImportedToolDraft) -> String {
        if let Some(call_id) = tool
            .call_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            return call_id.to_string();
        }
        self.synthetic_tool_call_sequence += 1;
        let source_sequence = tool
            .source
            .source_provenance
            .as_ref()
            .and_then(|provenance| provenance.get("sourceEventSeq"))
            .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()));
        let call_id = source_sequence
            .map(|sequence| format!("imported-tool-{sequence}"))
            .unwrap_or_else(|| {
                format!("imported-tool-local-{}", self.synthetic_tool_call_sequence)
            });
        tool.call_id = Some(call_id.clone());
        tool.source.synthetic_id = true;
        call_id
    }

    pub(super) fn finish(&mut self) -> Vec<ImportedRuntimeEvent> {
        let mut normalized = Vec::new();
        close_active_imported_lifecycles(
            &mut normalized,
            &mut self.active_actions,
            &mut self.active_commands,
            &mut self.active_patches,
            &mut self.active_tools,
        );
        if let Some(event) = self.pending_terminal_event.take() {
            normalized.push(event);
        }
        normalized
    }

    pub(super) fn has_terminal_event(&self) -> bool {
        self.saw_terminal_event
    }
}

impl Default for ImportedRuntimeEventProjectionSelector {
    fn default() -> Self {
        Self::new(
            DEFAULT_MATERIALIZED_COMMAND_TOOL_CALLS_PER_THREAD,
            DEFAULT_MATERIALIZED_OTHER_TOOL_CALLS_PER_THREAD,
        )
    }
}

pub(super) fn enrich_imported_runtime_event_payload(mut payload: Value) -> Value {
    if let Value::Object(ref mut object) = payload {
        object
            .entry("imported".to_string())
            .or_insert_with(|| json!(true));
        object
            .entry("sourceClient".to_string())
            .or_insert_with(|| json!("codex"));
    }
    payload
}

fn close_active_imported_lifecycles(
    normalized: &mut Vec<ImportedRuntimeEvent>,
    active_actions: &mut BTreeSet<String>,
    active_commands: &mut BTreeSet<String>,
    active_patches: &mut BTreeSet<String>,
    active_tools: &mut BTreeMap<String, ImportedToolDraft>,
) {
    let actions = std::mem::take(active_actions);
    for action_id in actions {
        normalized.push(imported_action_resolved(&action_id));
    }
    let commands = std::mem::take(active_commands);
    for command_id in commands {
        normalized.push(ImportedRuntimeEvent::new(
            "command.exited",
            json!({
                "commandId": command_id,
                "exitCode": 0,
                "status": "completed",
                "result": "imported_incomplete",
                "failureCategory": "incomplete_import",
                "sourceClient": "codex",
                "sourceEventType": "synthetic_command_exited",
                "importedSynthetic": true,
                "importedIncomplete": true,
            }),
        ));
    }
    let patches = std::mem::take(active_patches);
    for patch_id in patches {
        normalized.push(ImportedRuntimeEvent::new(
            "patch.applied",
            json!({
                "patchId": patch_id,
                "status": "completed",
                "success": true,
                "failureCategory": "incomplete_import",
                "sourceClient": "codex",
                "sourceEventType": "synthetic_patch_applied",
                "importedSynthetic": true,
                "importedIncomplete": true,
            }),
        ));
    }
    let tools = std::mem::take(active_tools);
    for (_, start) in tools {
        let mut terminal = start.clone();
        terminal.phase = ImportedToolPhase::Completed;
        terminal.output = None;
        terminal.source.source_client = Some("codex".to_string());
        terminal.source.source_event_type = Some("synthetic_tool_result".to_string());
        terminal.source.success = Some(true);
        terminal.source.failure_category = Some("incomplete_import".to_string());
        terminal.source.synthetic = true;
        terminal.source.incomplete = true;
        normalized.push(ImportedRuntimeEvent::Tool(terminal));
    }
}

fn imported_tool_start_from_terminal(
    tool_call_id: &str,
    terminal: &ImportedToolDraft,
) -> ImportedToolDraft {
    ImportedToolDraft {
        phase: ImportedToolPhase::Started,
        call_id: Some(tool_call_id.to_string()),
        name: terminal.name.clone(),
        arguments: terminal.arguments.clone(),
        output: None,
        source: ImportedToolSource {
            source_client: Some("codex".to_string()),
            source_event_type: Some("synthetic_tool_started".to_string()),
            synthetic: true,
            action: terminal.source.action.clone(),
            query: terminal.source.query.clone(),
            ..ImportedToolSource::default()
        },
    }
}

fn imported_patch_start_from_terminal(
    patch_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    let payload = terminal
        .payload()
        .expect("patch terminal must be a runtime event");
    ImportedRuntimeEvent::new(
        "patch.started",
        json!({
            "patchId": patch_id,
            "toolCallId": string_payload(payload, &["toolCallId", "tool_call_id"]),
            "paths": payload.get("paths").cloned(),
            "changedFiles": payload.get("changedFiles").cloned(),
            "sourceClient": "codex",
            "sourceEventType": "synthetic_patch_started",
            "importedSynthetic": true,
        }),
    )
}

fn imported_command_output_from_tool_terminal(
    command_id: &str,
    terminal: &ImportedToolDraft,
) -> ImportedRuntimeEvent {
    let output = tool_output_text(terminal);
    ImportedRuntimeEvent::new(
        "command.output",
        json!({
            "commandId": command_id,
            "toolCallId": command_id,
            "outputRef": format!("output://codex-import/{command_id}"),
            "refIds": [format!("output://codex-import/{command_id}")],
            "outputPreview": output,
            "summary": output,
            "sourceClient": "codex",
            "sourceEventType": "synthetic_command_output",
            "importedSynthetic": true,
        }),
    )
}

fn imported_command_exited_from_tool_terminal(
    command_id: &str,
    terminal: &ImportedToolDraft,
) -> ImportedRuntimeEvent {
    let output = tool_output_text(terminal).unwrap_or_default();
    let exit_code = parse_exit_code(&output).unwrap_or_else(|| {
        if terminal.phase == ImportedToolPhase::Failed {
            1
        } else {
            0
        }
    });
    ImportedRuntimeEvent::new(
        "command.exited",
        json!({
            "commandId": command_id,
            "toolCallId": command_id,
            "exitCode": exit_code,
            "result": if exit_code == 0 { "passed" } else { "failed" },
            "sourceClient": "codex",
            "sourceEventType": "synthetic_command_exited",
            "importedSynthetic": true,
        }),
    )
}

fn tool_output_text(tool: &ImportedToolDraft) -> Option<String> {
    tool.output
        .as_ref()
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            tool.output
                .as_ref()
                .and_then(|value| value.get("text"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| tool.source.output_preview.clone())
}

fn imported_action_resolved(action_id: &str) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "action.resolved",
        json!({
            "actionId": action_id,
            "requestId": action_id,
            "actionType": "tool_confirmation",
            "decision": "imported_read_only",
            "sourceClient": "codex",
            "sourceEventType": "synthetic_action_resolved",
            "importedSynthetic": true,
            "importedReadOnly": true,
        }),
    )
}

fn string_payload(payload: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn command_payload_id(payload: &Value) -> Option<String> {
    string_payload(
        payload,
        &[
            "commandId",
            "command_id",
            "toolCallId",
            "tool_call_id",
            "id",
        ],
    )
}

fn is_command_tool_name(value: &str) -> bool {
    matches!(value, "exec_command" | "shell" | "bash")
}

fn is_web_search_tool_name(value: &str) -> bool {
    matches!(
        value.trim(),
        "web_search" | "webSearch" | "search_query" | "WebSearch"
    )
}

fn parse_exit_code(output: &str) -> Option<i64> {
    output.lines().find_map(|line| {
        line.strip_prefix("Exit code:")
            .and_then(|value| value.trim().parse::<i64>().ok())
    })
}
