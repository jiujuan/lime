use crate::RuntimeEvent;
use serde_json::json;
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Default)]
pub struct ReasoningEventState {
    items: HashMap<String, ReasoningItemState>,
    item_order: Vec<String>,
}

#[derive(Debug, Default)]
struct ReasoningItemState {
    started: bool,
    ended: bool,
    summary: BTreeMap<i64, String>,
    content: BTreeMap<i64, String>,
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
    summary: Vec<String>,
    content: Vec<String>,
) -> RuntimeEvent {
    let reasoning_id = reasoning_id.into();
    let text = if summary.is_empty() {
        content.concat()
    } else {
        summary.concat()
    };
    RuntimeEvent::new(
        "reasoning.final",
        json!({
            "itemId": reasoning_id.clone(),
            "reasoningId": reasoning_id,
            "text": text,
            "summary": summary,
            "content": content,
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

    pub fn observe_summary_delta(
        &mut self,
        item_id: &str,
        delta: &str,
        summary_index: i64,
    ) -> Result<Vec<RuntimeEvent>, String> {
        self.observe_part(item_id, delta, ReasoningPart::Summary(summary_index))
    }

    pub fn observe_summary_part_added(
        &mut self,
        item_id: &str,
        summary_index: i64,
    ) -> Result<Vec<RuntimeEvent>, String> {
        self.start(item_id)?;
        let item = self
            .items
            .get_mut(item_id)
            .expect("reasoning item was inserted above");
        if item.ended {
            return Err(format!(
                "Reasoning Item {item_id} received a summary part after completion"
            ));
        }
        item.summary.entry(summary_index).or_default();
        if item.started {
            return Ok(Vec::new());
        }
        item.started = true;
        Ok(vec![reasoning_started_event(item_id)])
    }

    pub fn observe_content_delta(
        &mut self,
        item_id: &str,
        delta: &str,
        content_index: i64,
    ) -> Result<Vec<RuntimeEvent>, String> {
        self.observe_part(item_id, delta, ReasoningPart::Content(content_index))
    }

    fn observe_part(
        &mut self,
        item_id: &str,
        delta: &str,
        part: ReasoningPart,
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
        let target = match part {
            ReasoningPart::Summary(index) => item.summary.entry(index).or_default(),
            ReasoningPart::Content(index) => item.content.entry(index).or_default(),
        };
        target.push_str(delta);
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
        let summary = non_empty_parts(&item.summary);
        let content = non_empty_parts(&item.content);
        if !summary.is_empty() || !content.is_empty() {
            events.push(reasoning_final_event(item_id, summary, content));
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

#[derive(Clone, Copy)]
enum ReasoningPart {
    Summary(i64),
    Content(i64),
}

fn non_empty_parts(parts: &BTreeMap<i64, String>) -> Vec<String> {
    parts
        .values()
        .filter(|part| !part.trim().is_empty())
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emits_start_once_and_final_end_on_finish() {
        let mut state = ReasoningEventState::default();

        let first = state
            .observe_summary_delta("reasoning-1", "先理解", 0)
            .expect("first delta");
        let second = state
            .observe_summary_delta("reasoning-1", "目标", 0)
            .expect("second delta");
        let finished = state.finish("completed").expect("finish");

        assert_eq!(first.len(), 1);
        assert_eq!(first[0].event_type, "reasoning.started");
        assert!(second.is_empty());
        assert_eq!(finished.len(), 2);
        assert_eq!(finished[0].event_type, "reasoning.final");
        assert_eq!(finished[0].payload["text"], "先理解目标");
        assert_eq!(finished[0].payload["summary"], json!(["先理解目标"]));
        assert_eq!(finished[0].payload["content"], json!([]));
        assert_eq!(finished[1].event_type, "reasoning.ended");
        assert_eq!(finished[1].payload["status"], "completed");
    }

    #[test]
    fn empty_delta_does_not_start_reasoning() {
        let mut state = ReasoningEventState::default();

        assert!(state
            .observe_summary_delta("reasoning-1", " ", 0)
            .expect("empty delta")
            .is_empty());
        assert!(state.finish("completed").expect("finish").is_empty());
    }

    #[test]
    fn repeated_reasoning_fragments_are_preserved_verbatim() {
        let mut state = ReasoningEventState::default();

        state
            .observe_content_delta("reasoning-1", "你", 0)
            .expect("first content delta");
        state
            .observe_content_delta("reasoning-1", "好你", 0)
            .expect("second content delta");
        let finished = state.finish("completed").expect("finish");

        assert_eq!(finished[0].payload["content"], json!(["你好你"]));
    }

    #[test]
    fn indexed_reasoning_parts_are_materialized_in_index_order() {
        let mut state = ReasoningEventState::default();

        state
            .observe_summary_part_added("reasoning-1", 1)
            .expect("second summary part");
        state
            .observe_summary_delta("reasoning-1", "第二段", 1)
            .expect("second summary delta");
        state
            .observe_summary_delta("reasoning-1", "第一段", 0)
            .expect("first summary delta");
        state
            .observe_content_delta("reasoning-1", "raw-2", 2)
            .expect("second raw content");
        state
            .observe_content_delta("reasoning-1", "raw-0", 0)
            .expect("first raw content");
        let finished = state.finish("completed").expect("finish");

        assert_eq!(finished[0].payload["summary"], json!(["第一段", "第二段"]));
        assert_eq!(finished[0].payload["content"], json!(["raw-0", "raw-2"]));
    }

    #[test]
    fn builds_reasoning_final_skeleton_event() {
        let event =
            reasoning_final_event("r1", vec!["摘要".to_string()], vec!["原始推理".to_string()]);

        assert_eq!(event.event_type, "reasoning.final");
        assert_eq!(event.payload["reasoningId"], "r1");
        assert_eq!(event.payload["text"], "摘要");
        assert_eq!(event.payload["summary"], json!(["摘要"]));
        assert_eq!(event.payload["content"], json!(["原始推理"]));
    }
}
