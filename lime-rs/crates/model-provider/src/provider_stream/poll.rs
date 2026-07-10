use std::time::Duration;

pub const PROVIDER_STREAM_CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(100);
pub const PROVIDER_STREAM_CANCEL_WHILE_WAITING_REASON: &str =
    "cancelled_while_waiting_provider_stream";
pub const PROVIDER_STREAM_CANCEL_BEFORE_EVENT_REASON: &str =
    "cancelled_before_provider_event_processing";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProviderStreamCancelReason {
    WhileWaiting,
    BeforeEventProcessing,
}

impl ProviderStreamCancelReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::WhileWaiting => PROVIDER_STREAM_CANCEL_WHILE_WAITING_REASON,
            Self::BeforeEventProcessing => PROVIDER_STREAM_CANCEL_BEFORE_EVENT_REASON,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProviderStreamPoll<T> {
    Item(T),
    End,
    Pending,
    Canceled(ProviderStreamCancelReason),
}

pub fn provider_stream_cancel_poll_interval(cancelable: bool) -> Option<Duration> {
    cancelable.then_some(PROVIDER_STREAM_CANCEL_POLL_INTERVAL)
}

pub fn provider_stream_timeout_poll<T>(cancelled: bool) -> ProviderStreamPoll<T> {
    if cancelled {
        ProviderStreamPoll::Canceled(ProviderStreamCancelReason::WhileWaiting)
    } else {
        ProviderStreamPoll::Pending
    }
}

pub fn provider_stream_event_poll<T>(next: Option<T>, cancelled: bool) -> ProviderStreamPoll<T> {
    match (next, cancelled) {
        (None, _) => ProviderStreamPoll::End,
        (Some(_), true) => {
            ProviderStreamPoll::Canceled(ProviderStreamCancelReason::BeforeEventProcessing)
        }
        (Some(item), false) => ProviderStreamPoll::Item(item),
    }
}
