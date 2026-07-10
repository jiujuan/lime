use std::fmt::Display;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RuntimeReplyProviderStreamProgress {
    first_event_seen: bool,
    first_content_seen: bool,
    first_text_delta_seen: bool,
}

impl RuntimeReplyProviderStreamProgress {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn first_event_seen(&self) -> bool {
        self.first_event_seen
    }

    pub fn first_content_seen(&self) -> bool {
        self.first_content_seen
    }

    pub fn first_text_delta_seen(&self) -> bool {
        self.first_text_delta_seen
    }

    pub fn note_first_event(&mut self) -> bool {
        if self.first_event_seen {
            return false;
        }
        self.first_event_seen = true;
        true
    }

    pub fn note_first_content(&mut self, content_available: bool) -> bool {
        if !content_available || self.first_content_seen {
            return false;
        }
        self.first_content_seen = true;
        true
    }

    pub fn note_first_text_delta(&mut self, text_chars: Option<usize>) -> Option<usize> {
        if self.first_text_delta_seen {
            return None;
        }
        let text_chars = text_chars?;
        self.first_text_delta_seen = true;
        Some(text_chars)
    }

    pub fn should_retry_empty_first_content(&self, error: impl Display) -> bool {
        super::provider_stream_should_retry_empty_first_content(self.first_content_seen, error)
    }
}
