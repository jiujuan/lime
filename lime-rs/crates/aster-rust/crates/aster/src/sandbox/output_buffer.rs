//! 执行输出的有界捕获缓冲。

/// 单路输出在执行器边界最多保留的字节数。
pub const MAX_EXECUTOR_OUTPUT_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct CapturedOutput {
    pub text: String,
    pub bytes: usize,
    pub retained_bytes: usize,
    pub retained: Vec<u8>,
    pub omitted_bytes: usize,
    pub truncated: bool,
}

impl CapturedOutput {
    pub(crate) fn from_bytes(bytes: &[u8]) -> Self {
        let mut buffer = BoundedOutputBuffer::default();
        buffer.push_chunk(bytes);
        buffer.into_captured_output()
    }
}

#[derive(Debug, Clone)]
pub(crate) struct BoundedOutputBuffer {
    max_bytes: usize,
    head_budget: usize,
    tail_budget: usize,
    head: Vec<u8>,
    tail: Vec<u8>,
    total_bytes: usize,
    omitted_bytes: usize,
}

impl Default for BoundedOutputBuffer {
    fn default() -> Self {
        Self::new(MAX_EXECUTOR_OUTPUT_BYTES)
    }
}

impl BoundedOutputBuffer {
    pub(crate) fn new(max_bytes: usize) -> Self {
        let head_budget = max_bytes / 2;
        let tail_budget = max_bytes.saturating_sub(head_budget);
        Self {
            max_bytes,
            head_budget,
            tail_budget,
            head: Vec::new(),
            tail: Vec::new(),
            total_bytes: 0,
            omitted_bytes: 0,
        }
    }

    pub(crate) fn push_chunk(&mut self, chunk: &[u8]) {
        self.total_bytes = self.total_bytes.saturating_add(chunk.len());

        if self.max_bytes == 0 {
            self.omitted_bytes = self.omitted_bytes.saturating_add(chunk.len());
            return;
        }

        if self.head.len() < self.head_budget {
            let head_space = self.head_budget.saturating_sub(self.head.len());
            let head_len = head_space.min(chunk.len());
            if head_len > 0 {
                self.head.extend_from_slice(&chunk[..head_len]);
            }
            if head_len == chunk.len() {
                return;
            }
            self.push_tail(&chunk[head_len..]);
            return;
        }

        self.push_tail(chunk);
    }

    pub(crate) fn push_str(&mut self, value: &str) {
        self.push_chunk(value.as_bytes());
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.total_bytes == 0
    }

    pub(crate) fn ends_with_byte(&self, byte: u8) -> bool {
        self.tail
            .last()
            .or_else(|| self.head.last())
            .is_some_and(|last| *last == byte)
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.head.len().saturating_add(self.tail.len())
    }

    pub(crate) fn omitted_bytes(&self) -> usize {
        self.omitted_bytes
    }

    pub(crate) fn to_bytes(&self) -> Vec<u8> {
        let mut output = Vec::with_capacity(self.retained_bytes());
        output.extend_from_slice(&self.head);
        output.extend_from_slice(&self.tail);
        output
    }

    pub(crate) fn into_captured_output(self) -> CapturedOutput {
        let retained_bytes = self.retained_bytes();
        let retained = self.to_bytes();
        let omitted_bytes = self.omitted_bytes();
        let bytes = self.total_bytes;
        CapturedOutput {
            text: String::from_utf8_lossy(&retained).to_string(),
            bytes,
            retained_bytes,
            retained,
            omitted_bytes,
            truncated: omitted_bytes > 0,
        }
    }

    fn push_tail(&mut self, chunk: &[u8]) {
        if self.tail_budget == 0 {
            self.omitted_bytes = self.omitted_bytes.saturating_add(chunk.len());
            return;
        }

        self.tail.extend_from_slice(chunk);
        let excess = self.tail.len().saturating_sub(self.tail_budget);
        if excess == 0 {
            return;
        }

        self.tail.drain(..excess);
        self.omitted_bytes = self.omitted_bytes.saturating_add(excess);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_prefix_and_suffix_when_over_budget() {
        let mut buffer = BoundedOutputBuffer::new(10);

        buffer.push_chunk(b"0123456789");
        buffer.push_chunk(b"ab");

        let rendered = String::from_utf8_lossy(&buffer.to_bytes()).to_string();
        assert!(rendered.starts_with("01234"));
        assert!(rendered.ends_with("789ab"));
        assert_eq!(buffer.retained_bytes(), 10);
        assert_eq!(buffer.omitted_bytes(), 2);
    }

    #[test]
    fn max_bytes_zero_drops_everything() {
        let mut buffer = BoundedOutputBuffer::new(0);
        buffer.push_chunk(b"abc");

        assert_eq!(buffer.retained_bytes(), 0);
        assert_eq!(buffer.omitted_bytes(), 3);
        assert_eq!(buffer.to_bytes(), b"".to_vec());
    }

    #[test]
    fn one_byte_budget_keeps_only_last_byte() {
        let mut buffer = BoundedOutputBuffer::new(1);
        buffer.push_chunk(b"abc");

        assert_eq!(buffer.retained_bytes(), 1);
        assert_eq!(buffer.omitted_bytes(), 2);
        assert_eq!(buffer.to_bytes(), b"c".to_vec());
    }

    #[test]
    fn captured_output_reports_original_and_omitted_bytes() {
        let captured = CapturedOutput::from_bytes(b"0123456789ab");

        assert_eq!(captured.bytes, 12);
        assert_eq!(captured.retained_bytes, 12);
        assert_eq!(captured.omitted_bytes, 0);
        assert!(!captured.truncated);

        let captured = {
            let mut buffer = BoundedOutputBuffer::new(10);
            buffer.push_chunk(b"0123456789ab");
            buffer.into_captured_output()
        };

        assert_eq!(captured.bytes, 12);
        assert_eq!(captured.retained_bytes, 10);
        assert_eq!(captured.omitted_bytes, 2);
        assert!(captured.truncated);
        assert!(captured.text.starts_with("01234"));
        assert!(captured.text.ends_with("789ab"));
    }

    #[test]
    fn append_text_respects_tail_budget() {
        let mut buffer = BoundedOutputBuffer::new(10);
        buffer.push_chunk(b"0123456789");
        buffer.push_str("timeout");

        let captured = buffer.into_captured_output();
        assert!(captured.truncated);
        assert!(captured.text.ends_with("meout"));
    }
}
