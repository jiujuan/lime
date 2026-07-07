//! Runtime event stream materialization contract.
//!
//! Codex 的 current 主链把内部执行事件 materialize 成 Turn / Item 事件后再给
//! App Server / GUI / Evidence 消费；这里先固定 Lime current projector 契约，
//! 具体 Aster event 转换只能留在 compat adapter。

pub trait EventProjector<SourceEvent, RuntimeEvent> {
    fn project(&mut self, event: SourceEvent) -> Vec<RuntimeEvent>;
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TextProjector;

    impl EventProjector<&str, String> for TextProjector {
        fn project(&mut self, event: &str) -> Vec<String> {
            vec![event.trim().to_string()]
        }
    }

    #[test]
    fn event_projector_contract_is_source_agnostic() {
        let mut projector = TextProjector;

        assert_eq!(projector.project("  turn.item  "), vec!["turn.item"]);
    }
}
