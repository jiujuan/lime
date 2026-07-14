use super::plan_events;
use crate::RuntimeEvent;
use serde_json::{json, Value};

const OPEN_TAG: &str = "<proposed_plan>";
const CLOSE_TAG: &str = "</proposed_plan>";

#[derive(Debug, Default)]
pub(super) struct ProposedPlanParser {
    buffer: String,
    mode: ParserMode,
    plan_text: String,
    plan_revision_index: usize,
    current_revision_id: Option<String>,
    message_output_emitted: bool,
    leading_message_whitespace: String,
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

impl ProposedPlanParser {
    pub(super) fn has_message_output(&self) -> bool {
        self.message_output_emitted
    }

    fn push_text(&mut self, text: &str) -> Vec<ProposedPlanSegment> {
        self.buffer.push_str(text);
        let mut segments = Vec::new();
        loop {
            let progressed = match self.mode {
                ParserMode::OutsidePlan => self.process_outside_plan(&mut segments),
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

    fn process_outside_plan(&mut self, segments: &mut Vec<ProposedPlanSegment>) -> bool {
        if let Some(index) = self.buffer.find(OPEN_TAG) {
            let message = self.buffer[..index].to_string();
            self.buffer.drain(..index + OPEN_TAG.len());
            self.push_message_delta(segments, message);
            self.start_plan();
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

    fn start_plan(&mut self) {
        self.plan_revision_index += 1;
        self.plan_text.clear();
        self.current_revision_id = Some(format!("proposed_plan:{}", self.plan_revision_index));
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
    let segments = parser.push_text(text);
    segments_to_runtime_events(segments)
}

pub(super) fn finish_runtime_events(parser: &mut ProposedPlanParser) -> Vec<RuntimeEvent> {
    let segments = parser.finish();
    segments_to_runtime_events(segments)
}

fn text_from_runtime_payload(payload: &Value) -> Option<&str> {
    payload
        .get("text")
        .or_else(|| payload.get("delta"))
        .or_else(|| payload.get("message"))
        .or_else(|| payload.get("content"))
        .and_then(Value::as_str)
}

fn segments_to_runtime_events(segments: Vec<ProposedPlanSegment>) -> Vec<RuntimeEvent> {
    segments
        .into_iter()
        .map(|segment| match segment {
            ProposedPlanSegment::MessageDelta(text) => RuntimeEvent::new(
                "message.delta",
                json!({
                    "text": text,
                    "backend": "runtime",
                    "source": "proposed_plan_parser",
                }),
            ),
            ProposedPlanSegment::PlanDelta {
                revision_id,
                text,
                delta,
            } => plan_events::proposed_plan_delta_event(text, delta, revision_id),
            ProposedPlanSegment::PlanFinal { revision_id, text } => {
                plan_events::proposed_plan_final_event(text, revision_id)
            }
        })
        .collect()
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
        events.extend(finish_runtime_events(&mut parser));

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
}
