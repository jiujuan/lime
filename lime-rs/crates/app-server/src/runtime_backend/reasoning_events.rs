use crate::RuntimeEvent;
use serde_json::json;

const DEFAULT_REASONING_ID: &str = "runtime-thinking";

#[derive(Debug, Clone)]
pub struct ReasoningEventState {
    reasoning_id: String,
    started: bool,
    ended: bool,
    text: String,
}

impl Default for ReasoningEventState {
    fn default() -> Self {
        Self {
            reasoning_id: DEFAULT_REASONING_ID.to_string(),
            started: false,
            ended: false,
            text: String::new(),
        }
    }
}

#[cfg(test)]
pub fn reasoning_delta_event(
    reasoning_id: impl Into<String>,
    delta: impl Into<String>,
) -> RuntimeEvent {
    RuntimeEvent::new(
        "reasoning.delta",
        json!({
            "reasoningId": reasoning_id.into(),
            "delta": delta.into(),
        }),
    )
}

pub fn reasoning_started_event(reasoning_id: impl Into<String>) -> RuntimeEvent {
    RuntimeEvent::new(
        "reasoning.started",
        json!({
            "reasoningId": reasoning_id.into(),
            "status": "in_progress",
        }),
    )
}

pub fn reasoning_final_event(
    reasoning_id: impl Into<String>,
    text: impl Into<String>,
) -> RuntimeEvent {
    RuntimeEvent::new(
        "reasoning.final",
        json!({
            "reasoningId": reasoning_id.into(),
            "text": text.into(),
        }),
    )
}

pub fn reasoning_ended_event(
    reasoning_id: impl Into<String>,
    status: impl Into<String>,
) -> RuntimeEvent {
    RuntimeEvent::new(
        "reasoning.ended",
        json!({
            "reasoningId": reasoning_id.into(),
            "status": status.into(),
        }),
    )
}

impl ReasoningEventState {
    pub fn observe_delta(&mut self, delta: &str) -> Vec<RuntimeEvent> {
        if delta.trim().is_empty() {
            return Vec::new();
        }

        self.text = append_text_with_overlap(&self.text, delta);
        if self.started {
            return Vec::new();
        }

        self.started = true;
        vec![reasoning_started_event(self.reasoning_id.clone())]
    }

    pub fn finish(&mut self, status: &str) -> Vec<RuntimeEvent> {
        if !self.started || self.ended {
            return Vec::new();
        }
        self.ended = true;

        let mut events = Vec::new();
        if !self.text.trim().is_empty() {
            events.push(reasoning_final_event(
                self.reasoning_id.clone(),
                self.text.clone(),
            ));
        }
        events.push(reasoning_ended_event(self.reasoning_id.clone(), status));
        events
    }
}

fn append_text_with_overlap(base: &str, delta: &str) -> String {
    if base.is_empty() {
        return delta.to_string();
    }
    if delta.is_empty() || base.ends_with(delta) {
        return base.to_string();
    }
    if delta.starts_with(base) {
        return delta.to_string();
    }

    let max_overlap = base.chars().count().min(delta.chars().count());
    for overlap in (1..=max_overlap).rev() {
        let prefix = delta.chars().take(overlap).collect::<String>();
        if base.ends_with(&prefix) {
            let suffix = delta.chars().skip(overlap).collect::<String>();
            return format!("{base}{suffix}");
        }
    }
    format!("{base}{delta}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emits_start_once_and_final_end_on_finish() {
        let mut state = ReasoningEventState::default();

        let first = state.observe_delta("先理解");
        let second = state.observe_delta("理解目标");
        let finished = state.finish("completed");

        assert_eq!(first.len(), 1);
        assert_eq!(first[0].event_type, "reasoning.started");
        assert!(second.is_empty());
        assert_eq!(finished.len(), 2);
        assert_eq!(finished[0].event_type, "reasoning.final");
        assert_eq!(finished[0].payload["text"], "先理解目标");
        assert_eq!(finished[1].event_type, "reasoning.ended");
        assert_eq!(finished[1].payload["status"], "completed");
    }

    #[test]
    fn empty_delta_does_not_start_reasoning() {
        let mut state = ReasoningEventState::default();

        assert!(state.observe_delta(" ").is_empty());
        assert!(state.finish("completed").is_empty());
    }

    #[test]
    fn builds_reasoning_delta_event() {
        let event = reasoning_delta_event("r1", "继续分析");

        assert_eq!(event.event_type, "reasoning.delta");
        assert_eq!(event.payload["reasoningId"], "r1");
        assert_eq!(event.payload["delta"], "继续分析");
    }

    #[test]
    fn builds_reasoning_final_skeleton_event() {
        let event = reasoning_final_event("r1", "先理解目标");

        assert_eq!(event.event_type, "reasoning.final");
        assert_eq!(event.payload["reasoningId"], "r1");
        assert_eq!(event.payload["text"], "先理解目标");
    }
}
