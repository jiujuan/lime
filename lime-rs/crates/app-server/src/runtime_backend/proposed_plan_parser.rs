use super::plan_events;
use crate::RuntimeEvent;
#[cfg(test)]
use serde_json::json;
use serde_json::Value;
use std::collections::HashMap;

const OPEN_TAG: &str = "<proposed_plan>";
const CLOSE_TAG: &str = "</proposed_plan>";
const ANONYMOUS_MESSAGE_KEY: &str = "\0anonymous-message";

#[derive(Debug, Default)]
pub(super) struct ProposedPlanParser {
    messages: HashMap<String, MessageParser>,
    message_order: Vec<String>,
    plan_revision_index: usize,
    message_output_emitted: bool,
}

#[derive(Debug, Default)]
struct MessageParser {
    buffer: String,
    mode: ParserMode,
    plan_text: String,
    current_revision_id: Option<String>,
    message_output_emitted: bool,
    leading_message_whitespace: String,
    source_item_id: Option<String>,
    source_payload: Value,
}

#[derive(Debug, Default, PartialEq, Eq)]
enum ParserMode {
    #[default]
    OutsidePlan,
    InsidePlan,
}

#[derive(Debug, PartialEq, Eq)]
enum ProposedPlanSegment {
    MessageDelta(String),
    PlanDelta {
        revision_id: String,
        text: String,
        delta: String,
    },
    PlanFinal {
        revision_id: String,
        text: String,
    },
}

#[derive(Debug)]
pub(super) struct FinishedMessage {
    pub(super) events: Vec<RuntimeEvent>,
    pub(super) item_id: Option<String>,
    pub(super) has_message_output: bool,
}

impl ProposedPlanParser {
    #[cfg(test)]
    pub(super) fn has_message_output(&self) -> bool {
        self.message_output_emitted
    }

    pub(super) fn observe_message_start(&mut self, item_id: &str) {
        self.ensure_message(Some(item_id));
    }

    fn ensure_message(&mut self, item_id: Option<&str>) -> &mut MessageParser {
        let key = message_key(item_id);
        if !self.messages.contains_key(&key) {
            self.message_order.push(key.clone());
            self.messages.insert(
                key.clone(),
                MessageParser {
                    source_item_id: item_id.map(str::to_string),
                    ..MessageParser::default()
                },
            );
        }
        self.messages
            .get_mut(&key)
            .expect("message parser was inserted above")
    }

    fn push_runtime_text(
        &mut self,
        item_id: Option<&str>,
        text: &str,
        source_payload: &Value,
    ) -> Vec<RuntimeEvent> {
        let key = message_key(item_id);
        self.ensure_message(item_id);
        let plan_revision_index = &mut self.plan_revision_index;
        let message = self
            .messages
            .get_mut(&key)
            .expect("message parser was inserted above");
        message.source_payload = source_payload.clone();
        let segments = message.push_text(text, plan_revision_index);
        self.message_output_emitted |= message.message_output_emitted;
        segments_to_runtime_events(segments, item_id, source_payload)
    }

    fn finish_message(&mut self, item_id: Option<&str>) -> Result<FinishedMessage, String> {
        let key = message_key(item_id);
        let Some(mut message) = self.messages.remove(&key) else {
            return Err(format!(
                "provider Message Item {} ended without a matching start or delta",
                item_id.unwrap_or("<anonymous>")
            ));
        };
        self.message_order.retain(|candidate| candidate != &key);
        let segments = message.finish();
        self.message_output_emitted |= message.message_output_emitted;
        Ok(FinishedMessage {
            events: segments_to_runtime_events(
                segments,
                message.source_item_id.as_deref(),
                &message.source_payload,
            ),
            item_id: message.source_item_id,
            has_message_output: message.message_output_emitted,
        })
    }

    fn finish_messages(&mut self) -> Vec<FinishedMessage> {
        let order = std::mem::take(&mut self.message_order);
        order
            .into_iter()
            .filter_map(|key| {
                let mut message = self.messages.remove(&key)?;
                let segments = message.finish();
                self.message_output_emitted |= message.message_output_emitted;
                Some(FinishedMessage {
                    events: segments_to_runtime_events(
                        segments,
                        message.source_item_id.as_deref(),
                        &message.source_payload,
                    ),
                    item_id: message.source_item_id,
                    has_message_output: message.message_output_emitted,
                })
            })
            .collect()
    }

    #[cfg(test)]
    fn push_text(&mut self, text: &str) -> Vec<ProposedPlanSegment> {
        let key = message_key(None);
        self.ensure_message(None);
        let plan_revision_index = &mut self.plan_revision_index;
        let message = self
            .messages
            .get_mut(&key)
            .expect("anonymous parser was inserted above");
        let segments = message.push_text(text, plan_revision_index);
        self.message_output_emitted |= message.message_output_emitted;
        segments
    }

    #[cfg(test)]
    fn finish(&mut self) -> Vec<ProposedPlanSegment> {
        let key = message_key(None);
        let Some(mut message) = self.messages.remove(&key) else {
            return Vec::new();
        };
        self.message_order.retain(|candidate| candidate != &key);
        let segments = message.finish();
        self.message_output_emitted |= message.message_output_emitted;
        segments
    }
}

impl MessageParser {
    fn push_text(
        &mut self,
        text: &str,
        plan_revision_index: &mut usize,
    ) -> Vec<ProposedPlanSegment> {
        self.buffer.push_str(text);
        let mut segments = Vec::new();
        loop {
            let progressed = match self.mode {
                ParserMode::OutsidePlan => {
                    self.process_outside_plan(&mut segments, plan_revision_index)
                }
                ParserMode::InsidePlan => self.process_inside_plan(&mut segments),
            };
            if !progressed {
                break;
            }
        }
        segments
    }

    fn finish(&mut self) -> Vec<ProposedPlanSegment> {
        let mut segments = Vec::new();
        match self.mode {
            ParserMode::OutsidePlan => {
                let message = std::mem::take(&mut self.buffer);
                self.push_message_delta(&mut segments, message);
            }
            ParserMode::InsidePlan => {
                let pending = if CLOSE_TAG.starts_with(&self.buffer) {
                    self.buffer.clear();
                    String::new()
                } else {
                    std::mem::take(&mut self.buffer)
                };
                self.mode = ParserMode::OutsidePlan;
                if let Some(segment) = self.append_plan_delta(pending) {
                    segments.push(segment);
                }
            }
        }
        segments
    }

    fn process_outside_plan(
        &mut self,
        segments: &mut Vec<ProposedPlanSegment>,
        plan_revision_index: &mut usize,
    ) -> bool {
        if let Some(index) = self.buffer.find(OPEN_TAG) {
            let message = self.buffer[..index].to_string();
            self.buffer.drain(..index + OPEN_TAG.len());
            self.push_message_delta(segments, message);
            *plan_revision_index += 1;
            self.start_plan(format!("proposed_plan:{}", *plan_revision_index));
            return true;
        }

        let keep_len = longest_partial_tag_suffix(&self.buffer, OPEN_TAG);
        let emit_len = self.buffer.len().saturating_sub(keep_len);
        if emit_len == 0 {
            return false;
        }
        let message = self.buffer[..emit_len].to_string();
        self.buffer.drain(..emit_len);
        self.push_message_delta(segments, message);
        true
    }

    fn push_message_delta(&mut self, segments: &mut Vec<ProposedPlanSegment>, message: String) {
        if message.is_empty() {
            return;
        }
        if !self.message_output_emitted && message.chars().all(char::is_whitespace) {
            self.leading_message_whitespace.push_str(&message);
            return;
        }
        let message = if !self.message_output_emitted && !self.leading_message_whitespace.is_empty()
        {
            format!(
                "{}{}",
                std::mem::take(&mut self.leading_message_whitespace),
                message
            )
        } else {
            message
        };
        self.message_output_emitted = true;
        segments.push(ProposedPlanSegment::MessageDelta(message));
    }

    fn process_inside_plan(&mut self, segments: &mut Vec<ProposedPlanSegment>) -> bool {
        if let Some(index) = self.buffer.find(CLOSE_TAG) {
            let delta = self.buffer[..index].to_string();
            self.buffer.drain(..index + CLOSE_TAG.len());
            if let Some(segment) = self.append_plan_delta(delta) {
                segments.push(segment);
            }
            if let Some(segment) = self.finish_plan() {
                segments.push(segment);
            }
            return true;
        }

        let keep_len = longest_partial_tag_suffix(&self.buffer, CLOSE_TAG);
        let emit_len = self.buffer.len().saturating_sub(keep_len);
        if emit_len == 0 {
            return false;
        }
        let delta = self.buffer[..emit_len].to_string();
        self.buffer.drain(..emit_len);
        if let Some(segment) = self.append_plan_delta(delta) {
            segments.push(segment);
        }
        true
    }

    fn start_plan(&mut self, revision_id: String) {
        self.plan_text.clear();
        self.current_revision_id = Some(revision_id);
        self.mode = ParserMode::InsidePlan;
    }

    fn append_plan_delta(&mut self, delta: String) -> Option<ProposedPlanSegment> {
        if delta.is_empty() {
            return None;
        }
        self.plan_text.push_str(&delta);
        let text = self.plan_text.trim().to_string();
        if text.is_empty() {
            return None;
        }
        Some(ProposedPlanSegment::PlanDelta {
            revision_id: self.current_revision_id.clone()?,
            text,
            delta,
        })
    }

    fn finish_plan(&mut self) -> Option<ProposedPlanSegment> {
        self.mode = ParserMode::OutsidePlan;
        let revision_id = self.current_revision_id.take()?;
        let text = self.plan_text.trim().to_string();
        self.plan_text.clear();
        if text.is_empty() {
            return None;
        }
        Some(ProposedPlanSegment::PlanFinal { revision_id, text })
    }
}

pub(super) fn split_runtime_event(
    event: RuntimeEvent,
    parser: &mut ProposedPlanParser,
) -> Vec<RuntimeEvent> {
    if !matches!(
        event.event_type.as_str(),
        "message.delta" | "message.delta_batch" | "message.batch"
    ) {
        return vec![event];
    }
    let Some(text) = text_from_runtime_payload(&event.payload) else {
        return vec![event];
    };
    let item_id = runtime_item_id(&event.payload);
    parser.push_runtime_text(item_id, text, &event.payload)
}

pub(super) fn finish_runtime_message(
    parser: &mut ProposedPlanParser,
    item_id: &str,
) -> Result<FinishedMessage, String> {
    parser.finish_message(Some(item_id))
}

pub(super) fn finish_runtime_messages(parser: &mut ProposedPlanParser) -> Vec<FinishedMessage> {
    parser.finish_messages()
}

fn text_from_runtime_payload(payload: &Value) -> Option<&str> {
    payload
        .get("text")
        .or_else(|| payload.get("delta"))
        .or_else(|| payload.get("message"))
        .or_else(|| payload.get("content"))
        .and_then(Value::as_str)
}

fn runtime_item_id(payload: &Value) -> Option<&str> {
    ["itemId", "item_id", "messageId", "message_id", "id"]
        .into_iter()
        .find_map(|key| payload.get(key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn message_key(item_id: Option<&str>) -> String {
    item_id.unwrap_or(ANONYMOUS_MESSAGE_KEY).to_string()
}

fn segments_to_runtime_events(
    segments: Vec<ProposedPlanSegment>,
    source_item_id: Option<&str>,
    source_payload: &Value,
) -> Vec<RuntimeEvent> {
    segments
        .into_iter()
        .map(|segment| match segment {
            ProposedPlanSegment::MessageDelta(text) => {
                let mut payload = source_payload.as_object().cloned().unwrap_or_default();
                payload.insert("text".to_string(), Value::String(text));
                payload
                    .entry("backend".to_string())
                    .or_insert_with(|| Value::String("runtime".to_string()));
                payload
                    .entry("source".to_string())
                    .or_insert_with(|| Value::String("proposed_plan_parser".to_string()));
                if let Some(item_id) = source_item_id {
                    payload.insert("itemId".to_string(), Value::String(item_id.to_string()));
                }
                RuntimeEvent::new("message.delta", Value::Object(payload))
            }
            ProposedPlanSegment::PlanDelta {
                revision_id,
                text,
                delta,
            } => with_source_item_id(
                plan_events::proposed_plan_delta_event(text, delta, revision_id),
                source_item_id,
            ),
            ProposedPlanSegment::PlanFinal { revision_id, text } => with_source_item_id(
                plan_events::proposed_plan_final_event(text, revision_id),
                source_item_id,
            ),
        })
        .collect()
}

fn with_source_item_id(mut event: RuntimeEvent, source_item_id: Option<&str>) -> RuntimeEvent {
    if let (Some(source_item_id), Some(payload)) = (source_item_id, event.payload.as_object_mut()) {
        payload.insert(
            "sourceItemId".to_string(),
            Value::String(source_item_id.to_string()),
        );
    }
    event
}

fn longest_partial_tag_suffix(value: &str, tag: &str) -> usize {
    let max = value.len().min(tag.len().saturating_sub(1));
    (1..=max)
        .rev()
        .find(|length| value.ends_with(&tag[..*length]))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_closed_proposed_plan_from_message_text() {
        let mut parser = ProposedPlanParser::default();
        let first = parser.push_text("说明<proposed_plan>\n- 读");
        let second = parser.push_text("现状\n</proposed_plan>收尾");

        assert_eq!(
            first,
            vec![
                ProposedPlanSegment::MessageDelta("说明".to_string()),
                ProposedPlanSegment::PlanDelta {
                    revision_id: "proposed_plan:1".to_string(),
                    text: "- 读".to_string(),
                    delta: "\n- 读".to_string(),
                },
            ]
        );
        assert_eq!(
            second,
            vec![
                ProposedPlanSegment::PlanDelta {
                    revision_id: "proposed_plan:1".to_string(),
                    text: "- 读现状".to_string(),
                    delta: "现状\n".to_string(),
                },
                ProposedPlanSegment::PlanFinal {
                    revision_id: "proposed_plan:1".to_string(),
                    text: "- 读现状".to_string(),
                },
                ProposedPlanSegment::MessageDelta("收尾".to_string()),
            ]
        );
    }

    #[test]
    fn keeps_partial_tags_across_chunks() {
        let mut parser = ProposedPlanParser::default();
        let first = parser.push_text("说明<proposed");
        let second = parser.push_text("_plan>\n- 接线</proposed_plan>");

        assert_eq!(
            first,
            vec![ProposedPlanSegment::MessageDelta("说明".to_string())]
        );
        assert_eq!(
            second,
            vec![
                ProposedPlanSegment::PlanDelta {
                    revision_id: "proposed_plan:1".to_string(),
                    text: "- 接线".to_string(),
                    delta: "\n- 接线".to_string(),
                },
                ProposedPlanSegment::PlanFinal {
                    revision_id: "proposed_plan:1".to_string(),
                    text: "- 接线".to_string(),
                },
            ]
        );
    }

    #[test]
    fn finish_flushes_unclosed_plan_as_delta_only() {
        let mut parser = ProposedPlanParser::default();
        let events = parser.push_text("<proposed_plan>\n- 未闭合");
        let finished = parser.finish();

        assert_eq!(
            events,
            vec![ProposedPlanSegment::PlanDelta {
                revision_id: "proposed_plan:1".to_string(),
                text: "- 未闭合".to_string(),
                delta: "\n- 未闭合".to_string(),
            }]
        );
        assert!(finished.is_empty());
    }

    #[test]
    fn finish_ignores_partial_close_tag_suffix() {
        let mut parser = ProposedPlanParser::default();
        let events = parser.push_text("<proposed_plan>\n- 计划</proposed");
        let finished = parser.finish();

        assert_eq!(
            events,
            vec![ProposedPlanSegment::PlanDelta {
                revision_id: "proposed_plan:1".to_string(),
                text: "- 计划".to_string(),
                delta: "\n- 计划".to_string(),
            }]
        );
        assert!(finished.is_empty());
    }

    #[test]
    fn split_runtime_event_converts_plan_segments_to_runtime_events() {
        let mut parser = ProposedPlanParser::default();
        let events = split_runtime_event(
            RuntimeEvent::new(
                "message.delta",
                json!({ "text": "说明<proposed_plan>\n- 计划</proposed_plan>" }),
            ),
            &mut parser,
        );

        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec!["message.delta", "plan.delta", "plan.final"]
        );
        assert_eq!(events[0].payload["text"], "说明");
        assert_eq!(events[1].payload["source"], "proposed_plan");
        assert_eq!(events[2].payload["plan"][0]["step"], "计划");
        assert!(parser.has_message_output());
    }

    #[test]
    fn plan_only_output_does_not_create_an_agent_message_lifecycle() {
        let mut parser = ProposedPlanParser::default();
        let events = split_runtime_event(
            RuntimeEvent::new(
                "message.delta",
                json!({ "text": "<proposed_plan>\n- 计划</proposed_plan>" }),
            ),
            &mut parser,
        );

        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec!["plan.delta", "plan.final"]
        );
        assert!(!parser.has_message_output());
    }

    #[test]
    fn plan_only_output_discards_surrounding_whitespace_message_deltas() {
        let mut parser = ProposedPlanParser::default();
        let mut events = split_runtime_event(
            RuntimeEvent::new(
                "message.delta",
                json!({ "text": "\n  <proposed_plan>\n- 计划</proposed_plan>\n  " }),
            ),
            &mut parser,
        );
        for message in finish_runtime_messages(&mut parser) {
            events.extend(message.events);
        }

        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec!["plan.delta", "plan.final"]
        );
        assert!(!parser.has_message_output());
    }

    #[test]
    fn buffered_plan_prefix_whitespace_is_emitted_with_later_assistant_text() {
        let mut parser = ProposedPlanParser::default();
        let events = split_runtime_event(
            RuntimeEvent::new(
                "message.delta",
                json!({ "text": "\n<proposed_plan>\n- 计划</proposed_plan>\n完成" }),
            ),
            &mut parser,
        );

        assert_eq!(events.len(), 3);
        assert_eq!(events[2].event_type, "message.delta");
        assert_eq!(events[2].payload["text"], "\n\n完成");
        assert!(parser.has_message_output());
    }

    #[test]
    fn keeps_partial_plan_buffers_and_message_identity_isolated_by_item() {
        let mut parser = ProposedPlanParser::default();
        let first = split_runtime_event(
            RuntimeEvent::new(
                "message.delta",
                json!({
                    "itemId": "message-1",
                    "phase": "final_answer",
                    "text": "<proposed",
                }),
            ),
            &mut parser,
        );
        let second = split_runtime_event(
            RuntimeEvent::new(
                "message.delta",
                json!({
                    "itemId": "message-2",
                    "phase": "final_answer",
                    "text": "answer",
                }),
            ),
            &mut parser,
        );
        let third = split_runtime_event(
            RuntimeEvent::new(
                "message.delta",
                json!({
                    "itemId": "message-1",
                    "phase": "final_answer",
                    "text": "_plan>\n- inspect</proposed_plan>",
                }),
            ),
            &mut parser,
        );

        assert!(first.is_empty());
        assert_eq!(second.len(), 1);
        assert_eq!(second[0].event_type, "message.delta");
        assert_eq!(second[0].payload["itemId"], "message-2");
        assert_eq!(second[0].payload["phase"], "final_answer");
        assert_eq!(third.len(), 2);
        assert_eq!(third[0].event_type, "plan.delta");
        assert_eq!(third[1].event_type, "plan.final");
        assert_eq!(third[0].payload["sourceItemId"], "message-1");
        assert_eq!(third[0].payload["revisionId"], "proposed_plan:1");

        let message_2 = finish_runtime_message(&mut parser, "message-2")
            .expect("message-2 should finish independently");
        let message_1 = finish_runtime_message(&mut parser, "message-1")
            .expect("message-1 should finish independently");
        assert!(message_2.has_message_output);
        assert!(!message_1.has_message_output);
    }
}
