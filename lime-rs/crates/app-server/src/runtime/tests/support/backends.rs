use super::super::*;

use std::sync::atomic::{AtomicUsize, Ordering};

pub(in crate::runtime::tests) struct CompletedBackend;

#[async_trait]
impl ExecutionBackend for CompletedBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new(
            "message.delta",
            json!({ "text": "你好！有什么可以帮你的吗？" }),
        ))?;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

pub(in crate::runtime::tests) struct ToolReadModelBackend;

#[async_trait]
impl ExecutionBackend for ToolReadModelBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new(
            "tool.started",
            json!({
                "toolName": "WebFetch",
            }),
        ))?;
        sink.emit(RuntimeEvent::new(
            "tool.result",
            json!({
                "toolName": "WebFetch",
                "output": "fetched https://example.com",
            }),
        ))?;
        sink.emit(RuntimeEvent::new(
            "tool.started",
            json!({
                "toolCallId": "search-call-1",
                "toolName": "WebSearch",
            }),
        ))?;
        sink.emit(RuntimeEvent::new(
            "tool.result",
            json!({
                "toolCallId": "search-call-1",
                "toolName": "WebSearch",
                "outputPreview": "search results",
            }),
        ))?;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

pub(in crate::runtime::tests) struct PartialFailureBackend;

#[async_trait]
impl ExecutionBackend for PartialFailureBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        Err(RuntimeCoreError::Backend(
            "provider stream timed out after 60s".to_string(),
        ))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

pub(in crate::runtime::tests) struct FailBeforeEmitBackend {
    pub(in crate::runtime::tests) start_count: AtomicUsize,
}

#[async_trait]
impl ExecutionBackend for FailBeforeEmitBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        if self.start_count.fetch_add(1, Ordering::SeqCst) == 0 {
            return sink.emit(RuntimeEvent::new("turn.accepted", json!({})));
        }
        Err(RuntimeCoreError::Backend(
            "backend unavailable before turn start".to_string(),
        ))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

pub(in crate::runtime::tests) struct HangingCancelBackend {
    pub(in crate::runtime::tests) cancel_count: AtomicUsize,
}

#[async_trait]
impl ExecutionBackend for HangingCancelBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.cancel_count.fetch_add(1, Ordering::SeqCst);
        std::future::pending::<()>().await;
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

pub(in crate::runtime::tests) struct FinalDoneRecordingBackend {
    pub(in crate::runtime::tests) requests: Mutex<Vec<ExecutionRequest>>,
}

#[async_trait]
impl ExecutionBackend for FinalDoneRecordingBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .push(request);
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

#[derive(Default)]
pub(in crate::runtime::tests) struct RecordingBackend {
    pub(in crate::runtime::tests) requests: Mutex<Vec<ExecutionRequest>>,
}

#[async_trait]
impl ExecutionBackend for RecordingBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .push(request);
        sink.emit(RuntimeEvent::new("turn.accepted", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}
