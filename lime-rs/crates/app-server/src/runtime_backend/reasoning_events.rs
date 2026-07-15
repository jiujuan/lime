use crate::RuntimeEvent;
use serde_json::json;
use std::collections::HashMap;

#[derive(Debug, Default)]
pub struct ReasoningEventState {
    items: HashMap<String, ReasoningItemState>,
    item_order: Vec<String>,
}

#[derive(Debug, Default)]
struct ReasoningItemState {
    started: bool,
    ended: bool,
    text: String,
}

#[cfg(test)]
pub fn reasoning_delta_event(
    reasoning_id: impl Into<String>,
    delta: impl Into<String>,
) -> RuntimeEvent {
    RuntimeEvent::new(
        "reasoning.delta",
        json!({
            "itemId": reasoning_id.into(),
            "delta": delta.into(),
        }),
    )
}

pub fn reasoning_started_event(reasoning_id: impl Into<String>) -> RuntimeEvent {
    let reasoning_id = reasoning_id.into();
    RuntimeEvent::new(
        "reasoning.started",
        json!({
            "itemId": reasoning_id.clone(),
            "reasoningId": reasoning_id,
            "status": "in_progress",
        }),
    )
}

pub fn reasoning_final_event(
    reasoning_id: impl Into<String>,
    text: impl Into<String>,
) -> RuntimeEvent {
    let reasoning_id = reasoning_id.into();
    RuntimeEvent::new(
        "reasoning.final",
        json!({
            "itemId": reasoning_id.clone(),
            "reasoningId": reasoning_id,
            "text": text.into(),
        }),
    )
}

pub fn reasoning_ended_event(
    reasoning_id: impl Into<String>,
    status: impl Into<String>,
) -> RuntimeEvent {
    let reasoning_id = reasoning_id.into();
    RuntimeEvent::new(
        "reasoning.ended",
        json!({
            "itemId": reasoning_id.clone(),
            "reasoningId": reasoning_id,
            "status": status.into(),
        }),
    )
}

impl ReasoningEventState {
    pub fn start(&mut self, item_id: &str) -> Result<(), String> {
        match self.items.get(item_id) {
            Some(item) if item.ended => Err(format!(
                "Reasoning Item {item_id} started after it already ended"
            )),
            Some(_) => Ok(()),
            None => {
                self.item_order.push(item_id.to_string());
                self.items
                    .insert(item_id.to_string(), ReasoningItemState::default());
                Ok(())
            }
        }
    }

    pub fn observe_delta(
        &mut self,
        item_id: &str,
        delta: &str,
    ) -> Result<Vec<RuntimeEvent>, String> {
        if delta.trim().is_empty() {
            return Ok(Vec::new());
        }
        self.start(item_id)?;
        let item = self
            .items
            .get_mut(item_id)
            .expect("reasoning item was inserted above");
        if item.ended {
            return Err(format!(
                "Reasoning Item {item_id} received a delta after completion"
            ));
        }
        item.text = append_text_with_overlap(&item.text, delta);
        if item.started {
            return Ok(Vec::new());
        }
        item.started = true;
        Ok(vec![reasoning_started_event(item_id)])
    }

    pub fn end(&mut self, item_id: &str, status: &str) -> Result<Vec<RuntimeEvent>, String> {
        self.start(item_id)?;
        let item = self
            .items
            .get_mut(item_id)
            .expect("reasoning item was inserted above");
        if item.ended {
            return Err(format!("Reasoning Item {item_id} ended more than once"));
        }
        item.ended = true;
        if !item.started {
            return Ok(Vec::new());
        }
        let mut events = Vec::new();
        if !item.text.trim().is_empty() {
            events.push(reasoning_final_event(item_id, item.text.clone()));
        }
        events.push(reasoning_ended_event(item_id, status));
        Ok(events)
    }

    pub fn finish(&mut self, status: &str) -> Result<Vec<RuntimeEvent>, String> {
        let active_item_ids = self
            .item_order
            .iter()
            .filter(|item_id| self.items.get(*item_id).is_some_and(|item| !item.ended))
            .cloned()
            .collect::<Vec<_>>();
        let mut events = Vec::new();
        for item_id in active_item_ids {
            events.extend(self.end(&item_id, status)?);
        }
        Ok(events)
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

        let first = state
            .observe_delta("reasoning-1", "先理解")
            .expect("first delta");
        let second = state
            .observe_delta("reasoning-1", "理解目标")
            .expect("second delta");
        let finished = state.finish("completed").expect("finish");

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

        assert!(state
            .observe_delta("reasoning-1", " ")
            .expect("empty delta")
            .is_empty());
        assert!(state.finish("completed").expect("finish").is_empty());
    }

    #[test]
    fn builds_reasoning_delta_event() {
        let event = reasoning_delta_event("r1", "继续分析");

        assert_eq!(event.event_type, "reasoning.delta");
        assert_eq!(event.payload["itemId"], "r1");
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
