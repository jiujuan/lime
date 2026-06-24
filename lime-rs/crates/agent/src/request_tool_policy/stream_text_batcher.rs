use crate::protocol::{AgentEvent as RuntimeAgentEvent, TextDeltaBatchBoundary};

pub(crate) const TEXT_DELTA_BATCH_BACKLOG_CHARS: usize = 120;

#[derive(Debug, Default)]
pub(crate) struct TextDeltaBatcher {
    chunks: Vec<String>,
    text: String,
    has_flushed_first_delta: bool,
}

impl TextDeltaBatcher {
    pub(crate) fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    pub(crate) fn push(&mut self, text: String) -> Option<RuntimeAgentEvent> {
        if text.is_empty() {
            return None;
        }

        let boundary = if text.contains('\n') {
            Some(TextDeltaBatchBoundary::Newline)
        } else {
            None
        };
        self.text.push_str(&text);
        self.chunks.push(text);

        if !self.has_flushed_first_delta {
            self.has_flushed_first_delta = true;
            return self.flush(TextDeltaBatchBoundary::Provider);
        }

        let boundary = boundary.or_else(|| {
            (self.text.chars().count() >= TEXT_DELTA_BATCH_BACKLOG_CHARS)
                .then_some(TextDeltaBatchBoundary::Backlog)
        });
        boundary.and_then(|boundary| self.flush(boundary))
    }

    pub(crate) fn flush(&mut self, boundary: TextDeltaBatchBoundary) -> Option<RuntimeAgentEvent> {
        if self.is_empty() {
            return None;
        }

        let text = std::mem::take(&mut self.text);
        let chunks = std::mem::take(&mut self.chunks);
        Some(RuntimeAgentEvent::TextDeltaBatch {
            text,
            chunks,
            boundary,
        })
    }
}

pub(crate) fn emit_text_delta_batch<F>(
    batcher: &mut TextDeltaBatcher,
    boundary: TextDeltaBatchBoundary,
    emitted_any: &mut bool,
    on_event: &mut F,
) where
    F: FnMut(&RuntimeAgentEvent),
{
    if let Some(event) = batcher.flush(boundary) {
        *emitted_any = true;
        on_event(&event);
    }
}
