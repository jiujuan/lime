//! Reply loop 的 current Turn 规则骨架。
//!
//! 这里只保存 provider/reply loop 的纯状态和退出文案，不引入具体
//! provider、tool、session store 或 Aster 事件类型。

pub const DEFAULT_MAX_REPLY_TURNS: u32 = 1000;
pub const MAX_REPLY_TURNS_REACHED_MESSAGE: &str =
    "I've reached the maximum number of actions I can do without user input. Would you like me to continue?";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeReplyLoop {
    attempts_taken: u32,
    max_turns: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeReplyLoopStep {
    Continue { attempt: u32 },
    MaxTurnsReached { attempt: u32, max_turns: u32 },
}

impl RuntimeReplyLoop {
    pub fn new(max_turns: Option<u32>) -> Self {
        Self {
            attempts_taken: 0,
            max_turns: max_turns.unwrap_or(DEFAULT_MAX_REPLY_TURNS),
        }
    }

    pub fn max_turns(&self) -> u32 {
        self.max_turns
    }

    pub fn attempts_taken(&self) -> u32 {
        self.attempts_taken
    }

    pub fn next_attempt(&mut self) -> RuntimeReplyLoopStep {
        self.attempts_taken = self.attempts_taken.saturating_add(1);
        if self.attempts_taken > self.max_turns {
            return RuntimeReplyLoopStep::MaxTurnsReached {
                attempt: self.attempts_taken,
                max_turns: self.max_turns,
            };
        }

        RuntimeReplyLoopStep::Continue {
            attempt: self.attempts_taken,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_default_max_turns() {
        let loop_state = RuntimeReplyLoop::new(None);

        assert_eq!(loop_state.max_turns(), DEFAULT_MAX_REPLY_TURNS);
        assert_eq!(loop_state.attempts_taken(), 0);
    }

    #[test]
    fn yields_attempt_until_max_is_reached() {
        let mut loop_state = RuntimeReplyLoop::new(Some(2));

        assert_eq!(
            loop_state.next_attempt(),
            RuntimeReplyLoopStep::Continue { attempt: 1 }
        );
        assert_eq!(
            loop_state.next_attempt(),
            RuntimeReplyLoopStep::Continue { attempt: 2 }
        );
        assert_eq!(
            loop_state.next_attempt(),
            RuntimeReplyLoopStep::MaxTurnsReached {
                attempt: 3,
                max_turns: 2
            }
        );
    }
}
